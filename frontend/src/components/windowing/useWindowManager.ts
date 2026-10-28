import { createStore } from 'solid-js/store';
import { Accessor, createSignal } from 'solid-js';
import {
  WindowManagerState,
  WindowRect,
  PanelWindowState,
  SnapState,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  SNAP_THRESHOLD_TOP,
  SNAP_THRESHOLD_BOTTOM,
  SNAP_THRESHOLD_LEFT,
  SNAP_THRESHOLD_RIGHT,
  createDefaultWindowState,
} from './window-types';
import type { PanelLayoutJson } from '../../types';

interface PanelDef {
  id: string;
  title: string;
  defaultVisible: boolean;
  defaultPosition?: Partial<WindowRect>;
}

interface SnapPreview {
  snapState: SnapState;
  rect: WindowRect;
}

export function useWindowManager(
  panelDefs: PanelDef[],
  workspaceRef: Accessor<HTMLElement | null>
) {
  const [state, setState] = createStore<WindowManagerState>({
    panels: {},
    nextZIndex: 100,
  });

  const [snapPreview, setSnapPreview] = createSignal<SnapPreview | null>(null);
  const [layoutRevision, setLayoutRevision] = createSignal(0);
  const [draggingPanelId, setDraggingPanelId] = createSignal<string | null>(null);
  const [dragOffset, setDragOffset] = createSignal({ x: 0, y: 0 });
  const [resizingPanelId, setResizingPanelId] = createSignal<string | null>(null);
  const [resizeDirection, setResizeDirection] = createSignal<string | null>(null);

  let globalDragCleanup: (() => void) | null = null;
  let globalResizeCleanup: (() => void) | null = null;
  let _wsRectCache: WindowRect = { x: 0, y: 0, width: 0, height: 0 };
  let _wsViewportCache = { left: 0, top: 0 };
  let _dragRafPending = false;
  let _lastDragPos: { clientX: number; clientY: number } | null = null;
  let followsWorkspaceSize = false;

  // Initialize panels
  for (const def of panelDefs) {
    const defaultPos = def.defaultPosition ?? {
      x: 200 + Object.keys(state.panels).length * 30,
      y: 100 + Object.keys(state.panels).length * 30,
      width: 500,
      height: 400,
    };
    setState('panels', def.id, {
      id: def.id,
      title: def.title,
      visible: def.defaultVisible,
      window: createDefaultWindowState(defaultPos),
      zIndex: 100 + Object.keys(state.panels).length,
      defaultPosition: {
        x: defaultPos.x ?? 200,
        y: defaultPos.y ?? 100,
        width: defaultPos.width ?? 500,
        height: defaultPos.height ?? 400,
      },
    } as PanelWindowState);
  }

  // nextZIndex starts after all initialized panels
  setState('nextZIndex', 200);

  function getWorkspaceRect(): WindowRect {
    const el = workspaceRef();
    if (!el) return { x: 0, y: 0, width: 1200, height: 800 };
    const r = el.getBoundingClientRect();
    return { x: 0, y: 0, width: r.width, height: r.height };
  }

  function getWorkspaceViewportOffset(): { left: number; top: number } {
    const el = workspaceRef();
    if (!el) return { left: 0, top: 0 };
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top };
  }

  function bringToFront(id: string) {
    const p = state.panels[id];
    if (!p) return;
    const sorted = Object.values(state.panels)
      .filter((panel) => panel.visible)
      .sort((a, b) => a['zIndex'] - b['zIndex']);
    const topPanel = sorted[sorted.length - 1];
    if (topPanel && topPanel['id'] === id) return;
    setState('panels', id, 'zIndex', state.nextZIndex);
    setState('nextZIndex', v => v + 1);
  }

  function getPanelLayouts(): PanelLayoutJson[] {
    return Object.values(state.panels).map(panel => ({
      id: panel.id,
      visible: panel.visible,
      minimized: panel.window.minimized,
      x: panel.window.rect.x,
      y: panel.window.rect.y,
      width: panel.window.rect.width,
      height: panel.window.rect.height,
      zIndex: panel.zIndex,
    }));
  }

  function restorePanelLayouts(layouts: PanelLayoutJson[]) {
    followsWorkspaceSize = false;
    const savedById = new Map(layouts.map(layout => [layout.id, layout]));
    let maxZIndex = 100;

    for (const def of panelDefs) {
      const panel = state.panels[def.id];
      const saved = savedById.get(def.id);
      if (saved && [saved.x, saved.y, saved.width, saved.height, saved.zIndex].every(Number.isFinite)) {
        setState('panels', def.id, {
          ...panel,
          visible: saved.visible,
          window: {
            ...panel.window,
            rect: {
              x: saved.x,
              y: saved.y,
              width: Math.max(saved.width, MIN_WINDOW_WIDTH),
              height: Math.max(saved.height, MIN_WINDOW_HEIGHT),
            },
            minimized: saved.minimized,
            snapState: 'floating',
            preMaximize: null,
            preSnap: null,
          },
          zIndex: saved.zIndex,
        });
        maxZIndex = Math.max(maxZIndex, saved.zIndex);
      } else {
        const defaultPos = def.defaultPosition ?? panel.defaultPosition;
        const defaultZIndex = 100 + panelDefs.indexOf(def);
        setState('panels', def.id, {
          ...panel,
          visible: def.defaultVisible,
          window: createDefaultWindowState(defaultPos),
          zIndex: defaultZIndex,
        });
        maxZIndex = Math.max(maxZIndex, defaultZIndex);
      }
    }

    setState('nextZIndex', maxZIndex + 1);
  }

  function resetToNewProjectLayout() {
    followsWorkspaceSize = true;
    const workspace = getWorkspaceRect();
    const resourceManager = state.panels['resource-manager'];
    const frameMonitor = state.panels['frame-monitor'];
    if (!resourceManager || !frameMonitor) return;

    for (const def of panelDefs) {
      const panel = state.panels[def.id];
      setState('panels', def.id, {
        ...panel,
        visible: false,
        window: createDefaultWindowState(def.defaultPosition ?? panel.defaultPosition),
        zIndex: 100 + panelDefs.indexOf(def),
      });
    }

    setState('panels', 'resource-manager', {
      ...state.panels['resource-manager'],
      visible: true,
      window: {
        ...state.panels['resource-manager'].window,
        rect: { x: 0, y: 0, width: 280, height: workspace.height },
        minimized: false,
        snapState: 'floating',
        preMaximize: null,
        preSnap: null,
      },
      zIndex: 100,
    });
    setState('panels', 'frame-monitor', {
      ...state.panels['frame-monitor'],
      visible: true,
      window: {
        ...state.panels['frame-monitor'].window,
        rect: {
          x: 280,
          y: 0,
          width: Math.max(MIN_WINDOW_WIDTH, workspace.width - 280),
          height: workspace.height,
        },
        minimized: false,
        snapState: 'floating',
        preMaximize: null,
        preSnap: null,
      },
      zIndex: 101,
    });
    setState('nextZIndex', 102);
    setLayoutRevision(v => v + 1);
  }

  function syncNewProjectLayoutToWorkspace() {
    if (!followsWorkspaceSize) return;
    const workspace = getWorkspaceRect();
    setState('panels', 'resource-manager', 'window', 'rect', {
      x: 0,
      y: 0,
      width: 280,
      height: workspace.height,
    });
    setState('panels', 'frame-monitor', 'window', 'rect', {
      x: 280,
      y: 0,
      width: Math.max(MIN_WINDOW_WIDTH, workspace.width - 280),
      height: workspace.height,
    });
    setLayoutRevision(v => v + 1);
  }

  const isPanelVisible = (id: string): boolean => {
    const p = state.panels[id];
    return p ? p.visible : false;
  };

  const openPanel = (id: string) => {
    const p = state.panels[id];
    if (!p) return;
    setState('panels', id, 'visible', true);
    setState('panels', id, 'window', 'minimized', false);
    bringToFront(id);
    setLayoutRevision(v => v + 1);
  };

  const closePanel = (id: string) => {
    const p = state.panels[id];
    if (!p) return;
    setState('panels', id, 'visible', false);
    setLayoutRevision(v => v + 1);
  };

  const togglePanel = (id: string) => {
    const p = state.panels[id];
    if (!p) return;
    if (p.visible && !p.window.minimized) {
      bringToFront(id);
    } else {
      openPanel(id);
    }
  };

  const setActivePanel = (id: string) => {
    const p = state.panels[id];
    if (!p || !p.visible) return;
    setState('panels', id, 'window', 'minimized', false);
    bringToFront(id);
  };

  function getSnapFromCursor(
    wsX: number,
    wsY: number,
    workspace: WindowRect
  ): SnapState {
    const nearLeft = wsX < SNAP_THRESHOLD_LEFT;
    const nearRight = wsX > workspace.width - SNAP_THRESHOLD_RIGHT;
    const nearTop = wsY < SNAP_THRESHOLD_TOP;
    const nearBottom = wsY > workspace.height - SNAP_THRESHOLD_BOTTOM;

    if (nearLeft && nearTop) return 'snapped-top-left';
    if (nearRight && nearTop) return 'snapped-top-right';
    if (nearLeft && nearBottom) return 'snapped-bottom-left';
    if (nearRight && nearBottom) return 'snapped-bottom-right';
    if (nearLeft) return 'snapped-left';
    if (nearRight) return 'snapped-right';
    if (nearTop) return 'snapped-top';
    if (nearBottom) return 'snapped-bottom';
    return 'floating';
  }

  function getSnapRect(snapState: SnapState, workspace: WindowRect): WindowRect {
    const w = workspace.width;
    const h = workspace.height;
    switch (snapState) {
      case 'snapped-left':
        return { x: 0, y: 0, width: w / 2, height: h };
      case 'snapped-right':
        return { x: w / 2, y: 0, width: w / 2, height: h };
      case 'snapped-top':
        return { x: 0, y: 0, width: w, height: h / 2 };
      case 'snapped-bottom':
        return { x: 0, y: h / 2, width: w, height: h / 2 };
      case 'snapped-top-left':
        return { x: 0, y: 0, width: w / 2, height: h / 2 };
      case 'snapped-top-right':
        return { x: w / 2, y: 0, width: w / 2, height: h / 2 };
      case 'snapped-bottom-left':
        return { x: 0, y: h / 2, width: w / 2, height: h / 2 };
      case 'snapped-bottom-right':
        return { x: w / 2, y: h / 2, width: w / 2, height: h / 2 };
      default:
        return { x: 0, y: 0, width: w, height: h };
    }
  }

  // Drag handling
  function startDrag(e: MouseEvent, panelId: string) {
    const target = e.target as HTMLElement;
    if (target.closest('button, .floating-window__controls')) return;

    e.preventDefault();
    const p = state.panels[panelId];
    if (!p || p.window.minimized || p.window.snapState === 'maximized') return;

    if (panelId === 'resource-manager' || panelId === 'frame-monitor') {
      followsWorkspaceSize = false;
    }
    bringToFront(panelId);
    setDraggingPanelId(panelId);

    // Cache workspace dims once at drag start — they don't change mid-drag
    _wsRectCache = getWorkspaceRect();
    _wsViewportCache = getWorkspaceViewportOffset();
    _dragRafPending = false;
    _lastDragPos = null;

    // Capture mousemove/mouseup on document so dragging works even when cursor leaves workspace
    const onMouseMove = (e: MouseEvent) => onDrag(e);
    const onMouseUp = () => { endDrag(); };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp, { once: true });
    globalDragCleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    // Restore pre-snap size when dragging a snapped window
    if (p.window.snapState !== 'floating' && p.window.preSnap) {
      const preSnap = p.window.preSnap;
      const viewportOffset = getWorkspaceViewportOffset();
      // Position so cursor appears at roughly 40% into the title bar
      const wsX = e.clientX - viewportOffset.left;
      const wsY = e.clientY - viewportOffset.top;
      const snappedRestoreX = Math.max(0, wsX - preSnap.width * 0.4);
      const snappedRestoreY = Math.max(0, wsY - 15);
      setState('panels', panelId, 'window', 'rect', {
        x: snappedRestoreX,
        y: snappedRestoreY,
        width: preSnap.width,
        height: preSnap.height,
      });
      setState('panels', panelId, 'window', 'preSnap', null);
      setState('panels', panelId, 'window', 'snapState', 'floating');
      setDragOffset({
        x: wsX - snappedRestoreX,
        y: wsY - snappedRestoreY,
      });
      return;
    }

    const viewportOffset = getWorkspaceViewportOffset();
    const startRect = { ...p.window.rect };

    setDragOffset({
      x: e.clientX - viewportOffset.left - startRect.x,
      y: e.clientY - viewportOffset.top - startRect.y,
    });
  }

  function onDrag(e: MouseEvent) {
    const panelId = draggingPanelId();
    if (!panelId) return;
    _lastDragPos = { clientX: e.clientX, clientY: e.clientY };
    if (_dragRafPending) return;
    _dragRafPending = true;
    requestAnimationFrame(() => {
      _dragRafPending = false;
      const pos = _lastDragPos;
      if (!pos) return;
      const currentPanelId = draggingPanelId();
      if (!currentPanelId) return;

      const p = state.panels[currentPanelId];
      if (!p) return;

      const workspace = _wsRectCache;
      const offset = dragOffset();

      const wsX = pos.clientX - _wsViewportCache.left;
      const wsY = pos.clientY - _wsViewportCache.top;
      const newX = wsX - offset.x;
      const newY = wsY - offset.y;

      const snap = getSnapFromCursor(wsX, wsY, workspace);

      if (snap !== 'floating') {
        const snapRect = getSnapRect(snap, workspace);
        setSnapPreview({ snapState: snap, rect: snapRect });
      } else {
        setSnapPreview(null);
      }

      const MIN_VISIBLE = 20;
      setState('panels', currentPanelId, 'window', 'rect', {
        x: Math.max(-p.window.rect.width + MIN_VISIBLE, Math.min(newX, workspace.width - MIN_VISIBLE)),
        y: Math.max(-p.window.rect.height + MIN_VISIBLE, Math.min(newY, workspace.height - MIN_VISIBLE)),
        width: p.window.rect.width,
        height: p.window.rect.height,
      });
      setState('panels', currentPanelId, 'window', 'snapState', 'floating');
    });
  }

  function endDrag() {
    _dragRafPending = false;
    _lastDragPos = null;
    const panelId = draggingPanelId();
    if (!panelId) return;

    const preview = snapPreview();
    if (preview) {
      // Save current rect before applying snap (for restore on unsnap)
      const p = state.panels[panelId];
      setState('panels', panelId, 'window', 'preSnap', { ...p.window.rect });
      setState('panels', panelId, 'window', 'rect', { ...preview.rect });
      setState('panels', panelId, 'window', 'snapState', preview.snapState);
    }

    setSnapPreview(null);
    setDraggingPanelId(null);

    globalDragCleanup?.();
    globalDragCleanup = null;
    setLayoutRevision(v => v + 1);
  }

  // Maximize / Restore
  function toggleMaximize(panelId: string) {
    const p = state.panels[panelId];
    if (!p || !p.visible) return;
    if (panelId === 'resource-manager' || panelId === 'frame-monitor') {
      followsWorkspaceSize = false;
    }
    bringToFront(panelId);

    if (p.window.snapState === 'maximized') {
      const pre = p.window.preMaximize;
      if (pre) {
        setState('panels', panelId, 'window', 'rect', { ...pre.rect });
        setState('panels', panelId, 'window', 'snapState', pre.snapState);
        setState('panels', panelId, 'window', 'preMaximize', null);
      } else {
        setState('panels', panelId, 'window', 'snapState', 'floating');
        setState('panels', panelId, 'window', 'preMaximize', null);
      }
    } else {
      const workspace = getWorkspaceRect();
      setState('panels', panelId, 'window', 'preMaximize', {
        rect: { ...p.window.rect },
        snapState: p.window.snapState,
      });
      setState('panels', panelId, 'window', 'rect', {
        x: 0,
        y: 0,
        width: workspace.width,
        height: workspace.height,
      });
      setState('panels', panelId, 'window', 'snapState', 'maximized');
    }
    setLayoutRevision(v => v + 1);
  }

  // Minimize / Restore
  function minimizePanel(panelId: string) {
    const p = state.panels[panelId];
    if (!p || !p.visible) return;
    setState('panels', panelId, 'window', 'minimized', true);
    setLayoutRevision(v => v + 1);
  }

  function restorePanel(panelId: string) {
    const p = state.panels[panelId];
    if (!p || !p.visible) return;
    setState('panels', panelId, 'window', 'minimized', false);
    bringToFront(panelId);
    setLayoutRevision(v => v + 1);
  }

  function setPanelRect(panelId: string, rect: Partial<WindowRect>) {
    const p = state.panels[panelId];
    if (!p) return;
    setState('panels', panelId, 'window', 'rect', (prev) => ({ ...prev, ...rect }));
  }

  // Resize handling
  function startResize(e: MouseEvent, panelId: string, direction: string) {
    e.preventDefault();
    e.stopPropagation();
    const p = state.panels[panelId];
    if (!p || p.window.minimized) return;

    if (panelId === 'resource-manager' || panelId === 'frame-monitor') {
      followsWorkspaceSize = false;
    }
    bringToFront(panelId);
    setResizingPanelId(panelId);
    setResizeDirection(direction);

    const onMouseMove = (e: MouseEvent) => onResize(e);
    const onMouseUp = () => { endResize(); };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp, { once: true });
    globalResizeCleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  function onResize(e: MouseEvent) {
    const panelId = resizingPanelId();
    const dir = resizeDirection();
    if (!panelId || !dir) return;

    const p = state.panels[panelId];
    if (!p || p.window.snapState === 'maximized') return;

    const workspace = getWorkspaceRect();
    const viewportOffset = getWorkspaceViewportOffset();
    const wsX = e.clientX - viewportOffset.left;
    const wsY = e.clientY - viewportOffset.top;
    const rect = { ...p.window.rect };
    const minW = MIN_WINDOW_WIDTH;
    const minH = MIN_WINDOW_HEIGHT;

    if (dir.includes('e')) {
      rect.width = Math.max(minW, wsX - rect.x);
      rect.width = Math.min(rect.width, workspace.width - rect.x);
    }
    if (dir.includes('w')) {
      const newWidth = rect.x + rect.width - wsX;
      if (newWidth >= minW) {
        rect.width = newWidth;
        rect.x = wsX;
      }
    }
    if (dir.includes('s')) {
      rect.height = Math.max(minH, wsY - rect.y);
      rect.height = Math.min(rect.height, workspace.height - rect.y);
    }
    if (dir.includes('n')) {
      const newHeight = rect.y + rect.height - wsY;
      if (newHeight >= minH) {
        rect.height = newHeight;
        rect.y = wsY;
      }
    }

    setState('panels', panelId, 'window', 'rect', rect);
  }

  function endResize() {
    if (!resizingPanelId()) return;
    setResizingPanelId(null);
    setResizeDirection(null);

    globalResizeCleanup?.();
    globalResizeCleanup = null;
    setLayoutRevision(v => v + 1);
  }

  function minimizedPanels() {
    return Object.values(state.panels).filter(
      (p) => p.visible && p.window.minimized
    );
  }

  function visiblePanels() {
    return Object.values(state.panels)
      .filter((p) => p.visible && !p.window.minimized);
  }

  async function popOutPanel(panelId: string) {
    const p = state.panels[panelId];
    if (!p || !p.visible) return;

    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

    const panelLabel = `panel-${panelId}`;

    const popout = new WebviewWindow(panelLabel, {
      url: `panel-popout.html?panelId=${encodeURIComponent(panelId)}`,
      title: p.title,
      width: p.window.rect.width,
      height: p.window.rect.height,
      resizable: true,
      decorations: true,
      center: true,
    });

    setState('panels', panelId, 'visible', false);

    popout.once('tauri://destroyed', () => {
      setState('panels', panelId, 'visible', true);
    });
  }

  return {
    state,
    snapPreview,
    layoutRevision,
    getPanelLayouts,
    restorePanelLayouts,
    resetToNewProjectLayout,
    syncNewProjectLayoutToWorkspace,
    draggingPanelId,
    isPanelVisible,
    openPanel,
    closePanel,
    togglePanel,
    setActivePanel,
    startDrag,
    onDrag,
    endDrag,
    toggleMaximize,
    minimizePanel,
    restorePanel,
    setPanelRect,
    startResize,
    onResize,
    endResize,
    minimizedPanels,
    visiblePanels,
    popOutPanel,
  };
}
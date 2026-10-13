import { Component, createSignal, For, Show, JSXElement, createContext, useContext } from 'solid-js';
import type { DockPosition, DockLayoutState, PanelDefinition } from './dock-types';
import { ZONE_MIN_SIZES } from './dock-types';
import './DockSystem.css';

interface DockSystemProps {
  panels: Record<string, JSXElement>;
  panelDefs: PanelDefinition[];
  layout: DockLayoutState;
  openPanel: (id: string) => void;
  closePanel: (id: string) => void;
  togglePanel: (id: string) => void;
  setActivePanel: (zone: string, id: string) => void;
  movePanel: (id: string, zone: DockPosition) => void;
  resizeZone: (zone: string, size: number) => void;
  isPanelVisible: (id: string) => boolean;
}

interface DockManagerCtx {
  layout: DockLayoutState;
  openPanel: (id: string) => void;
  closePanel: (id: string) => void;
  togglePanel: (id: string) => void;
  setActivePanel: (zone: string, id: string) => void;
  movePanel: (id: string, zone: DockPosition) => void;
  resizeZone: (zone: string, size: number) => void;
  isPanelVisible: (id: string) => boolean;
}

const DockContext = createContext<DockManagerCtx>();

export function useDockContext() {
  const ctx = useContext(DockContext);
  if (!ctx) throw new Error('useDockContext must be used within DockSystem');
  return ctx;
}

interface DragState {
  panelId: string;
  originZone: string;
  startX: number;
  startY: number;
}

const DRAG_THRESHOLD = 5;

const DockSystem: Component<DockSystemProps> = (props) => {
  const [dragging, setDragging] = createSignal<DragState | null>(null);
  const [dragGhostPos, setDragGhostPos] = createSignal<{ x: number; y: number } | null>(null);
  const [dropTargetZone, setDropTargetZone] = createSignal<string | null>(null);
  const [, setResizing] = createSignal<string | null>(null);

  const ctx: DockManagerCtx = {
    layout: props.layout,
    openPanel: props.openPanel,
    closePanel: props.closePanel,
    togglePanel: props.togglePanel,
    setActivePanel: props.setActivePanel,
    movePanel: props.movePanel,
    resizeZone: props.resizeZone,
    isPanelVisible: props.isPanelVisible,
  };

  const hasVisibleInZone = (zone: string): boolean => {
    const order = props.layout.zoneOrder[zone];
    if (!order) return false;
    return order.some(id => props.layout.panels[id]?.visible);
  };

  const visiblePanelIds = (zone: string): string[] => {
    const order = props.layout.zoneOrder[zone];
    if (!order) return [];
    return order.filter(id => props.layout.panels[id]?.visible);
  };

  const activePanelId = (zone: string): string | null => {
    const visible = visiblePanelIds(zone);
    const active = props.layout.zoneActivePanel[zone];
    if (active && visible.includes(active)) return active;
    if (visible.length > 0) {
      props.setActivePanel(zone, visible[0]);
      return visible[0];
    }
    return null;
  };

  const detectZoneFromPoint = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const zoneEl = (el as HTMLElement).closest('[data-dock-zone]');
    if (!zoneEl) return null;
    return zoneEl.getAttribute('data-dock-zone');
  };

  const handlePanelHeaderMouseDown = (e: MouseEvent, panelId: string, zone: string) => {
    if ((e.target as HTMLElement).closest('.dock-panel__close')) return;
    if (e.button !== 0) return;

    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;

    setDragging({ panelId, originZone: zone, startX, startY });

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
        return;
      }

      setDragGhostPos({ x: ev.clientX, y: ev.clientY });
      const targetZone = detectZoneFromPoint(ev.clientX, ev.clientY);
      setDropTargetZone(targetZone);
    };

    const onUp = (ev: MouseEvent) => {
      const ds = dragging();
      if (!ds) {
        cleanup();
        return;
      }

      const targetZone = detectZoneFromPoint(ev.clientX, ev.clientY);
      if (targetZone && targetZone !== ds.originZone) {
        props.movePanel(ds.panelId, targetZone as DockPosition);
      }

      setDragging(null);
      setDragGhostPos(null);
      setDropTargetZone(null);
      cleanup();
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const startResize = (zone: string, direction: 'horizontal' | 'vertical') => {
    return (e: MouseEvent) => {
      e.preventDefault();
      setResizing(zone);

      const onMove = (ev: MouseEvent) => {
        const min = ZONE_MIN_SIZES[zone] ?? 60;
        if (direction === 'horizontal') {
          const size = zone === 'left'
            ? Math.max(min, ev.clientX)
            : Math.max(min, window.innerWidth - ev.clientX);
          props.resizeZone(zone, size);
        } else {
          const size = zone === 'top'
            ? Math.max(min, ev.clientY)
            : Math.max(min, window.innerHeight - ev.clientY);
          props.resizeZone(zone, size);
        }
      };

      const onUp = () => {
        setResizing(null);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  };

  const renderZone = (zone: string) => {
    const hasContent = hasVisibleInZone(zone);
    const panelIds = visiblePanelIds(zone);
    const active = activePanelId(zone);
    const size = props.layout.zoneSizes[zone];

    const zoneStyle = () => {
      const s: Record<string, string> = {};
      if (zone === 'left' || zone === 'right') s.width = size + 'px';
      if (zone === 'top' || zone === 'bottom') s.height = size + 'px';
      return s;
    };

    return (
      <div
        class="dock-zone"
        data-dock-zone={zone}
        classList={{
          [`dock-zone--${zone}`]: true,
          'dock-zone--hidden': !hasContent,
          'dock-zone--drag-over': dropTargetZone() === zone,
        }}
        style={zoneStyle()}
      >
        <Show when={panelIds.length > 1}>
          <div class="dock-tab-bar">
            <For each={panelIds}>
              {(panelId) => {
                const def = props.panelDefs.find(d => d.id === panelId);
                return (
                  <button
                    class="dock-tab"
                    classList={{ 'dock-tab--active': panelId === active }}
                    onClick={() => props.setActivePanel(zone, panelId)}
                    type="button"
                  >
                    {def?.title ?? panelId}
                  </button>
                );
              }}
            </For>
          </div>
        </Show>

        <div class="dock-zone__content">
          <Show when={active !== null && props.panels[active]}>
            <div class="dock-panel">
              <div
                class="dock-panel__header"
                onMouseDown={(e) => handlePanelHeaderMouseDown(e, active!, zone)}
              >
                <span class="dock-panel__title">
                  {props.panelDefs.find(d => d.id === active)?.title ?? active}
                </span>
                <button
                  class="dock-panel__close"
                  onClick={() => props.closePanel(active!)}
                  type="button"
                  title="关闭面板"
                >
                  <svg viewBox="0 0 16 16" width="12" height="12">
                    <line x1="3" y1="3" x2="13" y2="13" />
                    <line x1="13" y1="3" x2="3" y2="13" />
                  </svg>
                </button>
              </div>
              <div class="dock-panel__body">
                {props.panels[active!]}
              </div>
            </div>
          </Show>
          <Show when={active === null && hasContent}>
            <div class="dock-zone__empty">拖放面板到此处</div>
          </Show>
        </div>
      </div>
    );
  };

  return (
    <DockContext.Provider value={ctx}>
      <div class="dock-system">
        <Show when={hasVisibleInZone('top')}>
          {renderZone('top')}
        </Show>

        <div class="dock-system__middle">
          <Show when={hasVisibleInZone('left')}>
            {renderZone('left')}
            <Show when={hasVisibleInZone('center') || hasVisibleInZone('right')}>
              <div
                class="dock-splitter dock-splitter--vertical"
                onMouseDown={startResize('left', 'horizontal')}
              />
            </Show>
          </Show>

          <div class="dock-system__center">
            {renderZone('center')}
          </div>

          <Show when={hasVisibleInZone('right')}>
            <Show when={hasVisibleInZone('center') || hasVisibleInZone('left')}>
              <div
                class="dock-splitter dock-splitter--vertical"
                onMouseDown={startResize('right', 'horizontal')}
              />
            </Show>
            {renderZone('right')}
          </Show>
        </div>

        <Show when={hasVisibleInZone('bottom')}>
          <div
            class="dock-splitter dock-splitter--horizontal"
            onMouseDown={startResize('bottom', 'vertical')}
          />
          {renderZone('bottom')}
        </Show>

        <Show when={dragging() !== null && dragGhostPos() !== null}>
          <div
            class="dock-drag-ghost"
            style={{
              left: dragGhostPos()!.x + 'px',
              top: dragGhostPos()!.y + 'px',
            }}
          >
            {(() => {
              const d = dragging()!;
              return props.panelDefs.find(p => p.id === d.panelId)?.title ?? d.panelId;
            })()}
          </div>
        </Show>
      </div>
    </DockContext.Provider>
  );
};

export default DockSystem;
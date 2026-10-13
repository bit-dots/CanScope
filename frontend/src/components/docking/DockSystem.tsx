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

const DockSystem: Component<DockSystemProps> = (props) => {
  const [dragOverZone, setDragOverZone] = createSignal<string | null>(null);
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

  const handleDragOver = (e: DragEvent, zone: string) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    setDragOverZone(zone);
  };

  const handleDragLeave = (_e: DragEvent, zone: string) => {
    if (dragOverZone() === zone) {
      setDragOverZone(null);
    }
  };

  const handleDrop = (e: DragEvent, zone: string) => {
    e.preventDefault();
    setDragOverZone(null);
    const panelId = e.dataTransfer?.getData('text/panel-id');
    if (panelId && zone) {
      props.movePanel(panelId, zone as DockPosition);
    }
  };

  const handleDragStart = (e: DragEvent, panelId: string) => {
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/panel-id', panelId);
      e.dataTransfer.effectAllowed = 'move';
    }
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
        classList={{
          [`dock-zone--${zone}`]: true,
          'dock-zone--hidden': !hasContent,
          'dock-zone--drag-over': dragOverZone() === zone,
        }}
        style={zoneStyle()}
        onDragOver={(e) => handleDragOver(e, zone)}
        onDragLeave={(e) => handleDragLeave(e, zone)}
        onDrop={(e) => handleDrop(e, zone)}
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
                draggable="true"
                onDragStart={(e) => handleDragStart(e, active!)}
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
      </div>
    </DockContext.Provider>
  );
};

export default DockSystem;
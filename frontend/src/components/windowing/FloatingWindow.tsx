import { Component, JSX, createSignal } from 'solid-js';
import {
  PanelWindowState,
  SnapState,
} from './window-types';
import ContextMenu, { ContextMenuItem } from '../ContextMenu';
import './FloatingWindow.css';

interface FloatingWindowProps {
  panel: PanelWindowState;
  isDragging: boolean;
  visiblePanelCount: number;
  onMouseDown: (e: MouseEvent) => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
  onCloseOther?: () => void;
  onCloseAll?: () => void;
  onPopOut?: () => void;
  onResizeStart: (e: MouseEvent, direction: string) => void;
  onActivate: () => void;
  titleIcon?: JSX.Element;
  children: JSX.Element;
}

const getSnapClass = (snapState: SnapState): string => {
  if (snapState === 'floating' || snapState === 'maximized') return '';
  return `floating-window--${snapState}`;
};

const FloatingWindow: Component<FloatingWindowProps> = (props) => {
  const { panel } = props;
  const isMaximized = () => panel.window.snapState === 'maximized';
  const isSnapped = () =>
    panel.window.snapState !== 'floating' &&
    panel.window.snapState !== 'maximized';

  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number } | null>(null);

  const openContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  const buildContextMenuItems = (): ContextMenuItem[] => {
    const singlePanel = props.visiblePanelCount <= 1;

    const items: ContextMenuItem[] = [];

    items.push({
      id: 'close',
      label: '关闭',
      action: props.onClose,
    });

    items.push({
      id: 'close-other',
      label: '关闭其他',
      action: props.onCloseOther,
      disabled: singlePanel,
    });

    items.push({
      id: 'close-all',
      label: '全部关闭',
      action: props.onCloseAll,
      disabled: singlePanel,
    });

    items.push({ id: 'sep1', label: '', separator: true });

    items.push({
      id: 'popout',
      label: '移动到新窗口',
      action: props.onPopOut,
    });

    return items;
  };

  return (
    <div
      class={`floating-window ${getSnapClass(panel.window.snapState)}`}
      classList={{
        'floating-window--maximized': panel.window.snapState === 'maximized',
        'floating-window--dragging': props.isDragging,
        'floating-window--snapped': isSnapped(),
      }}
      style={{
        left: `${panel.window.rect.x}px`,
        top: `${panel.window.rect.y}px`,
        width: `${panel.window.rect.width}px`,
        height: `${panel.window.rect.height}px`,
        'z-index': panel.zIndex,
      }}
      onMouseDown={props.onActivate}
      role="region"
      aria-label={panel.title}
    >
      {/* Title Bar */}
      <div
        class="floating-window__titlebar"
        onMouseDown={props.onMouseDown}
        onDblClick={props.onMaximize}
        onContextMenu={openContextMenu}
      >
        <span class="floating-window__title">
          {props.titleIcon && <span class="floating-window__title-icon">{props.titleIcon}</span>}
          {panel.title}
        </span>
        <div class="floating-window__controls">
          <button
            class="floating-window__btn floating-window__btn--minimize"
            onClick={(e) => {
              e.stopPropagation();
              props.onMinimize();
            }}
            title="最小化"
            aria-label="最小化"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="1" y="4.5" width="8" height="1" fill="currentColor" />
            </svg>
          </button>
          <button
            class="floating-window__btn floating-window__btn--maximize"
            onClick={(e) => {
              e.stopPropagation();
              props.onMaximize();
            }}
            title={isMaximized() ? '还原' : '最大化'}
            aria-label={isMaximized() ? '还原' : '最大化'}
          >
            {isMaximized() ? (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect
                  x="1.5"
                  y="2.5"
                  width="6"
                  height="5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1"
                />
                <rect
                  x="2.5"
                  y="1.5"
                  width="6"
                  height="5"
                  fill="var(--bg-primary)"
                  stroke="currentColor"
                  stroke-width="1"
                />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect
                  x="1.5"
                  y="1.5"
                  width="7"
                  height="7"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1"
                />
              </svg>
            )}
          </button>
          <button
            class="floating-window__btn floating-window__btn--close"
            onClick={(e) => {
              e.stopPropagation();
              props.onClose();
            }}
            title="关闭"
            aria-label="关闭"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" stroke-width="1.2" />
              <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" stroke-width="1.2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu() && (
        <ContextMenu
          x={contextMenu()!.x}
          y={contextMenu()!.y}
          items={buildContextMenuItems()}
          onClose={closeContextMenu}
        />
      )}

      {/* Content */}
      <div class="floating-window__content">
        {props.children}
      </div>

      {/* Resize handles — only when not maximized */}
      {!isMaximized() && (
        <>
          <div
            class="floating-window__resize floating-window__resize--n"
            onMouseDown={(e) => props.onResizeStart(e, 'n')}
          />
          <div
            class="floating-window__resize floating-window__resize--s"
            onMouseDown={(e) => props.onResizeStart(e, 's')}
          />
          <div
            class="floating-window__resize floating-window__resize--e"
            onMouseDown={(e) => props.onResizeStart(e, 'e')}
          />
          <div
            class="floating-window__resize floating-window__resize--w"
            onMouseDown={(e) => props.onResizeStart(e, 'w')}
          />
          <div
            class="floating-window__resize floating-window__resize--nw"
            onMouseDown={(e) => props.onResizeStart(e, 'nw')}
          />
          <div
            class="floating-window__resize floating-window__resize--ne"
            onMouseDown={(e) => props.onResizeStart(e, 'ne')}
          />
          <div
            class="floating-window__resize floating-window__resize--sw"
            onMouseDown={(e) => props.onResizeStart(e, 'sw')}
          />
          <div
            class="floating-window__resize floating-window__resize--se"
            onMouseDown={(e) => props.onResizeStart(e, 'se')}
          />
        </>
      )}
    </div>
  );
};

export default FloatingWindow;
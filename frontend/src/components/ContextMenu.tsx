import { Component, createEffect, createSignal, onCleanup, onMount, JSX } from 'solid-js';
import './ContextMenu.css';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: JSX.Element;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const ContextMenu: Component<ContextMenuProps> = (props) => {
  const [adjustedPos, setAdjustedPos] = createSignal({ x: props.x, y: props.y });
  let menuRef: HTMLDivElement | undefined;
  let positionFrame: number | undefined;

  const adjustPosition = () => {
    if (!menuRef) return;
    const rect = menuRef.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let newX = props.x;
    let newY = props.y;

    if (newX + rect.width > viewportW) {
      newX = viewportW - rect.width - 8;
    }
    if (newY + rect.height > viewportH) {
      newY = viewportH - rect.height - 8;
    }
    if (newX < 0) newX = 8;
    if (newY < 0) newY = 8;

    setAdjustedPos({ x: newX, y: newY });
  };

  createEffect(() => {
    props.x;
    props.y;
    if (positionFrame !== undefined) cancelAnimationFrame(positionFrame);
    positionFrame = requestAnimationFrame(adjustPosition);
  });

  const handleDocumentClick = (event: MouseEvent) => {
    if (menuRef && !menuRef.contains(event.target as Node)) {
      props.onClose();
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      props.onClose();
    }
  };

  onMount(() => {
    adjustPosition();
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    if (positionFrame !== undefined) cancelAnimationFrame(positionFrame);
    document.removeEventListener('click', handleDocumentClick);
    document.removeEventListener('keydown', handleKeyDown);
  });

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled || item.separator) return;
    item.action?.();
    props.onClose();
  };

  return (
    <div
      ref={menuRef}
      class="ctx-menu"
      role="menu"
      style={{
        left: `${adjustedPos().x}px`,
        top: `${adjustedPos().y}px`,
      }}
    >
      {props.items.map((item) => {
        if (item.separator) {
          return <div class="ctx-menu__separator" role="separator" />;
        }
        return (
          <button
            class="ctx-menu__item"
            classList={{ 'ctx-menu__item--disabled': item.disabled }}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => handleItemClick(item)}
          >
            {item.icon && <span class="ctx-menu__icon">{item.icon}</span>}
            <span class="ctx-menu__label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ContextMenu;
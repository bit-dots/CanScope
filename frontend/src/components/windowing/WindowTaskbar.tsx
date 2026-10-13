import { Component, For } from 'solid-js';
import { PanelWindowState } from './window-types';
import './WindowTaskbar.css';

interface WindowTaskbarProps {
  panels: PanelWindowState[];
  onRestore: (id: string) => void;
}

const WindowTaskbar: Component<WindowTaskbarProps> = (props) => {
  if (props.panels.length === 0) return null;

  return (
    <div class="window-taskbar">
      <For each={props.panels}>
        {(panel) => (
          <button
            class="window-taskbar__tab"
            onClick={() => props.onRestore(panel.id)}
            title={panel.title}
          >
            <span class="window-taskbar__icon">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <rect
                  x="1.5"
                  y="1.5"
                  width="9"
                  height="9"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1"
                  rx="0.5"
                />
              </svg>
            </span>
            <span class="window-taskbar__label">{panel.title}</span>
          </button>
        )}
      </For>
    </div>
  );
};

export default WindowTaskbar;
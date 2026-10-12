import { Component } from 'solid-js';

interface ConfirmButton {
  label: string;
  kind: 'primary' | 'secondary' | 'danger';
  onClick: () => void;
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  buttons: ConfirmButton[];
}

const ConfirmDialog: Component<ConfirmDialogProps> = (props) => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      const last = props.buttons[props.buttons.length - 1];
      last.onClick();
    }
  };

  return (
    <div class="npd-overlay">
      <div class="npd-dialog npd-dialog-sm" onKeyDown={handleKeyDown}>
        <div class="npd-header">
          <h2 class="npd-title">{props.title}</h2>
        </div>
        <div class="npd-body">
          <p class="npd-message">{props.message}</p>
        </div>
        <div class="npd-footer">
          {props.buttons.map((btn) => (
            <button
              class={`npd-btn npd-btn-${btn.kind}`}
              onClick={btn.onClick}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
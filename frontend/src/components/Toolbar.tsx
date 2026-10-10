import { Component } from 'solid-js';

interface ToolbarProps {
  onFileOpen: () => void;
  sourceLoaded: boolean;
}

const Toolbar: Component<ToolbarProps> = (props) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 12px',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      minHeight: '40px',
    }}>
      <button
        onClick={props.onFileOpen}
        style={{
          padding: '4px 16px',
          border: 'none',
          borderRadius: '4px',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          'font-size': '13px',
        }}
      >
        Open File
      </button>

      {props.sourceLoaded && (
        <>
          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
          <button style={{
            padding: '4px 12px', border: 'none', borderRadius: '4px',
            background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
            cursor: 'pointer', 'font-size': '13px',
          }}>
            ▶ Play
          </button>
          <button style={{
            padding: '4px 12px', border: 'none', borderRadius: '4px',
            background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
            cursor: 'pointer', 'font-size': '13px',
          }}>
            ⏸ Pause
          </button>
          <button style={{
            padding: '4px 12px', border: 'none', borderRadius: '4px',
            background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
            cursor: 'pointer', 'font-size': '13px',
          }}>
            ⏹ Stop
          </button>
        </>
      )}
    </div>
  );
};

export default Toolbar;
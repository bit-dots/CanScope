import { Component } from 'solid-js';

interface StatusBarProps {
  sourceLoaded: boolean;
}

const StatusBar: Component<StatusBarProps> = (props) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '2px 12px',
      background: 'var(--bg-secondary)',
      borderTop: '1px solid var(--border)',
      minHeight: '24px',
      'font-size': '12px',
      color: 'var(--text-secondary)',
    }}>
      <span>
        {props.sourceLoaded ? 'Source loaded' : 'No file loaded'}
      </span>
      <span>CanScope v0.1</span>
    </div>
  );
};

export default StatusBar;
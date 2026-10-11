import { Component } from 'solid-js';
import type { PlaybackState } from '../types';

interface ToolbarProps {
  onFileOpen: () => void;
  onLoadDbc: () => void;
  sourceLoaded: boolean;
  playbackState: PlaybackState;
  onPlaybackControl: (action: string) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
}

const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 32];

const Toolbar: Component<ToolbarProps> = (props) => {
  const isPlaying = () => props.playbackState === 'playing';
  const isPaused = () => props.playbackState === 'paused';

  return (
    <div style={{
      display: 'flex',
      'align-items': 'center',
      gap: '8px',
      padding: '6px 12px',
      background: 'var(--bg-secondary)',
      'border-bottom': '1px solid var(--border)',
      'min-height': '40px',
    }}>
      <button
        onClick={props.onFileOpen}
        style={{
          padding: '4px 16px',
          border: 'none',
          'border-radius': '4px',
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
          <button
            onClick={props.onLoadDbc}
            style={{
              padding: '4px 16px',
              border: 'none',
              'border-radius': '4px',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              'font-size': '13px',
            }}
          >
            Load DBC
          </button>

          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

          {isPlaying() ? (
            <button
              onClick={() => props.onPlaybackControl('pause')}
              style={{
                padding: '4px 12px', border: 'none', 'border-radius': '4px',
                background: 'var(--accent)', color: '#fff',
                cursor: 'pointer', 'font-size': '13px',
              }}
            >
              Pause
            </button>
          ) : (
            <button
              onClick={() => props.onPlaybackControl('play')}
              style={{
                padding: '4px 12px', border: 'none', 'border-radius': '4px',
                background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                cursor: 'pointer', 'font-size': '13px',
              }}
            >
              {isPaused() ? 'Resume' : 'Play'}
            </button>
          )}

          <button
            onClick={() => props.onPlaybackControl('stop')}
            style={{
              padding: '4px 12px', border: 'none', 'border-radius': '4px',
              background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              cursor: 'pointer', 'font-size': '13px',
            }}
          >
            Stop
          </button>

          <div style={{
            display: 'flex',
            'align-items': 'center',
            gap: '4px',
            'margin-left': '8px',
          }}>
            <span style={{ 'font-size': '11px', color: 'var(--text-secondary)' }}>Speed</span>
            <select
              value={props.speed}
              onChange={e => props.onSpeedChange(parseFloat(e.currentTarget.value))}
              style={{
                padding: '3px 6px',
                border: '1px solid var(--border)',
                'border-radius': '3px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                'font-size': '12px',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {SPEEDS.map(s => (
                <option value={s}>{s < 1 ? s.toFixed(2) : s}x</option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
};

export default Toolbar;
import { Component } from 'solid-js';
import type { PlaybackState } from '../types';

interface ToolbarProps {
  onFileOpen: () => void;
  onLoadDbc: () => void;
  sourceLoaded: boolean;
  playbackState: PlaybackState;
  onPlaybackControl: (action: string) => void;
}

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
        </>
      )}
    </div>
  );
};

export default Toolbar;
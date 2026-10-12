import { Component } from 'solid-js';
import type { PlaybackState, ProjectInfo } from '../types';

interface ToolbarProps {
  project: ProjectInfo;
  onFileOpen: () => void;
  onLoadDbc: () => void;
  sourceLoaded: boolean;
  playbackState: PlaybackState;
  onPlaybackControl: (action: string) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  onCloseProject: () => void;
}

const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 32];

const btnMuted = 'px-2.5 py-1 border-0 rounded bg-bg-tertiary text-text-secondary cursor-pointer text-xs transition-colors duration-150';
const btnDefault = 'px-2.5 py-1 border-0 rounded bg-bg-tertiary text-text-primary cursor-pointer text-[13px] transition-colors duration-150';
const btnAccent = 'px-2.5 py-1 border-0 rounded bg-accent text-white cursor-pointer text-[13px] transition-colors duration-150';

const Toolbar: Component<ToolbarProps> = (props) => {
  const isPlaying = () => props.playbackState === 'playing';
  const isPaused = () => props.playbackState === 'paused';

  return (
    <div class="flex items-center gap-2 px-3 py-1.5 bg-bg-secondary border-b border-border" style={{ 'min-height': '40px' }}>
      <span
        class="text-[13px] font-semibold text-text-primary mr-1 max-w-[180px] truncate"
        title={props.project.name}
      >
        {props.project.name}
      </span>

      <button
        onClick={props.onSaveProject}
        class={btnMuted}
        title="Save Project (Ctrl+S)"
        aria-label="Save Project"
      >
        Save
      </button>

      <div class="w-px h-5 bg-border" />

      <button
        onClick={props.onFileOpen}
        class={btnDefault}
        aria-label="Open File"
      >
        Open File
      </button>

      {props.sourceLoaded && (
        <>
          <button
            onClick={props.onLoadDbc}
            class={btnDefault}
            aria-label="Load DBC"
          >
            Load DBC
          </button>

          <div class="w-px h-5 bg-border" />

          {isPlaying() ? (
            <button
              onClick={() => props.onPlaybackControl('pause')}
              class={btnAccent}
              aria-label="Pause"
            >
              Pause
            </button>
          ) : (
            <button
              onClick={() => props.onPlaybackControl('play')}
              class={btnDefault}
              aria-label={isPaused() ? 'Resume' : 'Play'}
            >
              {isPaused() ? 'Resume' : 'Play'}
            </button>
          )}

          <button
            onClick={() => props.onPlaybackControl('stop')}
            class={btnDefault}
            aria-label="Stop"
          >
            Stop
          </button>

          <div class="flex items-center gap-1 ml-2">
            <span class="text-[11px] text-text-secondary">
              Speed
            </span>
            <select
              value={props.speed}
              onChange={(e) => props.onSpeedChange(parseFloat(e.currentTarget.value))}
              class="py-0.5 px-1.5 border border-border rounded bg-bg-primary text-text-primary text-xs cursor-pointer outline-none"
            >
              {SPEEDS.map((s) => (
                <option value={s}>{s < 1 ? s.toFixed(2) : s}x</option>
              ))}
            </select>
          </div>
        </>
      )}

      <div class="flex-1" />

      <button
        onClick={props.onCloseProject}
        class={btnMuted}
        title="Close Project"
        aria-label="Close Project"
      >
        Close
      </button>
    </div>
  );
};

export default Toolbar;
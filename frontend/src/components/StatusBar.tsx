import { Component } from 'solid-js';
import type { PlaybackState } from '../types';
import './StatusBar.css';

interface StatusBarProps {
  sourceLoaded: boolean;
  playbackState: PlaybackState;
}

const stateLabel: Record<PlaybackState, string> = {
  stopped: '已停止',
  playing: '播放中',
  paused: '已暂停',
};

const StatusBar: Component<StatusBarProps> = (props) => {
  const stateClass = () => {
    switch (props.playbackState) {
      case 'playing': return 'status-bar__state--playing';
      case 'paused': return 'status-bar__state--paused';
      default: return 'status-bar__state--stopped';
    }
  };

  const dotClass = () => {
    switch (props.playbackState) {
      case 'playing': return 'status-bar__state-dot--playing';
      case 'paused': return 'status-bar__state-dot--paused';
      default: return 'status-bar__state-dot--stopped';
    }
  };

  return (
    <div class="status-bar">
      <div class="status-bar__right">
        {props.sourceLoaded && (
          <span class="status-bar__state" classList={{ [stateClass()]: true }}>
            <span class="status-bar__state-dot" classList={{ [dotClass()]: true }} />
            {stateLabel[props.playbackState]}
          </span>
        )}
        <span class="status-bar__version">CanScope v0.1</span>
      </div>
    </div>
  );
};

export default StatusBar;
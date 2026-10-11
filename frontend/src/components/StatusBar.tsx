import { Component } from 'solid-js';
import type { FileMetadata, PlaybackState } from '../types';

interface StatusBarProps {
  sourceLoaded: boolean;
  metadata: FileMetadata | null;
  frameCount: number;
  totalFrameCount: number;
  playbackState: PlaybackState;
}

const stateLabel: Record<PlaybackState, string> = {
  stopped: 'Stopped',
  playing: 'Playing',
  paused: 'Paused',
};

const StatusBar: Component<StatusBarProps> = (props) => {
  const fileName = () => props.metadata?.fileName ?? '';

  return (
    <div style={{
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'space-between',
      padding: '2px 12px',
      background: 'var(--bg-secondary)',
      'border-top': '1px solid var(--border)',
      'min-height': '24px',
      'font-size': '12px',
      color: 'var(--text-secondary)',
    }}>
      <span>
        {props.sourceLoaded
          ? `${fileName()}  |  ${props.frameCount} / ${props.totalFrameCount} frames${props.frameCount !== props.totalFrameCount ? ' (filtered)' : ''}  |  ${stateLabel[props.playbackState]}`
          : 'No file loaded'}
      </span>
      <span>CanScope v0.1</span>
    </div>
  );
};

export default StatusBar;
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
    <div class="flex items-center justify-between px-3 py-0.5 bg-bg-secondary border-t border-border text-xs text-text-secondary" style={{ 'min-height': '24px' }}>
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
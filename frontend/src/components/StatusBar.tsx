import { Component, createMemo } from 'solid-js';
import type { PlaylistInfo, PlaybackState } from '../types';
import './StatusBar.css';

interface StatusBarProps {
  sourceLoaded: boolean;
  metadata: PlaylistInfo | null;
  frameCount: number;
  totalFrameCount: number;
  playbackState: PlaybackState;
}

const stateLabel: Record<PlaybackState, string> = {
  stopped: '已停止',
  playing: '播放中',
  paused: '已暂停',
};

const StatusBar: Component<StatusBarProps> = (props) => {
  const displayName = createMemo(() => {
    const info = props.metadata;
    if (!info) return '';
    if (info.files.length === 1) return info.files[0].fileName;
    return info.files.filter(f => f.enabled).map(f => f.fileName).join(', ');
  });

  const totalFramesDisplay = createMemo(() => {
    return props.metadata?.totalFrames ?? props.totalFrameCount;
  });

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
      <div class="status-bar__left">
        <span classList={{
          'status-bar__file': true,
          'status-bar__file--loaded': props.sourceLoaded,
        }}>
          {props.sourceLoaded
            ? `${displayName()}  |  ${props.frameCount} / ${totalFramesDisplay()} 帧`
            : '未加载文件'}
        </span>

        {props.sourceLoaded && (
          <>
            <span class="status-bar__separator" />
            <span class="status-bar__label">总线负载</span>
            <span class="status-bar__value">
              {props.playbackState === 'playing' ? '24.7%' : '0.0%'}
            </span>
            <span class="status-bar__label">错误帧</span>
            <span class="status-bar__value">0</span>
            <span class="status-bar__label">接收</span>
            <span class="status-bar__value status-bar__value--success">{props.totalFrameCount}</span>
            <span class="status-bar__label">发送</span>
            <span class="status-bar__value status-bar__value--accent">0</span>
          </>
        )}
      </div>

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
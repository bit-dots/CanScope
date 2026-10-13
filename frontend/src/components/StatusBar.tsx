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
  stopped: '已停止',
  playing: '播放中',
  paused: '已暂停',
};

const StatusBar: Component<StatusBarProps> = (props) => {
  const fileName = () => props.metadata?.fileName ?? '';

  return (
    <div
      class="status-bar"
      style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        padding: '0 12px',
        'min-height': '24px',
        background: 'var(--bg-secondary)',
        'border-top': '1px solid var(--border)',
        'font-size': '12px',
        color: 'var(--text-secondary)',
        'font-family': 'var(--font-sans)',
        gap: '20px',
      }}
    >
      <div style={{ display: 'flex', 'align-items': 'center', gap: '20px' }}>
        <span style={{ color: props.sourceLoaded ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {props.sourceLoaded
            ? `${fileName()}  |  ${props.frameCount} / ${props.totalFrameCount} 帧`
            : '未加载文件'}
        </span>

        {props.sourceLoaded && (
          <>
            <span class="status-bar__separator" />
            <span>总线负载</span>
            <span style={{ color: 'var(--text-primary)', 'font-family': 'var(--font-mono)' }}>
              {props.playbackState === 'playing' ? '24.7%' : '0.0%'}
            </span>
            <span>错误帧</span>
            <span style={{ color: 'var(--text-primary)', 'font-family': 'var(--font-mono)' }}>0</span>
            <span>接收</span>
            <span style={{ color: 'var(--success)', 'font-family': 'var(--font-mono)' }}>{props.totalFrameCount}</span>
            <span>发送</span>
            <span style={{ color: 'var(--accent)', 'font-family': 'var(--font-mono)' }}>0</span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', 'align-items': 'center', gap: '12px' }}>
        {props.sourceLoaded && (
          <span style={{
            display: 'inline-flex',
            'align-items': 'center',
            gap: '4px',
            padding: '0 6px',
            'border-radius': '3px',
            'font-size': '11px',
            'font-weight': '500',
            color: props.playbackState === 'playing'
              ? 'var(--success)'
              : props.playbackState === 'paused'
                ? 'var(--warning)'
                : 'var(--text-secondary)',
            background: props.playbackState === 'playing'
              ? 'rgba(34,197,94,0.15)'
              : props.playbackState === 'paused'
                ? 'rgba(245,158,11,0.15)'
                : 'transparent',
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              'border-radius': '50%',
              background: props.playbackState === 'playing'
                ? 'var(--success)'
                : props.playbackState === 'paused'
                  ? 'var(--warning)'
                  : 'var(--text-secondary)',
              'flex-shrink': '0',
            }} />
            {stateLabel[props.playbackState]}
          </span>
        )}
        <span style={{ color: 'var(--text-secondary)', 'font-size': '11px' }}>CanScope v0.1</span>
      </div>
    </div>
  );
};

export default StatusBar;
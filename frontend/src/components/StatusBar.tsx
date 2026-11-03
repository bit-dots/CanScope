import { Component } from 'solid-js';
import { Settings } from 'lucide-solid';
import type { PlaybackState } from '../types';
import './StatusBar.css';

interface StatusBarProps {
  sourceLoaded: boolean;
  playbackState: PlaybackState;
  estimatedCacheBytes: number;
  cacheLimitBytes: number;
  availableMemoryBytes: number | null;
  onOpenSettings: () => void;
}

const stateLabel: Record<PlaybackState, string> = {
  stopped: '已停止',
  playing: '播放中',
  paused: '已暂停',
};

const formatMemory = (bytes: number) => bytes >= 1024 ** 3
  ? `${(bytes / (1024 ** 3)).toFixed(1)} GB`
  : `${Math.round(bytes / (1024 ** 2))} MB`;

const StatusBar: Component<StatusBarProps> = (props) => {
  const cacheRatio = () => props.cacheLimitBytes > 0
    ? props.estimatedCacheBytes / props.cacheLimitBytes
    : 0;

  const cacheClass = () => {
    if (cacheRatio() >= 0.95) return 'status-bar__cache--critical';
    if (cacheRatio() >= 0.8) return 'status-bar__cache--warning';
    return '';
  };

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
        <button
          class="status-bar__settings"
          onClick={props.onOpenSettings}
          type="button"
          aria-label="打开设置"
          title="设置"
        >
          <Settings size={14} />
        </button>
      </div>
      <div class="status-bar__right">
        <span
          class="status-bar__cache"
          classList={{ [cacheClass()]: cacheClass() !== '' }}
          title={`报文监控缓存估算占用 ${formatMemory(props.estimatedCacheBytes)}，上限 ${formatMemory(props.cacheLimitBytes)}`}
        >
          缓存 {formatMemory(props.estimatedCacheBytes)} / {formatMemory(props.cacheLimitBytes)}
        </span>
        {props.availableMemoryBytes !== null && props.availableMemoryBytes < 1024 ** 3 && (
          <span
            class="status-bar__memory-warning"
            title={`系统可用内存仅 ${formatMemory(props.availableMemoryBytes)}`}
            role="status"
          >
            可用内存不足
          </span>
        )}
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
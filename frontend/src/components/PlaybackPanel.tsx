import { Component, createSignal, createEffect, onCleanup, For, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import type { PlaylistInfo, PlaybackState } from '../types';
import './PlaybackPanel.css';

interface PlaybackPanelProps {
  playlistInfo: PlaylistInfo | null;
  playbackState: PlaybackState;
  speed: number;
  loopEnabled: boolean;
  onPlaybackControl: (action: string) => void;
  onSetSpeed: (speed: number) => void;
  onSetLoop: (enabled: boolean) => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onSeek: (timestamp: number) => void;
  onRefreshPlaylist: () => void;
}

const SPEED_OPTIONS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8, 16, 32];

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '--:--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatFrameCount(count: number | null): string {
  if (count === null || count === undefined) return '--';
  if (count >= 1_000_000) {
    return (count / 1_000_000).toFixed(2) + 'M';
  }
  if (count >= 1_000) {
    return (count / 1_000).toFixed(1) + 'K';
  }
  return count.toString();
}

const PlaybackPanel: Component<PlaybackPanelProps> = (props) => {
  const [currentTime, setCurrentTime] = createSignal<number>(0);

  const progress = () => {
    const dur = props.playlistInfo?.totalDuration;
    if (!dur || dur <= 0) return 0;
    return Math.min(currentTime() / dur, 1);
  };

  const handleAddFile = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        title: '添加回放文件',
        filters: [
          { name: 'CAN 日志文件', extensions: ['asc', 'csv', 'blf', 'trc'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        multiple: true,
      });
      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      for (const path of paths) {
        if (typeof path === 'string') {
          await invoke('playlist_add', { path });
        }
      }
      props.onRefreshPlaylist();
    } catch (e) {
      console.error('Failed to add file:', e);
    }
  };

  const handleRemoveFile = async (index: number) => {
    try {
      await invoke('playlist_remove', { index });
      props.onRefreshPlaylist();
    } catch (e) {
      console.error('Failed to remove file:', e);
    }
  };

  const handleToggleFile = async (index: number, enabled: boolean) => {
    try {
      await invoke('playlist_toggle', { index, enabled });
      props.onRefreshPlaylist();
    } catch (e) {
      console.error('Failed to toggle file:', e);
    }
  };

  const handleTimelineClick = (e: MouseEvent) => {
    const dur = props.playlistInfo?.totalDuration;
    if (!dur) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const timestamp = ratio * dur;
    setCurrentTime(timestamp);
    props.onSeek(timestamp);
  };

  // Update current time from playback polling
  createEffect(() => {
    if (props.playbackState === 'playing') {
      const interval = setInterval(async () => {
        try {
          const p: number | null = await invoke('get_progress');
          if (p !== null && props.playlistInfo?.totalDuration) {
            setCurrentTime(p * props.playlistInfo.totalDuration);
          }
        } catch {
          // ignore progress fetch errors
        }
      }, 200);
      onCleanup(() => clearInterval(interval));
    }
  });

  const files = () => props.playlistInfo?.files ?? [];
  const totalDurationStr = () => formatDuration(props.playlistInfo?.totalDuration ?? null);
  const totalFramesStr = () => {
    const total = props.playlistInfo?.totalFrames ?? null;
    return total !== null ? formatFrameCount(total) + ' 帧' : '-- 帧';
  };
  const enabledCount = () => props.playlistInfo?.enabledCount ?? 0;
  const fileCount = () => props.playlistInfo?.fileCount ?? 0;

  return (
    <div class="playback-panel">
      {/* File list section */}
      <div class="playback-section">
        <div class="playback-section__header">
          <span class="playback-section__title">播放列表</span>
          <button class="playback-btn playback-btn--add" onClick={handleAddFile} title="添加文件">
            + 添加文件
          </button>
        </div>
        <div class="playback-file-list">
          <Show when={files().length === 0}>
            <div class="playback-file-list__empty">
              暂无回放文件，点击「+ 添加文件」导入 CAN 日志文件
            </div>
          </Show>
          <For each={files()}>
            {(file, index) => (
              <div
                class="playback-file-item"
                classList={{ 'playback-file-item--disabled': !file.enabled }}
              >
                <label class="playback-file-item__checkbox">
                  <input
                    type="checkbox"
                    checked={file.enabled}
                    onChange={(e) => handleToggleFile(index(), e.currentTarget.checked)}
                  />
                  <span class="playback-file-item__index">{index() + 1}</span>
                </label>
                <div class="playback-file-item__info">
                  <span class="playback-file-item__name">{file.fileName}</span>
                  <span class="playback-file-item__meta">
                    {formatDuration(file.duration)} · {formatFrameCount(file.totalFrames)} 帧
                    <Show when={file.startTime}> · {file.startTime}</Show>
                  </span>
                </div>
                <button
                  class="playback-file-item__remove"
                  onClick={() => handleRemoveFile(index())}
                  title="移除文件"
                >
                  ×
                </button>
              </div>
            )}
          </For>
        </div>
        <Show when={files().length > 0}>
          <div class="playback-file-summary">
            已选 {enabledCount()}/{fileCount()} 个文件 · 总时长 {totalDurationStr()} · 总帧 {totalFramesStr()}
          </div>
        </Show>
      </div>

      {/* Playback controls */}
      <div class="playback-section playback-section--controls">
        <div class="playback-controls">
          <div class="playback-controls__main">
            <button
              class="playback-btn playback-btn--step"
              onClick={props.onStepBack}
              disabled={props.playbackState === 'stopped'}
              title="后退一帧"
            >
              ⏮
            </button>

            <Show
              when={props.playbackState === 'playing'}
              fallback={
                <button
                  class="playback-btn playback-btn--play"
                  onClick={() => props.onPlaybackControl('play')}
                  title="播放"
                >
                  ▶
                </button>
              }
            >
              <button
                class="playback-btn playback-btn--pause"
                onClick={() => props.onPlaybackControl('pause')}
                title="暂停"
              >
                ⏸
              </button>
            </Show>

            <button
              class="playback-btn playback-btn--stop"
              onClick={() => props.onPlaybackControl('stop')}
              disabled={props.playbackState === 'stopped'}
              title="停止"
            >
              ■
            </button>

            <button
              class="playback-btn playback-btn--step"
              onClick={props.onStepForward}
              disabled={props.playbackState === 'stopped'}
              title="前进一帧"
            >
              ⏭
            </button>
          </div>

          <div class="playback-controls__options">
            <label class="playback-option">
              <span class="playback-option__label">速度</span>
              <select
                class="playback-option__select"
                value={props.speed}
                onChange={(e) => props.onSetSpeed(parseFloat(e.currentTarget.value))}
              >
                <For each={SPEED_OPTIONS}>
                  {(opt) => <option value={opt}>{opt}x</option>}
                </For>
              </select>
            </label>

            <label class="playback-option">
              <input
                type="checkbox"
                checked={props.loopEnabled}
                onChange={(e) => props.onSetLoop(e.currentTarget.checked)}
              />
              <span class="playback-option__label">循环播放</span>
            </label>
          </div>
        </div>

        {/* Timeline */}
        <div class="playback-timeline">
          <div class="playback-timeline__bar" onClick={handleTimelineClick}>
            <div
              class="playback-timeline__progress"
              style={{ width: `${progress() * 100}%` }}
            />
            <div
              class="playback-timeline__thumb"
              style={{ left: `${progress() * 100}%` }}
            />
          </div>
          <div class="playback-timeline__labels">
            <span>{formatTime(currentTime())}</span>
            <span>{formatTime(props.playlistInfo?.totalDuration ?? null)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlaybackPanel;
import { Component, createSignal, createEffect, onCleanup, For, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { Plus, SkipBack, Play, Pause, Square, SkipForward, Repeat, Gauge, X } from 'lucide-solid';
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
  if (seconds === null || seconds === undefined) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '00:00:00.000';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
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
  const [isDragging, setIsDragging] = createSignal(false);
  let timelineRef!: HTMLDivElement;

  const progress = () => {
    const dur = props.playlistInfo?.totalDuration;
    if (!dur || dur <= 0) return 0;
    return Math.min(currentTime() / dur, 1);
  };

  const files = () => props.playlistInfo?.files ?? [];
  const totalDuration = () => props.playlistInfo?.totalDuration ?? null;
  const enabledCount = () => props.playlistInfo?.enabledCount ?? 0;
  const fileCount = () => props.playlistInfo?.fileCount ?? 0;

  // --- Sync currentTime from playback progress ---
  createEffect(() => {
    if (props.playbackState === 'playing') {
      const interval = setInterval(async () => {
        try {
          const p: number | null = await invoke('get_progress');
          if (p !== null && props.playlistInfo?.totalDuration) {
            setCurrentTime(p * props.playlistInfo.totalDuration);
          }
        } catch {
          // ignore
        }
      }, 200);
      onCleanup(() => clearInterval(interval));
    }
  });

  // --- IPC helpers ---
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

  // --- Timeline interaction ---
  const computeTimestamp = (e: MouseEvent): number => {
    const dur = props.playlistInfo?.totalDuration;
    if (!dur) return 0;
    const rect = timelineRef.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return ratio * dur;
  };

  const handleTimelineMouseDown = (e: MouseEvent) => {
    const ts = computeTimestamp(e);
    setCurrentTime(ts);
    setIsDragging(true);

    const onMouseMove = (ev: MouseEvent) => {
      setCurrentTime(computeTimestamp(ev));
    };
    const onMouseUp = (ev: MouseEvent) => {
      setIsDragging(false);
      const finalTs = computeTimestamp(ev);
      setCurrentTime(finalTs);
      props.onSeek(finalTs);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div class="playback-panel">
      {/* ---- 工具栏 ---- */}
      <div class="playback-panel__toolbar">
        <div class="playback-panel__toolbar-left">
          {/* 添加文件 */}
          <button
            class="playback-panel__tool-btn"
            title="添加文件"
            aria-label="添加文件"
            onClick={handleAddFile}
          >
            <Plus size={14} />
          </button>

          <div class="playback-panel__tool-sep" />

          {/* 后退一帧 */}
          <button
            class="playback-panel__tool-btn"
            title="后退一帧"
            aria-label="后退一帧"
            disabled={props.playbackState === 'stopped'}
            onClick={props.onStepBack}
          >
            <SkipBack size={14} />
          </button>

          {/* 播放 / 暂停 */}
          <Show
            when={props.playbackState === 'playing'}
            fallback={
              <button
                class="playback-panel__tool-btn"
                classList={{ 'playback-panel__tool-btn--accent': true }}
                title="播放"
                aria-label="播放"
                onClick={() => props.onPlaybackControl('play')}
              >
                <Play size={14} />
              </button>
            }
          >
            <button
              class="playback-panel__tool-btn"
              classList={{ 'playback-panel__tool-btn--active': true }}
              title="暂停"
              aria-label="暂停"
              onClick={() => props.onPlaybackControl('pause')}
            >
              <Pause size={14} />
            </button>
          </Show>

          {/* 停止 */}
          <button
            class="playback-panel__tool-btn"
            title="停止"
            aria-label="停止"
            disabled={props.playbackState === 'stopped'}
            onClick={() => props.onPlaybackControl('stop')}
          >
            <Square size={14} />
          </button>

          {/* 前进一帧 */}
          <button
            class="playback-panel__tool-btn"
            title="前进一帧"
            aria-label="前进一帧"
            disabled={props.playbackState === 'stopped'}
            onClick={props.onStepForward}
          >
            <SkipForward size={14} />
          </button>
        </div>

        <div class="playback-panel__toolbar-right">
          {/* 速度选择 */}
          <div class="playback-panel__speed-ctrl">
            <Gauge size={12} />
            <select
              class="playback-panel__speed-select"
              value={props.speed}
              onChange={(e) => props.onSetSpeed(parseFloat(e.currentTarget.value))}
              title="播放速度"
            >
              <For each={SPEED_OPTIONS}>
                {(opt) => <option value={opt}>{opt}x</option>}
              </For>
            </select>
          </div>

          {/* 循环播放 */}
          <button
            class="playback-panel__tool-btn"
            classList={{ 'playback-panel__tool-btn--active': props.loopEnabled }}
            title={props.loopEnabled ? '循环播放: 开' : '循环播放: 关'}
            aria-label={props.loopEnabled ? '关闭循环播放' : '开启循环播放'}
            onClick={() => props.onSetLoop(!props.loopEnabled)}
          >
            <Repeat size={14} />
          </button>
        </div>
      </div>

      {/* ---- 文件列表 ---- */}
      <div class="playback-panel__file-list">
        <Show when={files().length === 0}>
          <div class="playback-panel__file-list-empty">
            暂无回放文件
            <br />
            点击工具栏 <Plus size={12} style="display:inline;vertical-align:middle" /> 添加 CAN 日志文件
          </div>
        </Show>
        <For each={files()}>
          {(file, index) => (
            <div
              class="playback-panel__file-item"
              classList={{ 'playback-panel__file-item--disabled': !file.enabled }}
            >
              <label class="playback-panel__file-checkbox">
                <input
                  type="checkbox"
                  checked={file.enabled}
                  onChange={(e) => handleToggleFile(index(), e.currentTarget.checked)}
                />
                <span class="playback-panel__file-index">{index() + 1}</span>
              </label>
              <div class="playback-panel__file-info">
                <span class="playback-panel__file-name">{file.fileName}</span>
                <span class="playback-panel__file-meta">
                  {formatDuration(file.duration)} · {formatFrameCount(file.totalFrames)} 帧
                  <Show when={file.startTime}> · {file.startTime}</Show>
                </span>
              </div>
              <button
                class="playback-panel__file-remove"
                onClick={() => handleRemoveFile(index())}
                title="移除文件"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </For>
      </div>

      {/* ---- 底部栏: 时间轴 + 摘要 ---- */}
      <div class="playback-panel__footer">
        <div
          ref={timelineRef}
          class="playback-panel__timeline"
          onMouseDown={handleTimelineMouseDown}
        >
          <div
            class="playback-panel__timeline-track"
            style={{ width: `${progress() * 100}%` }}
          />
          <div
            class="playback-panel__timeline-thumb"
            classList={{ 'playback-panel__timeline-thumb--active': isDragging() }}
            style={{ left: `${progress() * 100}%` }}
          />
        </div>
        <div class="playback-panel__footer-info">
          <span class="playback-panel__footer-time">{formatTime(currentTime())}</span>
          <span class="playback-panel__footer-summary">
            {enabledCount()}/{fileCount()} 个文件 · {formatDuration(totalDuration())}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PlaybackPanel;
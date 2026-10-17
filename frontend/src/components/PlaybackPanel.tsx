import { Component, createSignal, createEffect, onCleanup, onMount, For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { invoke } from '@tauri-apps/api/core';
import { Play, Pause, Square, Gauge, Repeat, FilePlus, FolderPlus, FileXCorner, Trash2, Settings, X, ChevronDown, Check } from 'lucide-solid';
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

  // 倍速下拉菜单
  const SPEED_OPTIONS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8, 16, 32];
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = createSignal(false);
  const [speedMenuPos, setSpeedMenuPos] = createSignal({ left: 0, top: 0 });
  let speedBtnRef!: HTMLButtonElement;
  let speedMenuRef!: HTMLDivElement;

  const handleSpeedMenuToggle = (e: MouseEvent) => {
    e.stopPropagation();
    const willOpen = !isSpeedMenuOpen();
    if (willOpen && speedBtnRef) {
      const rect = speedBtnRef.getBoundingClientRect();
      setSpeedMenuPos({ left: rect.left, top: rect.bottom + 4 });
    }
    setIsSpeedMenuOpen(willOpen);
  };

  const handleSpeedSelect = (speed: number) => {
    props.onSetSpeed(speed);
    setIsSpeedMenuOpen(false);
  };

  const closeSpeedMenu = (e: MouseEvent) => {
    if (speedBtnRef && speedBtnRef.contains(e.target as Node)) return;
    if (speedMenuRef && speedMenuRef.contains(e.target as Node)) return;
    setIsSpeedMenuOpen(false);
  };

  onMount(() => {
    document.addEventListener('click', closeSpeedMenu);
  });

  onCleanup(() => {
    document.removeEventListener('click', closeSpeedMenu);
  });

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

  const handleAddFolder = async () => {
    // TODO: 添加文件夹（批量导入 CAN 日志）
  };

  const handleRemoveFile = async (index: number) => {
    try {
      await invoke('playlist_remove', { index });
      props.onRefreshPlaylist();
    } catch (e) {
      console.error('Failed to remove file:', e);
    }
  };

  const handleClearAll = async () => {
    try {
      await invoke('playlist_clear');
      props.onRefreshPlaylist();
    } catch (e) {
      console.error('Failed to clear playlist:', e);
    }
  };

  const handleRemoveSelected = async () => {
    // TODO: 选中文件后移除
  };

  const handleSettings = () => {
    // TODO: 打开回放设置
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
        {/* 播放控制 */}
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

        <button
          class="playback-panel__tool-btn"
          title="停止"
          aria-label="停止"
          disabled={props.playbackState === 'stopped'}
          onClick={() => props.onPlaybackControl('stop')}
        >
          <Square size={14} />
        </button>

        <button
          ref={speedBtnRef}
          class="playback-panel__tool-btn"
          classList={{ 'playback-panel__tool-btn--active': isSpeedMenuOpen() }}
          title={`播放速度: ${props.speed}x`}
          aria-label="播放速度"
          onClick={handleSpeedMenuToggle}
        >
          <Gauge size={14} />
          <ChevronDown size={10} class="playback-panel__speed-chevron" classList={{ 'playback-panel__speed-chevron--open': isSpeedMenuOpen() }} />
        </button>

        <button
          class="playback-panel__tool-btn"
          classList={{ 'playback-panel__tool-btn--active': props.loopEnabled }}
          title={props.loopEnabled ? '循环播放: 开' : '循环播放: 关'}
          aria-label="循环播放"
          onClick={() => props.onSetLoop(!props.loopEnabled)}
        >
          <Repeat size={14} />
        </button>

        <div class="playback-panel__tool-sep" />

        {/* 文件管理 */}
        <button
          class="playback-panel__tool-btn"
          title="添加文件"
          aria-label="添加文件"
          onClick={handleAddFile}
        >
          <FilePlus size={14} />
        </button>
        <button
          class="playback-panel__tool-btn"
          title="添加文件夹"
          aria-label="添加文件夹"
          onClick={handleAddFolder}
        >
          <FolderPlus size={14} />
        </button>
        <button
          class="playback-panel__tool-btn"
          title="移除选中文件"
          aria-label="移除选中文件"
          disabled={files().length === 0}
          onClick={handleRemoveSelected}
        >
          <FileXCorner size={14} />
        </button>
        <button
          class="playback-panel__tool-btn"
          title="清空列表"
          aria-label="清空列表"
          disabled={files().length === 0}
          onClick={handleClearAll}
        >
          <Trash2 size={14} />
        </button>

        <div class="playback-panel__tool-sep" />

        {/* 设置 */}
        <button
          class="playback-panel__tool-btn"
          title="回放设置"
          aria-label="回放设置"
          onClick={handleSettings}
        >
          <Settings size={14} />
        </button>
      </div>

      {/* 倍速下拉菜单 */}
      <Portal>
        <div
          ref={speedMenuRef}
          class="playback-panel__speed-menu"
          classList={{ 'playback-panel__speed-menu--open': isSpeedMenuOpen() }}
          role="menu"
          style={{
            left: `${speedMenuPos().left}px`,
            top: `${speedMenuPos().top}px`,
            display: isSpeedMenuOpen() ? 'flex' : 'none',
          }}
        >
          {SPEED_OPTIONS.map((speed) => (
            <button
              class="playback-panel__speed-menu-item"
              classList={{ 'playback-panel__speed-menu-item--selected': props.speed === speed }}
              role="menuitem"
              onClick={() => handleSpeedSelect(speed)}
            >
              <span class="playback-panel__speed-menu-check">
                {props.speed === speed && <Check size={12} />}
              </span>
              <span class="playback-panel__speed-menu-label">{speed}x</span>
            </button>
          ))}
        </div>
      </Portal>

      {/* ---- 文件列表 ---- */}
      <div class="playback-panel__file-list">
        <Show when={files().length === 0}>
          <div class="playback-panel__file-list-empty">
            暂无回放文件
            <br />
            点击工具栏 <FilePlus size={12} style="display:inline;vertical-align:middle" /> 添加 CAN 日志文件
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
import { Component, createSignal, createEffect, onCleanup, onMount, For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { invoke } from '@tauri-apps/api/core';
import { Play, Pause, Square, Gauge, Repeat, FilePlus, FolderPlus, FileXCorner, Trash2, Settings, ChevronDown, ChevronUp, Check } from 'lucide-solid';
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

function formatTimeHMS(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '--:--:--';
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
  const [isDragging, setIsDragging] = createSignal(false);
  let timelineRef!: HTMLDivElement;

  // 倍速下拉菜单
  const SPEED_OPTIONS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8, 16, 32];
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = createSignal(false);
  const [speedMenuPos, setSpeedMenuPos] = createSignal({ left: 0, top: 0 });
  let speedBtnRef!: HTMLButtonElement;
  let speedMenuRef!: HTMLDivElement;

  // 文件列表多选
  const [selectedFiles, setSelectedFiles] = createSignal<Set<number>>(new Set());
  const [selectedFileAnchor, setSelectedFileAnchor] = createSignal<number | null>(null);

  // 全局时间轴 hover 提示
  const [timelineHover, setTimelineHover] = createSignal<{ time: number; left: number } | null>(null);

  // 当前播放到的文件索引 (基于 currentTime 估算)
  const currentFileIndex = () => {
    const t = currentTime();
    const fls = files();
    if (fls.length === 0) return -1;
    let acc = 0;
    for (let i = 0; i < fls.length; i++) {
      const f = fls[i];
      if (!f.enabled) continue;
      const dur = (f.playEndOffset ?? f.duration ?? 0) - f.playStartOffset;
      if (t >= acc && t < acc + dur) return i;
      acc += dur;
    }
    return -1;
  };

  // 获取每个文件的播放游标位置 (% of full file duration) 和 全局时间偏移
  const getFilePlayheadInfo = (fileIndex: number) => {
    const fls = files();
    const t = currentTime();
    let globalAcc = 0;
    for (let i = 0; i < fls.length; i++) {
      const f = fls[i];
      if (!f.enabled) continue;
      const effDur = (f.playEndOffset ?? f.duration ?? 0) - f.playStartOffset;
      if (i === fileIndex) {
        if (!f.duration || f.duration <= 0) return { percent: -1, state: 'none' as const };
        const localTime = t - globalAcc + f.playStartOffset;
        if (t < globalAcc) return { percent: -1, state: 'pending' as const };
        if (t >= globalAcc + effDur) return { percent: 100, state: 'completed' as const };
        return { percent: (localTime / f.duration) * 100, state: 'playing' as const };
      }
      globalAcc += effDur;
    }
    return { percent: -1, state: 'none' as const };
  };

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

  let handleKeyDown: (e: KeyboardEvent) => void;

  onMount(() => {
    document.addEventListener('click', closeSpeedMenu);
    handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (props.playbackState === 'playing') {
          props.onPlaybackControl('pause');
        } else {
          props.onPlaybackControl('play');
        }
      } else if (e.key === 'Escape') {
        props.onPlaybackControl('stop');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener('click', closeSpeedMenu);
    document.removeEventListener('keydown', handleKeyDown!);
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
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        title: '选择包含 CAN 日志的文件夹',
        directory: true,
        multiple: false,
      });
      if (!selected) return;

      const folderPath = typeof selected === 'string' ? selected : null;
      if (!folderPath) return;

      await invoke('playlist_add_folder', { folderPath });
      props.onRefreshPlaylist();
    } catch (e) {
      console.error('Failed to add folder:', e);
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

  const handleSelectAll = async () => {
    const allEnabled = files().every((f) => f.enabled);
    try {
      if (allEnabled) {
        // 全不选
        for (let i = 0; i < files().length; i++) {
          await invoke('playlist_toggle', { index: i, enabled: false });
        }
      } else {
        // 全选
        for (let i = 0; i < files().length; i++) {
          await invoke('playlist_toggle', { index: i, enabled: true });
        }
      }
      props.onRefreshPlaylist();
    } catch (e) {
      console.error('Failed to toggle all files:', e);
    }
  };

  // 单文件时间轴拖拽
  const [draggingOffset, setDraggingOffset] = createSignal<{
    fileIndex: number;
    handle: 'start' | 'end';
  } | null>(null);

  // 时间轴 hover 时间提示
  const [hoverTip, setHoverTip] = createSignal<{ fileIndex: number; time: number; left: number } | null>(null);

  const handleTimelineMouseMove = (e: MouseEvent, fileIndex: number) => {
    const file = files()[fileIndex];
    if (!file || file.duration == null || file.duration === 0) { setHoverTip(null); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTip({ fileIndex, time: ratio * file.duration, left: e.clientX - rect.left });
  };

  const handleTimelineMouseLeave = () => setHoverTip(null);

  // 列宽拖拽调整
  const [nameColumnWidth, setNameColumnWidth] = createSignal(200);
  const [timelineColumnWidth, setTimelineColumnWidth] = createSignal(180);
  const [isResizing, setIsResizing] = createSignal(false);
  let resizeStartX = 0;
  let resizeStartWidth = 0;

  const handleNameResizeStart = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartX = e.clientX;
    resizeStartWidth = nameColumnWidth();
    setIsResizing(true);

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - resizeStartX;
      setNameColumnWidth(Math.max(100, Math.min(600, resizeStartWidth + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setIsResizing(false);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const handleTimelineResizeStart = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartX = e.clientX;
    resizeStartWidth = timelineColumnWidth();
    setIsResizing(true);

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - resizeStartX;
      setTimelineColumnWidth(Math.max(80, Math.min(400, resizeStartWidth + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setIsResizing(false);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  createEffect(() => {
    if (isResizing()) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  const handleOffsetMouseDown = (e: MouseEvent, fileIndex: number, handle: 'start' | 'end') => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingOffset({ fileIndex, handle });

    const onMove = (ev: MouseEvent) => {
      const file = files()[fileIndex];
      if (!file || file.duration == null || file.duration === 0) return;
      const bar = (ev.currentTarget as HTMLElement)?.closest('.playback-panel__file-timeline');
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const newOffset = ratio * file.duration;
      const current = draggingOffset();
      if (current?.handle === 'start') {
        const end = file.playEndOffset ?? file.duration;
        if (newOffset < end - 0.1) {
          // Update local visual only
        }
      }
    };

    const onUp = async (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const state = draggingOffset();
      if (!state) return;

      const file = files()[state.fileIndex];
      if (!file || file.duration == null) return;
      const bar = document.querySelector(
        `.playback-panel__file-timeline[data-index="${state.fileIndex}"]`
      );
      if (!bar) { setDraggingOffset(null); return; }
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const newOffset = ratio * file.duration;

      let startOffset = file.playStartOffset;
      let endOffset = file.playEndOffset;

      if (state.handle === 'start') {
        startOffset = Math.max(0, Math.min(newOffset, (endOffset ?? file.duration) - 0.1));
      } else {
        const minEnd = startOffset + 0.1;
        endOffset = Math.min(file.duration, Math.max(minEnd, newOffset));
      }

      setDraggingOffset(null);
      try {
        await invoke('playlist_set_offset', {
          index: state.fileIndex,
          playStartOffset: startOffset,
          playEndOffset: endOffset,
        });
        props.onRefreshPlaylist();
      } catch (e) {
        console.error('Failed to set offset:', e);
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const handleFileClick = (index: number, e?: MouseEvent) => {
    const ctrl = e?.ctrlKey || e?.metaKey;
    const shift = e?.shiftKey;

    if (ctrl) {
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        return next;
      });
      setSelectedFileAnchor(index);
    } else if (shift && selectedFileAnchor() !== null) {
      const anchor = selectedFileAnchor()!;
      const lo = Math.min(anchor, index);
      const hi = Math.max(anchor, index);
      const next = new Set<number>();
      for (let i = lo; i <= hi; i++) next.add(i);
      setSelectedFiles(next);
    } else {
      setSelectedFileAnchor(index);
      setSelectedFiles(new Set([index]));
    }
  };

  const handleRemoveSelected = async () => {
    const checked = files().filter((f) => f.enabled);
    if (checked.length === 0) return;

    const indices = checked.map((_, i) => files().findIndex((f) => f === checked[i])).sort((a, b) => b - a);
    try {
      for (const id of indices) {
        await invoke('playlist_remove', { index: id });
      }
      props.onRefreshPlaylist();
    } catch (e) {
      console.error('Failed to remove selected files:', e);
    }
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
          {isSpeedMenuOpen() ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
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
          title="移除勾选文件"
          aria-label="移除勾选文件"
          disabled={!files().some((f) => f.enabled)}
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
        <Show when={files().length > 0}>
          <table class="playback-panel__table">
            <colgroup>
              <col style={{ width: '40px' }} />
              <col style={{ width: `${nameColumnWidth()}px` }} />
              <col style={{ width: `${timelineColumnWidth()}px` }} />
            </colgroup>
            <thead class="playback-panel__thead">
              <tr>
                <th class="playback-panel__th playback-panel__th--check">
                  <input
                    type="checkbox"
                    checked={files().every((f) => f.enabled)}
                    onChange={handleSelectAll}
                    title="全选 / 全不选"
                  />
                </th>
                <th class="playback-panel__th playback-panel__th--name">
                  文件名
                  <div class="playback-panel__col-resizer" onMouseDown={handleNameResizeStart} />
                </th>
                <th class="playback-panel__th playback-panel__th--timeline">
                  时间轴
                  <div class="playback-panel__col-resizer" onMouseDown={handleTimelineResizeStart} />
                </th>
              </tr>
            </thead>
            <tbody>
              <For each={files()}>
                {(file, index) => (
                  <tr
                    class="playback-panel__row"
                    classList={{
                      'playback-panel__row--disabled': !file.enabled,
                      'playback-panel__row--selected': selectedFiles().has(index()),
                      'playback-panel__row--playing': props.playbackState === 'playing' && currentFileIndex() === index(),
                    }}
                    onClick={(e) => handleFileClick(index(), e)}
                  >
                    <td class="playback-panel__td playback-panel__td--check">
                      <label onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={file.enabled}
                          onChange={(e) => handleToggleFile(index(), e.currentTarget.checked)}
                        />
                      </label>
                    </td>
                    <td class="playback-panel__td playback-panel__td--name">
                      <span class="playback-panel__file-name">{file.fileName}</span>
                      <span class="playback-panel__file-meta">
                        {formatDuration(file.duration)} · {formatFrameCount(file.totalFrames)} 帧
                        <Show when={file.startTime}> · {file.startTime}</Show>
                      </span>
                    </td>
                    <td class="playback-panel__td playback-panel__td--timeline">
                      <div
                        class="playback-panel__file-timeline"
                        classList={{
                          'playback-panel__file-timeline--dragging': draggingOffset()?.fileIndex === index(),
                          'playback-panel__file-timeline--completed':
                            props.playbackState === 'playing' && getFilePlayheadInfo(index()).state === 'completed',
                        }}
                        data-index={index()}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onMouseMove={(e) => handleTimelineMouseMove(e, index())}
                        onMouseLeave={handleTimelineMouseLeave}
                      >
                        <Show when={file.duration != null && file.duration > 0}>
                          {/* 有效播放范围 */}
                          <div
                            class="playback-panel__file-timeline-range"
                            style={{
                              left: `${(file.playStartOffset / file.duration!) * 100}%`,
                              width: `${(((file.playEndOffset ?? file.duration!) - file.playStartOffset) / file.duration!) * 100}%`,
                            }}
                          />
                          {/* 播放游标 */}
                          <Show when={getFilePlayheadInfo(index()).state !== 'none' && getFilePlayheadInfo(index()).state !== 'pending'}>
                            {(() => {
                              const info = getFilePlayheadInfo(index());
                              return (
                                <div
                                  class="playback-panel__file-timeline-playhead"
                                  style={{ left: `${info.percent}%` }}
                                />
                              );
                            })()}
                          </Show>
                          {/* 拖拽手柄 */}
                          <div
                            class="playback-panel__file-timeline-handle playback-panel__file-timeline-handle--start"
                            style={{ left: `${(file.playStartOffset / file.duration!) * 100}%` }}
                            onMouseDown={(e) => handleOffsetMouseDown(e, index(), 'start')}
                            title="拖拽设置播放起始点"
                          />
                          <div
                            class="playback-panel__file-timeline-handle playback-panel__file-timeline-handle--end"
                            style={{ left: `${((file.playEndOffset ?? file.duration!) / file.duration!) * 100 - 0.5}%` }}
                            onMouseDown={(e) => handleOffsetMouseDown(e, index(), 'end')}
                            title="拖拽设置播放结束点"
                          />
                          {/* Hover 时间提示 */}
                          <Show when={hoverTip()?.fileIndex === index()}>
                            <div
                              class="playback-panel__file-timeline-tip"
                              style={{ left: `${hoverTip()!.left}px` }}
                            >
                              {formatTime(hoverTip()!.time)}
                            </div>
                          </Show>
                        </Show>
                      </div>
                      {/* 时间范围标签：左=startHandle时刻，右=endHandle时刻 */}
                      <div class="playback-panel__file-timeline-labels">
                        <span
                          class="playback-panel__file-timeline-label"
                          classList={{
                            'playback-panel__file-timeline-label--custom': file.playStartOffset > 0,
                          }}
                        >
                          {formatTimeHMS(file.playStartOffset)}
                        </span>
                        <span
                          class="playback-panel__file-timeline-label"
                          classList={{
                            'playback-panel__file-timeline-label--custom':
                              file.playEndOffset != null && file.playEndOffset !== file.duration,
                          }}
                        >
                          {formatTimeHMS(file.playEndOffset ?? file.duration)}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>

      {/* ---- 底部栏: 时间轴 + 摘要 ---- */}
      <div class="playback-panel__footer">
        <div
          ref={timelineRef}
          class="playback-panel__timeline"
          onMouseDown={handleTimelineMouseDown}
          onMouseMove={(e) => {
            const dur = props.playlistInfo?.totalDuration;
            if (!dur) { setTimelineHover(null); return; }
            const rect = timelineRef.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setTimelineHover({ time: ratio * dur, left: e.clientX - rect.left });
          }}
          onMouseLeave={() => setTimelineHover(null)}
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
          <Show when={timelineHover()}>
            <div
              class="playback-panel__timeline-tooltip"
              style={{ left: `${timelineHover()!.left}px` }}
            >
              {formatTime(timelineHover()!.time)}
            </div>
          </Show>
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
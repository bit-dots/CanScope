import { Component, createSignal, onMount, onCleanup, Show } from 'solid-js';
import type { FrameInfo } from '../types';
import { formatHex, formatDataHex } from '../types';
import { SlidersHorizontal, Search, Eraser, Pause, Play, ListClock, Activity } from 'lucide-solid';

interface FrameTableProps {
  frames: FrameInfo[];
  totalFrameCount: number;
  hasDbc?: boolean;
}

const ROW_HEIGHT = 28;
const OVERSCAN = 20;

const FrameTable: Component<FrameTableProps> = (props) => {
  let containerRef!: HTMLDivElement;
  let resizeObserver: ResizeObserver | undefined;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewHeight, setViewHeight] = createSignal(0);
  const [selectedRow, setSelectedRow] = createSignal<number | null>(null);
  const [isPaused, setIsPaused] = createSignal(false);
  const [isRelativeTime, setIsRelativeTime] = createSignal(false);

  const pauseSnapshot = createSignal(0);
  const [pausedCount, setPausedCount] = pauseSnapshot;

  const displayedFrames = () => {
    if (isPaused()) {
      return props.frames.slice(0, pausedCount());
    }
    return props.frames;
  };

  const handlePauseToggle = () => {
    if (!isPaused()) {
      setPausedCount(props.frames.length);
    }
    setIsPaused(!isPaused());
  };

  const formatTimestamp = (frame: FrameInfo) => {
    if (isRelativeTime() && props.frames.length > 0) {
      return (frame.timestamp - props.frames[0].timestamp).toFixed(6);
    }
    return frame.timestamp.toFixed(6);
  };

  const totalHeight = () => displayedFrames().length * ROW_HEIGHT;
  const startIndex = () => Math.max(0, Math.floor(scrollTop() / ROW_HEIGHT) - OVERSCAN);
  const endIndex = () => Math.min(
    displayedFrames().length,
    Math.ceil((scrollTop() + viewHeight()) / ROW_HEIGHT) + OVERSCAN,
  );
  const visibleFrames = () => displayedFrames().slice(startIndex(), endIndex());

  const handleScroll = () => {
    setScrollTop(containerRef.scrollTop);
  };

  onMount(() => {
    setViewHeight(containerRef.clientHeight);
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewHeight(entry.contentRect.height);
      }
    });
    resizeObserver.observe(containerRef);
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
  });

  const handleRowClick = (idx: number) => {
    setSelectedRow(prev => prev === idx ? null : idx);
  };

  const errorCount = () => props.frames.filter((f) => (f as any).is_error).length;
  const hasError = () => errorCount() > 0;

  return (
    <div class="frame-table">
      {/* ---- 工具栏 ---- */}
      <div class="frame-table__toolbar">
        <div class="frame-table__toolbar-left">
          {/* 属性 */}
          <button
            class="frame-table__tool-btn"
            disabled={selectedRow() === null}
            title="查看报文属性"
            aria-label="查看报文属性"
          >
            <SlidersHorizontal size={14} />
          </button>

          {/* 查找 */}
          <button
            class="frame-table__tool-btn"
            title="查找报文"
            aria-label="查找报文"
          >
            <Search size={14} />
          </button>

          {/* 清空 */}
          <button
            class="frame-table__tool-btn"
            title="清空报文列表"
            aria-label="清空报文列表"
          >
            <Eraser size={14} />
          </button>

          {/* 暂停 */}
          <button
            class="frame-table__tool-btn"
            classList={{ 'frame-table__tool-btn--active': isPaused() }}
            onClick={handlePauseToggle}
            title={isPaused() ? '继续输出' : '暂停输出'}
            aria-label={isPaused() ? '继续输出' : '暂停输出'}
          >
            {isPaused() ? <Play size={14} /> : <Pause size={14} />}
          </button>

          {/* 时间显示格式 */}
          <button
            class="frame-table__tool-btn"
            classList={{ 'frame-table__tool-btn--active': isRelativeTime() }}
            onClick={() => setIsRelativeTime(!isRelativeTime())}
            title={isRelativeTime() ? '切换到绝对时间' : '切换到相对时间'}
            aria-label={isRelativeTime() ? '切换到绝对时间' : '切换到相对时间'}
          >
            <ListClock size={14} />
          </button>
        </div>
      </div>

      {/* ---- 内容区：报文表格 ---- */}
      <div
        ref={containerRef}
        class="frame-table__body"
        onScroll={handleScroll}
      >
        <table class="frame-table__table">
          <thead class="frame-table__thead">
            <tr>
              <th class="frame-table__th frame-table__th--time">
                时间 ({isRelativeTime() ? '相对' : '绝对'} s)
              </th>
              <th class="frame-table__th frame-table__th--channel">通道</th>
              <th class="frame-table__th frame-table__th--canid">ID</th>
              {props.hasDbc && <th class="frame-table__th frame-table__th--name">名称</th>}
              <th class="frame-table__th frame-table__th--type">类型</th>
              <th class="frame-table__th frame-table__th--direction">方向</th>
              <th class="frame-table__th frame-table__th--dlc">长度</th>
              <th class="frame-table__th frame-table__th--data">数据</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ height: `${startIndex() * ROW_HEIGHT}px` }} />
            {visibleFrames().map((frame, i) => {
              const idx = startIndex() + i;
              const isSelected = selectedRow() === idx;
              const isBrs = (frame as any).is_brs as boolean | undefined;
              const typeLabel = frame.is_fd
                ? (isBrs ? 'CAN FD(加速)' : 'CAN FD')
                : 'CAN';
              const typeClass = frame.is_fd
                ? (isBrs ? 'canfd-brs' : 'canfd')
                : 'can';
              return (
                <tr
                  class="frame-table__row"
                  classList={{
                    'frame-table__row--selected': isSelected,
                    'frame-table__row--even': idx % 2 === 0,
                  }}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  onClick={() => handleRowClick(idx)}
                >
                  <td class="frame-table__td frame-table__td--time">{formatTimestamp(frame)}</td>
                  <td class="frame-table__td frame-table__td--channel">CH{frame.bus_id + 1}</td>
                  <td class="frame-table__td frame-table__td--canid">
                    {formatHex(frame.can_id, frame.is_extended ? 8 : 3)}
                  </td>
                  {props.hasDbc && (
                    <td class="frame-table__td frame-table__td--name">{(frame as any).message_name ?? ''}</td>
                  )}
                  <td class="frame-table__td frame-table__td--type">
                    <span class={`frame-table__type-badge frame-table__type-badge--${typeClass}`}>
                      {typeLabel}
                    </span>
                  </td>
                  <td class="frame-table__td frame-table__td--direction">
                    <span class="frame-table__direction-badge">RX</span>
                  </td>
                  <td class="frame-table__td frame-table__td--dlc">{frame.dlc}</td>
                  <td class="frame-table__td frame-table__td--data">
                    {formatDataHex(frame.data, frame.dlc)}
                  </td>
                </tr>
              );
            })}
            <tr style={{ height: `${Math.max(0, totalHeight() - endIndex() * ROW_HEIGHT)}px` }} />
          </tbody>
        </table>

        {/* 空状态 */}
        <Show when={props.totalFrameCount === 0}>
          <div class="frame-table__empty">
            <div class="frame-table__empty-icon">
              <Activity size={40} stroke-width={1.2} />
            </div>
            <span class="frame-table__empty-title">暂无报文数据</span>
            <span class="frame-table__empty-desc">请加载数据文件并启动播放</span>
          </div>
        </Show>
      </div>

      {/* ---- 状态栏 ---- */}
      <div class="frame-table__statusbar">
        <div class="frame-table__statusbar-left">
          {isPaused() && <span class="frame-table__statusbar-label">已暂停</span>}
        </div>
        <div class="frame-table__statusbar-right">
          <span class="frame-table__statusbar-item" title="接收帧数">
            <span>RX: {displayedFrames().length.toLocaleString()}</span>
          </span>
          <span class="frame-table__statusbar-item" title="发送帧数">
            <span>TX: 0</span>
          </span>
          <span class="frame-table__statusbar-item" classList={{ 'frame-table__statusbar-item--error': !hasError(), 'frame-table__statusbar-item--error-active': hasError() }} title="错误帧数">
            <span>Err: {errorCount().toLocaleString()}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default FrameTable;
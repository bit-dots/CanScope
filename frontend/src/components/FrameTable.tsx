import { Component, createSignal, onMount, onCleanup, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Portal } from 'solid-js/web';
import type { FrameInfo } from '../types';
import { formatHex, formatDataHex } from '../types';
import { SlidersHorizontal, Search, Eraser, Pause, Play, ListClock, Activity, ChevronRight, ChevronDown, Check } from 'lucide-solid';

interface FrameTableProps {
  frames: FrameInfo[];
  totalFrameCount: number;
  hasDbc?: boolean;
}

const ROW_HEIGHT = 28;
const OVERSCAN = 20;

interface ColumnDef {
  key: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
}

const COLUMNS: ColumnDef[] = [
  { key: 'time',      label: '时间', defaultWidth: 110, minWidth: 60 },
  { key: 'channel',   label: '通道', defaultWidth: 48,  minWidth: 40 },
  { key: 'canid',     label: 'ID',   defaultWidth: 72,  minWidth: 50 },
  { key: 'name',      label: '名称', defaultWidth: 120, minWidth: 60 },
  { key: 'type',      label: '类型', defaultWidth: 48,  minWidth: 40 },
  { key: 'direction', label: '方向', defaultWidth: 42,  minWidth: 36 },
  { key: 'dlc',       label: '长度', defaultWidth: 40,  minWidth: 36 },
  { key: 'data',      label: '数据', defaultWidth: 0,   minWidth: 80 },
];

const FrameTable: Component<FrameTableProps> = (props) => {
  let containerRef!: HTMLDivElement;
  let resizeObserver: ResizeObserver | undefined;
  let timeMenuRef!: HTMLDivElement;
  let timeBtnRef!: HTMLButtonElement;
  let pauseBtnRef!: HTMLButtonElement;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewHeight, setViewHeight] = createSignal(0);
  const [selectedRow, setSelectedRow] = createSignal<number | null>(null);
  const [isPaused, setIsPaused] = createSignal(false);
  const [timeFormat, setTimeFormat] = createSignal<'absolute' | 'relative-to-start' | 'relative-to-prev'>('absolute');
  const [isTimeMenuOpen, setIsTimeMenuOpen] = createSignal(false);
  const [menuPos, setMenuPos] = createSignal({ left: 0, top: 0 });

  const pauseSnapshot = createSignal(0);
  const [pausedCount, setPausedCount] = pauseSnapshot;

  // ---- 列宽状态 ----
  const initWidths: Record<string, number> = {};
  for (const col of COLUMNS) initWidths[col.key] = col.defaultWidth;
  const [columnWidths, setColumnWidths] = createStore<Record<string, number>>(initWidths);
  const [activeResizer, setActiveResizer] = createSignal<string | null>(null);

  const getColConfig = (key: string) => COLUMNS.find((c) => c.key === key)!;

  const handleResizeStart = (colKey: string, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || getColConfig(colKey).minWidth;
    setActiveResizer(colKey);

    const handleMouseMove = (e: MouseEvent) => {
      const minW = getColConfig(colKey).minWidth;
      const newWidth = Math.max(minW, startWidth + (e.clientX - startX));
      setColumnWidths(colKey, newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setActiveResizer(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const visibleColumns = () => COLUMNS.filter((c) => c.key !== 'name' || props.hasDbc);

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

  const timeFormatOptions = [
    { value: 'absolute' as const, label: '绝对时间 (时:分:秒.毫秒)' },
    { value: 'relative-to-start' as const, label: '相对于测量起始时间 (秒)' },
    { value: 'relative-to-prev' as const, label: '相对于上一帧的时间 (秒)' },
  ];

  const formatTimestamp = (frame: FrameInfo, index: number) => {
    switch (timeFormat()) {
      case 'relative-to-start':
        if (props.frames.length > 0) {
          return (frame.timestamp - props.frames[0].timestamp).toFixed(6);
        }
        return frame.timestamp.toFixed(6);
      case 'relative-to-prev': {
        if (index > 0) {
          const prev = displayedFrames()[index - 1];
          return (frame.timestamp - prev.timestamp).toFixed(6);
        }
        return '0.000000';
      }
      case 'absolute':
      default: {
        const totalSeconds = frame.timestamp;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
      }
    }
  };

  const handleTimeMenuToggle = () => {
    const willOpen = !isTimeMenuOpen();
    if (willOpen && timeBtnRef) {
      const rect = timeBtnRef.getBoundingClientRect();
      setMenuPos({ left: rect.left, top: rect.bottom + 4 });
    }
    setIsTimeMenuOpen(willOpen);
  };

  const handleTimeFormatSelect = (format: 'absolute' | 'relative-to-start' | 'relative-to-prev') => {
    setTimeFormat(format);
    setIsTimeMenuOpen(false);
  };

  const closeTimeMenu = (e: MouseEvent) => {
    if (timeBtnRef && timeBtnRef.contains(e.target as Node)) return;
    if (timeMenuRef && timeMenuRef.contains(e.target as Node)) return;
    setIsTimeMenuOpen(false);
  };

  onMount(() => {
    document.addEventListener('click', closeTimeMenu);
  });

  onCleanup(() => {
    document.removeEventListener('click', closeTimeMenu);
  });

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

    pauseBtnRef.addEventListener('click', (e) => {
      e.stopPropagation();
      handlePauseToggle();
    });
    timeBtnRef.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      handleTimeMenuToggle();
    });
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
            ref={pauseBtnRef}
            class="frame-table__tool-btn"
            classList={{ 'frame-table__tool-btn--active': isPaused() }}
            title={isPaused() ? '继续输出' : '暂停输出'}
            aria-label={isPaused() ? '继续输出' : '暂停输出'}
          >
            {isPaused() ? <Play size={14} /> : <Pause size={14} />}
          </button>

          {/* 时间显示格式 */}
          <button
            ref={timeBtnRef}
            class="frame-table__tool-btn"
            title="时间显示格式"
            aria-label="时间显示格式"
          >
            <ListClock size={14} />
            {isTimeMenuOpen() ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

            {/* 时间格式下拉菜单 */}
          <Portal>
            <div
              ref={timeMenuRef}
              class="frame-table__time-menu"
              classList={{ 'frame-table__time-menu--open': isTimeMenuOpen() }}
              role="menu"
              style={{
                left: `${menuPos().left}px`,
                top: `${menuPos().top}px`,
                display: isTimeMenuOpen() ? 'flex' : 'none',
              }}
            >
            {timeFormatOptions.map((opt) => (
              <button
                class="frame-table__time-menu-item"
                classList={{ 'frame-table__time-menu-item--selected': timeFormat() === opt.value }}
                role="menuitem"
                onClick={() => handleTimeFormatSelect(opt.value)}
              >
                <span class="frame-table__time-menu-check">
                  {timeFormat() === opt.value && <Check size={12} />}
                </span>
                <span class="frame-table__time-menu-label">{opt.label}</span>
              </button>
            ))}
          </div>
          </Portal>
        </div>
      </div>

      {/* ---- 内容区：报文表格 ---- */}
      <div
        ref={containerRef}
        class="frame-table__body"
        onScroll={handleScroll}
      >
        <table class="frame-table__table">
          <colgroup>
            {visibleColumns().map((col) => {
              const w = columnWidths[col.key];
              return <col style={{ width: w > 0 ? `${w}px` : undefined }} />;
            })}
          </colgroup>
          <thead class="frame-table__thead">
            <tr>
              {visibleColumns().map((col) => (
                <th class={`frame-table__th frame-table__th--${col.key}`}>
                  {col.label}
                  <div
                    class="frame-table__col-resizer"
                    classList={{ 'frame-table__col-resizer--active': activeResizer() === col.key }}
                    onMouseDown={(e) => handleResizeStart(col.key, e)}
                  />
                </th>
              ))}
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
                  <td class="frame-table__td frame-table__td--time">{formatTimestamp(frame, idx)}</td>
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
            <Activity size={40} stroke-width={1.2} />
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
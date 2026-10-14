import { Component, createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import type { FrameInfo, FilterConfig } from '../types';
import { formatHex, formatDataHex } from '../types';
import { X, ArrowDownToLine, Activity, Search } from 'lucide-solid';

interface FrameTableProps {
  frames: FrameInfo[];
  filter: FilterConfig;
  onFilterChange: (filter: FilterConfig) => void;
  totalFrameCount: number;
}

const ROW_HEIGHT = 28;
const OVERSCAN = 20;

type FrameType = 'ALL' | 'STD' | 'EXT' | 'FD';

const FrameTable: Component<FrameTableProps> = (props) => {
  let containerRef!: HTMLDivElement;
  let resizeObserver: ResizeObserver | undefined;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewHeight, setViewHeight] = createSignal(0);
  const [autoScroll, setAutoScroll] = createSignal(true);
  const [selectedRow, setSelectedRow] = createSignal<number | null>(null);
  const [typeFilter, setTypeFilter] = createSignal<FrameType>('ALL');
  const [canIdInput, setCanIdInput] = createSignal(props.filter.canId);

  const filteredFrames = () => {
    let result = props.frames;
    const tf = typeFilter();
    if (tf !== 'ALL') {
      result = result.filter(f => {
        if (tf === 'FD') return f.is_fd;
        if (tf === 'EXT') return f.is_extended && !f.is_fd;
        return !f.is_extended && !f.is_fd;
      });
    }
    return result;
  };

  const totalHeight = () => filteredFrames().length * ROW_HEIGHT;
  const startIndex = () => Math.max(0, Math.floor(scrollTop() / ROW_HEIGHT) - OVERSCAN);
  const endIndex = () => Math.min(
    filteredFrames().length,
    Math.ceil((scrollTop() + viewHeight()) / ROW_HEIGHT) + OVERSCAN,
  );
  const visibleFrames = () => filteredFrames().slice(startIndex(), endIndex());

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

  const handleCanIdFilter = () => {
    const val = canIdInput().trim();
    if (val === props.filter.canId) return;
    props.onFilterChange({ ...props.filter, canId: val });
  };

  const handleCanIdKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCanIdFilter();
    }
  };

  const handleClearFilter = () => {
    setCanIdInput('');
    props.onFilterChange({ ...props.filter, canId: '' });
  };

  const handleTypeFilter = (type: FrameType) => {
    setTypeFilter(type);
    setSelectedRow(null);
  };

  const handleRowClick = (idx: number) => {
    setSelectedRow(prev => prev === idx ? null : idx);
  };

  const handleClickCanId = (canId: number, isExtended: boolean) => {
    const hex = formatHex(canId, isExtended ? 8 : 3);
    setCanIdInput(hex);
    props.onFilterChange({ ...props.filter, canId: hex });
  };

  const typeButtons: { type: FrameType; label: string }[] = [
    { type: 'ALL', label: '全部' },
    { type: 'STD', label: 'STD' },
    { type: 'EXT', label: 'EXT' },
    { type: 'FD', label: 'FD' },
  ];

  return (
    <div class="frame-table">
      {/* ---- 工具栏 ---- */}
      <div class="frame-table__toolbar">
        <div class="frame-table__toolbar-left">
          {/* CAN ID 快速过滤 */}
          <div class="frame-table__toolbar-group">
            <label class="frame-table__toolbar-label">CAN ID</label>
            <div class="frame-table__canid-input-wrap">
              <input
                type="text"
                class="frame-table__canid-input"
                placeholder="0x..."
                value={canIdInput()}
                onInput={(e) => setCanIdInput(e.currentTarget.value)}
                onKeyDown={handleCanIdKeyDown}
                spellcheck={false}
              />
              {canIdInput() && (
                <button
                  class="frame-table__canid-clear"
                  onClick={handleClearFilter}
                  title="清除过滤"
                  aria-label="清除过滤"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* 帧类型过滤 */}
          <div class="frame-table__toolbar-group">
            <label class="frame-table__toolbar-label">类型</label>
            <div class="frame-table__type-buttons">
              <For each={typeButtons}>
                {(btn) => (
                  <button
                    class="frame-table__type-btn"
                    classList={{ 'frame-table__type-btn--active': typeFilter() === btn.type }}
                    onClick={() => handleTypeFilter(btn.type)}
                  >
                    {btn.label}
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>

        <div class="frame-table__toolbar-right">
          {/* 报文计数 */}
          <span class="frame-table__frame-count">
            <span class="frame-table__frame-count-current">{filteredFrames().length.toLocaleString()}</span>
            <span class="frame-table__frame-count-sep">/</span>
            <span>{props.totalFrameCount.toLocaleString()}</span>
            <span class="frame-table__frame-count-label"> 帧</span>
          </span>

          {/* 自动滚动 */}
          <button
            class="frame-table__tool-btn"
            classList={{ 'frame-table__tool-btn--active': autoScroll() }}
            onClick={() => setAutoScroll(!autoScroll())}
            title={autoScroll() ? '自动滚动：开' : '自动滚动：关'}
            aria-label={autoScroll() ? '关闭自动滚动' : '开启自动滚动'}
          >
            <ArrowDownToLine size={14} />
            <span>自动滚动</span>
          </button>

          {/* 清除选中 */}
          {selectedRow() !== null && (
            <button
              class="frame-table__tool-btn"
              onClick={() => setSelectedRow(null)}
              title="清除选中"
              aria-label="清除选中"
            >
              <X size={14} />
            </button>
          )}
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
              <th class="frame-table__th frame-table__th--idx">#</th>
              <th class="frame-table__th frame-table__th--time">时间 (s)</th>
              <th class="frame-table__th frame-table__th--canid">CAN ID</th>
              <th class="frame-table__th frame-table__th--type">Type</th>
              <th class="frame-table__th frame-table__th--dlc">DLC</th>
              <th class="frame-table__th frame-table__th--data">Data</th>
              <th class="frame-table__th frame-table__th--signals">Signals</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ height: `${startIndex() * ROW_HEIGHT}px` }} />
            {visibleFrames().map((frame, i) => {
              const idx = startIndex() + i;
              const isSelected = selectedRow() === idx;
              const typeLabel = frame.is_fd ? 'FD' : frame.is_extended ? 'EXT' : 'STD';
              const typeClass = frame.is_fd ? 'fd' : frame.is_extended ? 'ext' : 'std';
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
                  <td class="frame-table__td frame-table__td--idx">{idx + 1}</td>
                  <td class="frame-table__td frame-table__td--time">{frame.timestamp.toFixed(6)}</td>
                  <td
                    class="frame-table__td frame-table__td--canid"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClickCanId(frame.can_id, frame.is_extended);
                    }}
                    title="点击过滤此 CAN ID"
                  >
                    {formatHex(frame.can_id, frame.is_extended ? 8 : 3)}
                  </td>
                  <td class="frame-table__td frame-table__td--type">
                    <span class={`frame-table__type-badge frame-table__type-badge--${typeClass}`}>
                      {typeLabel}
                    </span>
                  </td>
                  <td class="frame-table__td frame-table__td--dlc">{frame.dlc}</td>
                  <td class="frame-table__td frame-table__td--data">
                    {formatDataHex(frame.data, frame.dlc)}
                  </td>
                  <td class="frame-table__td frame-table__td--signals">
                    <Show
                      when={frame.signals && frame.signals.length > 0}
                      fallback={<span class="frame-table__no-signal">-</span>}
                    >
                      <div class="frame-table__signal-list">
                        <For each={frame.signals}>
                          {(signal) => (
                            <span class="frame-table__signal-badge">
                              {signal.name}
                              <span class="frame-table__signal-value">
                                {signal.label ?? signal.physical_value.toFixed(2)}
                                {signal.unit ? ` ${signal.unit}` : ''}
                              </span>
                            </span>
                          )}
                        </For>
                      </div>
                    </Show>
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

        {/* 过滤后无结果 */}
        <Show when={props.totalFrameCount > 0 && filteredFrames().length === 0}>
          <div class="frame-table__empty">
            <div class="frame-table__empty-icon">
              <Search size={40} stroke-width={1.2} />
            </div>
            <span class="frame-table__empty-title">无匹配报文</span>
            <span class="frame-table__empty-desc">当前过滤条件下未找到任何报文</span>
          </div>
        </Show>
      </div>
    </div>
  );
};



export default FrameTable;
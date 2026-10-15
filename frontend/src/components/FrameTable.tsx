import { Component, createSignal, onMount, onCleanup, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Portal } from 'solid-js/web';
import type { FrameInfo } from '../types';
import { formatHex, formatDataHex } from '../types';
import { SlidersHorizontal, Search, Eraser, Pause, Play, ListClock, Activity, ChevronRight, ChevronDown, Check, X } from 'lucide-solid';

interface FrameTableProps {
  frames: FrameInfo[];
  totalFrameCount: number;
  hasDbc?: boolean;
  onClear?: () => void;
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
  const [clearConfirm, setClearConfirm] = createSignal(false);
  let clearConfirmTimer: ReturnType<typeof setTimeout> | undefined;
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

  // ---- 属性面板 ----
  interface TreeNode {
    id: string;
    label: string;
    value?: string;
    badgeClass?: string;
    children?: TreeNode[];
  }

  const [isPropertiesOpen, setIsPropertiesOpen] = createSignal(false);
  const [propertiesWidth, setPropertiesWidth] = createSignal(280);
  const [propertiesSplitPct, setPropertiesSplitPct] = createSignal(50);
  const [expandedNodes, setExpandedNodes] = createSignal(new Set<string>(['basic', 'dbc', 'signals']));

  const toggleNode = (nodeId: string) => {
    const next = new Set(expandedNodes());
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    setExpandedNodes(next);
  };

  const toggleProperties = () => setIsPropertiesOpen(!isPropertiesOpen());

  const propertyTree = (): TreeNode[] => {
    const idx = selectedRow();
    if (idx === null) return [];
    const frame = displayedFrames()[idx];
    if (!frame) return [];

    const isBrs = (frame as any).is_brs as boolean | undefined;
    const typeLabel = frame.is_fd
      ? (isBrs ? 'CAN FD BRS' : 'CAN FD')
      : 'CAN';
    const typeBadge = frame.is_fd
      ? (isBrs ? 'canfd-brs' : 'canfd')
      : 'can';

    const nodes: TreeNode[] = [];

    const basicNode: TreeNode = {
      id: 'basic',
      label: '基本信息',
      children: [
        { id: 'ts',    label: '时间戳', value: formatTimestamp(frame, idx) },
        { id: 'bus',   label: '通道',   value: `CH${frame.bus_id + 1}` },
        { id: 'canid', label: 'CAN ID', value: formatHex(frame.can_id, frame.is_extended ? 8 : 3) },
        { id: 'fmt',   label: '帧格式', value: frame.is_extended ? '扩展帧' : '标准帧' },
        { id: 'type',  label: '帧类型', value: typeLabel, badgeClass: `frame-table__type-badge--${typeBadge}` },
        { id: 'dir',   label: '方向',   value: 'RX' },
        { id: 'dlc',   label: 'DLC',    value: String(frame.dlc) },
        { id: 'len',   label: '数据长度', value: `${frame.data.length} bytes` },
      ],
    };
    nodes.push(basicNode);

    const msgName = (frame as any).message_name as string | undefined;
    if (msgName) {
      const dbcNode: TreeNode = {
        id: 'dbc',
        label: 'DBC 信息',
        children: [
          { id: 'msg', label: '报文名称', value: msgName },
        ],
      };
      nodes.push(dbcNode);
    }

    if (frame.signals && frame.signals.length > 0) {
      const sigNode: TreeNode = {
        id: 'signals',
        label: '信号值',
        children: frame.signals.map((s) => ({
          id: `sig-${s.name}`,
          label: s.name,
          value: s.unit ? `${s.physical_value} ${s.unit}` : `${s.physical_value}`,
        })),
      };
      nodes.push(sigNode);
    }

    return nodes;
  };

  const renderTree = (nodes: TreeNode[], depth: number = 0): any => {
    const expanded = expandedNodes();
    return nodes.map((node) => {
      const hasChildren = node.children && node.children.length > 0;
      return (
        <>
          <div
            class="property-tree__node"
            classList={{ 'property-tree__node--parent': hasChildren }}
            style={{ 'padding-left': `${12 + depth * 14}px` }}
            onClick={() => hasChildren && toggleNode(node.id)}
          >
            {hasChildren && (
              <span
                class="property-tree__toggle"
                classList={{ 'property-tree__toggle--open': expanded.has(node.id) }}
              >
                <ChevronRight size={11} />
              </span>
            )}
            <span class="property-tree__label">{node.label}</span>
            {node.value && (
              <span
                class="property-tree__value"
                classList={{
                  'property-tree__value--badge': !!node.badgeClass,
                  ...(node.badgeClass ? { [node.badgeClass]: true } : {}),
                }}
              >
                {node.value}
              </span>
            )}
          </div>
          {hasChildren && expanded.has(node.id) && renderTree(node.children!, depth + 1)}
        </>
      );
    });
  };

  // 属性面板水平拖拽
  const handlePropertiesResizeStart = (e: MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = propertiesWidth();
    const onMove = (e: MouseEvent) => {
      const w = Math.max(200, Math.min(500, startWidth + (e.clientX - startX)));
      setPropertiesWidth(w);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // 属性面板内上下分割拖拽
  const handleVerticalResizeStart = (e: MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const panelEl = (e.currentTarget as HTMLElement).parentElement;
    const totalHeight = panelEl?.clientHeight ?? 400;
    const startPct = propertiesSplitPct();
    const onMove = (e: MouseEvent) => {
      const delta = e.clientY - startY;
      const newPct = Math.max(30, Math.min(80, startPct + (delta / totalHeight) * 100));
      setPropertiesSplitPct(newPct);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const displayedFrames = () => {
    let frames = isPaused()
      ? props.frames.slice(0, pausedCount())
      : props.frames;

    const ft = filterTime().trim().toLowerCase();
    const fc = filterChannel().trim().toLowerCase();
    const fi = filterId().trim().toLowerCase();
    const fy = filterType().trim().toLowerCase();
    const fd = filterDlc().trim();
    const fx = filterData().trim().replace(/\s/g, '').toLowerCase();
    const fn = filterName().trim().toLowerCase();

    frames = frames.filter((frame) => {
        if (ft && !formatTimestamp(frame, 0).toLowerCase().includes(ft)) return false;
        if (fc && !(frame.channel ?? '').toLowerCase().includes(fc)) return false;
        if (fi) {
          const hexId = formatHex(frame.can_id, frame.is_extended ? 8 : 3).toLowerCase();
          const decId = frame.can_id.toString();
          if (!hexId.startsWith(fi) && !decId.startsWith(fi)) return false;
        }
        if (fy) {
          const typeStr = getFrameTypeLabel(frame).toLowerCase();
          if (!typeStr.includes(fy)) return false;
        }
        if (fd && frame.dlc.toString() !== fd) return false;
        if (fx) {
          const dataStr = formatDataHex(frame.data, frame.dlc).replace(/\s/g, '').toLowerCase();
          if (!dataStr.includes(fx)) return false;
        }
        if (fn && !((frame as any).message_name ?? '').toLowerCase().includes(fn)) return false;
        return true;
    });

    return frames;
  };

  // ---- 搜索 ----
  const [isSearchOpen, setIsSearchOpen] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchCurrentIndex, setSearchCurrentIndex] = createSignal(0);
  const [isCaseSensitive, setIsCaseSensitive] = createSignal(false);
  const [isWholeWord, setIsWholeWord] = createSignal(false);
  let searchInputRef: HTMLInputElement | undefined;

  // ---- 列筛选 ----
  const [showFilters, setShowFilters] = createSignal(false);
  const [filterTime, setFilterTime] = createSignal('');
  const [filterChannel, setFilterChannel] = createSignal('');
  const [filterId, setFilterId] = createSignal('');
  const [filterType, setFilterType] = createSignal('');
  const [filterDlc, setFilterDlc] = createSignal('');
  const [filterData, setFilterData] = createSignal('');
  const [filterName, setFilterName] = createSignal('');

  const clearAllFilters = () => {
    setFilterTime('');
    setFilterChannel('');
    setFilterId('');
    setFilterType('');
    setFilterDlc('');
    setFilterData('');
    setFilterName('');
  };

  const getFrameTypeLabel = (frame: FrameInfo) => {
    const isBrs = (frame as any).is_brs as boolean | undefined;
    return frame.is_fd ? (isBrs ? 'CAN FD' : 'CAN FD') : 'CAN';
  };

  const searchMatchIndices = (): number[] => {
    const raw = searchQuery().trim().replace(/\s/g, '');
    const q = isCaseSensitive() ? raw : raw.toLowerCase();
    const frames = displayedFrames();
    if (!raw || frames.length === 0) return [];

    const indices: number[] = [];
    let idMatch: ((frame: FrameInfo) => boolean) | null = null;

    if (raw.startsWith('0x')) {
      const hexPart = raw.slice(2);
      if (hexPart.length > 0) {
        idMatch = (f: FrameInfo) =>
          formatHex(f.can_id, f.is_extended ? 8 : 3).toLowerCase() === hexPart.toLowerCase();
      }
    } else if (/^\d+$/.test(raw)) {
      idMatch = (f: FrameInfo) => f.can_id.toString() === raw;
    }

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];

      if (idMatch ? idMatch(frame) : false) {
        indices.push(i);
        continue;
      }

      if (!idMatch) {
        let dataStr = formatDataHex(frame.data, frame.dlc).replace(/\s/g, '');
        if (!isCaseSensitive()) dataStr = dataStr.toLowerCase();

        if (isWholeWord()) {
          const bytes = dataStr.match(/.{1,2}/g) ?? [];
          if (bytes.includes(q)) {
            indices.push(i);
          }
        } else {
          if (dataStr.includes(q)) {
            indices.push(i);
          }
        }
      }
    }

    return indices;
  };

  const searchMatchSet = () => {
    const matches = searchMatchIndices();
    if (matches.length === 0) return new Set<number>();
    return new Set(matches);
  };

  const searchCurrentFrameIndex = (): number | null => {
    const matches = searchMatchIndices();
    if (matches.length === 0) return null;
    const i = searchCurrentIndex();
    if (i < 0 || i >= matches.length) return null;
    return matches[i];
  };

  const handleScrollToMatch = (frameIndex: number) => {
    const targetY = frameIndex * ROW_HEIGHT;
    const viewH = containerRef?.clientHeight ?? 600;
    containerRef && (containerRef.scrollTop = Math.max(0, targetY - viewH / 2 + ROW_HEIGHT / 2));
  };

  const openSearch = () => {
    if (isSearchOpen()) {
      closeSearch();
      return;
    }
    setIsSearchOpen(true);
    setSearchQuery('');
    setSearchCurrentIndex(0);
    setIsCaseSensitive(false);
    setIsWholeWord(false);
    queueMicrotask(() => searchInputRef?.focus());
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchCurrentIndex(0);
    setIsCaseSensitive(false);
    setIsWholeWord(false);
  };

  const searchNext = () => {
    const matches = searchMatchIndices();
    if (matches.length === 0) return;
    const next = (searchCurrentIndex() + 1) % matches.length;
    setSearchCurrentIndex(next);
    handleScrollToMatch(matches[next]);
  };

  const searchPrev = () => {
    const matches = searchMatchIndices();
    if (matches.length === 0) return;
    const prev = (searchCurrentIndex() - 1 + matches.length) % matches.length;
    setSearchCurrentIndex(prev);
    handleScrollToMatch(matches[prev]);
  };

  const handleSearchInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        searchPrev();
      } else {
        searchNext();
      }
    }
  };

  const handleSearchInputChange = () => {
    const raw = searchInputRef?.value ?? '';
    setSearchQuery(raw);
    setSearchCurrentIndex(0);
    if (raw.trim()) {
      const matches = searchMatchIndices();
      if (matches.length > 0) {
        handleScrollToMatch(matches[0]);
      }
    }
  };

  const handlePauseToggle = () => {
    if (!isPaused()) {
      setPausedCount(props.frames.length);
    }
    setIsPaused(!isPaused());
  };

  const handleClearClick = () => {
    if (clearConfirm()) {
      props.onClear?.();
      setSelectedRow(null);
      setIsPaused(false);
      setClearConfirm(false);
      if (clearConfirmTimer) clearTimeout(clearConfirmTimer);
      return;
    }
    setClearConfirm(true);
    clearConfirmTimer = setTimeout(() => setClearConfirm(false), 2000);
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

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        const activeEl = document.activeElement;
        const root = containerRef?.closest('.frame-table');
        const isFocusInside = root?.contains(activeEl) ?? false;
        const isBody = activeEl === document.body;
        if (!isFocusInside && !isBody) return;

        e.preventDefault();
        openSearch();
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);

    onCleanup(() => {
      resizeObserver?.disconnect();
      pauseBtnRef.removeEventListener('click', handlePauseToggle);
      timeBtnRef.removeEventListener('mousedown', handleTimeMenuToggle);
      document.removeEventListener('keydown', handleGlobalKeyDown);
      if (clearConfirmTimer) clearTimeout(clearConfirmTimer);
    });
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
            classList={{ 'frame-table__tool-btn--active': isPropertiesOpen() }}
            title="查看报文属性"
            aria-label="查看报文属性"
            onClick={toggleProperties}
          >
            <SlidersHorizontal size={14} />
          </button>

          {/* 查找 */}
          <button
            class="frame-table__tool-btn"
            classList={{ 'frame-table__tool-btn--active': isSearchOpen() }}
            title="查找报文 (Ctrl+F)"
            aria-label="查找报文"
            onClick={openSearch}
          >
            <Search size={14} />
          </button>

          {/* 清空 */}
          <button
            class="frame-table__tool-btn"
            classList={{ 'frame-table__tool-btn--danger': clearConfirm() }}
            title={clearConfirm() ? '再次点击确认清空' : '清空报文列表'}
            aria-label={clearConfirm() ? '再次点击确认清空' : '清空报文列表'}
            onClick={handleClearClick}
          >
            {clearConfirm() ? <Check size={14} /> : <Eraser size={14} />}
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

      {/* ---- 内容区：报文表格 + 属性面板 ---- */}
      <div class="split-layout-h" style={{ flex: 1, 'min-height': '0' }}>
        <Show when={isPropertiesOpen()}>
          <div class="property-panel" style={{ width: `${propertiesWidth()}px` }}>
            <div class="property-panel__header">
              <span class="property-panel__title">报文属性</span>
              <button
                class="property-panel__close"
                title="关闭属性面板"
                aria-label="关闭属性面板"
                onClick={toggleProperties}
              >
                <X size={12} />
              </button>
            </div>

            {/* 上半部分：属性树 */}
            <div
              class="property-panel__upper"
              style={{ 'flex-basis': `${propertiesSplitPct()}%` }}
            >
              <Show
                when={selectedRow() !== null}
                fallback={
                  <div class="property-panel__empty" style={{ height: '100%' }}>
                    未选中报文
                  </div>
                }
              >
                {renderTree(propertyTree())}
              </Show>
            </div>

            {/* 上下分割拖拽条 */}
            <div class="panel-resizer-v" onMouseDown={handleVerticalResizeStart} />

            {/* 下半部分：数据 hex */}
            <div class="property-panel__lower">
              <Show
                when={selectedRow() !== null}
                fallback={<div class="property-panel__empty">未选中报文</div>}
              >
                <div class="property-data__hex">
                  {(() => {
                    const idx = selectedRow()!;
                    const frame = displayedFrames()[idx];
                    return frame ? formatDataHex(frame.data, frame.dlc) : '';
                  })()}
                </div>
              </Show>
            </div>
          </div>

          {/* 属性面板水平拖拽条 */}
          <div class="panel-resizer-h" onMouseDown={handlePropertiesResizeStart} />
        </Show>

        <div class="frame-panel">
          <Show when={isSearchOpen()}>
            <div class="frame-table__search-bar">
              <input
                ref={searchInputRef}
                class="frame-table__search-input"
                type="text"
                placeholder=""
                spellcheck={false}
                value={searchQuery()}
                onInput={handleSearchInputChange}
                onKeyDown={handleSearchInputKeyDown}
              />

              {/* 结果文字 */}
              <Show when={searchQuery().trim().length > 0}>
                <Show
                  when={searchMatchIndices().length > 0}
                  fallback={<span class="frame-table__search-no-hit">无结果</span>}
                >
                  <span class="frame-table__search-info">
                    第{searchCurrentIndex() + 1}项，共{searchMatchIndices().length}项
                  </span>
                </Show>
              </Show>

              {/* 导航 */}
              <button
                class="frame-table__search-nav"
                title="上一个 (Shift+Enter)"
                disabled={searchMatchIndices().length === 0}
                onClick={searchPrev}
              >
                <ChevronRight size={12} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <button
                class="frame-table__search-nav"
                title="下一个 (Enter)"
                disabled={searchMatchIndices().length === 0}
                onClick={searchNext}
              >
                <ChevronRight size={12} />
              </button>

              {/* Toggle: 区分大小写 */}
              <button
                class="frame-table__search-toggle"
                classList={{ 'frame-table__search-toggle--active': isCaseSensitive() }}
                title="区分大小写"
                onClick={() => setIsCaseSensitive((v) => !v)}
              >
                Aa
              </button>

              {/* Toggle: 全字匹配 */}
              <button
                class="frame-table__search-toggle"
                classList={{ 'frame-table__search-toggle--active': isWholeWord() }}
                title="全字匹配"
                onClick={() => setIsWholeWord((v) => !v)}
              >
                ab
              </button>

              <button
                class="frame-table__search-close"
                title="关闭搜索 (Esc)"
                onClick={closeSearch}
              >
                <X size={13} />
              </button>
            </div>
          </Show>
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
              {visibleColumns().map((col, ci) => (
                <th class={`frame-table__th frame-table__th--${col.key}`}>
                  {ci === 0 && (
                    <span
                      class="frame-table__filter-toggle"
                      onClick={() => setShowFilters((v) => !v)}
                      title={showFilters() ? '关闭筛选' : '打开筛选'}
                    >
                      {showFilters()
                        ? <ChevronDown size={11} />
                        : <ChevronRight size={11} />
                      }
                    </span>
                  )}
                  {col.label}
                  <div
                    class="frame-table__col-resizer"
                    classList={{ 'frame-table__col-resizer--active': activeResizer() === col.key }}
                    onMouseDown={(e) => handleResizeStart(col.key, e)}
                  />
                </th>
              ))}
            </tr>
            {showFilters() && (
              <tr class="frame-table__filter-row">
                {visibleColumns().map((col) => {
                  const signals: Record<string, { get: () => string; set: (v: string) => void }> = {
                    time: { get: filterTime, set: setFilterTime },
                    channel: { get: filterChannel, set: setFilterChannel },
                    id: { get: filterId, set: setFilterId },
                    type: { get: filterType, set: setFilterType },
                    dlc: { get: filterDlc, set: setFilterDlc },
                    data: { get: filterData, set: setFilterData },
                    name: { get: filterName, set: setFilterName },
                  };
                  const s = signals[col.key];
                  return (
                    <th class="frame-table__th frame-table__th--filter">
                      <input
                        class="frame-table__filter-input"
                        type="text"
                        value={s?.get() ?? ''}
                        onInput={(e) => s?.set(e.currentTarget.value)}
                        placeholder=""
                        spellcheck={false}
                      />
                    </th>
                  );
                })}
              </tr>
            )}
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
                    'frame-table__row--search-hit': isSearchOpen() && !isSelected && searchMatchSet().has(idx),
                    'frame-table__row--search-current': isSearchOpen() && searchCurrentFrameIndex() === idx,
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
      </div>
    </div>
  );
};

export default FrameTable;
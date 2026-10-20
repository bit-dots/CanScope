import { Component, createMemo, createSignal, onMount, onCleanup, createEffect, Show, For } from 'solid-js';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import {
  Plus,
  Minus,
  Trash2,
  ArrowUp,
  ArrowDown,
  LayoutPanelTop,
  Eye,
  EyeOff,
} from 'lucide-solid';
import type { FrameInfo, ChartSignal, DbcBinding } from '../types';
import AddSignalDialog from './AddSignalDialog';
import './SignalChart.css';

interface SignalChartProps {
  frames: FrameInfo[];
  signals: ChartSignal[];
  dbcBindings: DbcBinding[];
  onRemoveSignal: (s: ChartSignal) => void;
  onAddSignals: (signals: ChartSignal[]) => void;
  onAddSignal?: () => void;
  onRemoveSelectedSignal?: () => void;
  onClearSignals?: () => void;
  onMoveSignalUp?: () => void;
  onMoveSignalDown?: () => void;
  onLayout?: () => void;
}

interface CursorInfo {
  timestamp: number | null;
  values: (number | null)[];
}

interface LatestValue {
  value: number;
  timestamp: number;
}

const COLORS = ['#38BFA7', '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF922B'];

function signalKey(s: ChartSignal): string {
  return `${s.canId}:${s.signalName}`;
}

function formatHex(id: number): string {
  return '0x' + id.toString(16).toUpperCase();
}

function formatTimeDelta(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function deriveData(frames: FrameInfo[], signals: ChartSignal[]): uPlot.AlignedData | null {
  if (signals.length === 0 || frames.length === 0) return null;

  const timestamps: number[] = [];
  const series: (number | null)[][] = signals.map(() => []);

  for (const frame of frames) {
    if (!frame.signals) continue;
    for (let i = 0; i < signals.length; i++) {
      const s = signals[i];
      if (frame.can_id !== s.canId) continue;
      const decoded = frame.signals.find(d => d.name === s.signalName);
      if (decoded !== undefined) {
        timestamps.push(frame.timestamp);
        for (let j = 0; j < signals.length; j++) {
          if (j === i) {
            series[j].push(decoded.physical_value);
          } else {
            series[j].push(null);
          }
        }
      }
    }
  }

  if (timestamps.length === 0) return null;
  return [timestamps, ...series];
}

const SignalChart: Component<SignalChartProps> = (props) => {
  let containerRef!: HTMLDivElement;
  let plot: uPlot | null = null;

  const [cursorInfo, setCursorInfo] = createSignal<CursorInfo>({ timestamp: null, values: [] });
  const [showAddDialog, setShowAddDialog] = createSignal(false);
  const [selectedKey, setSelectedKey] = createSignal<string | null>(null);
  const [hiddenKeys, setHiddenKeys] = createSignal<Set<string>>(new Set());
  const [sidebarWidth, setSidebarWidth] = createSignal(220);

  const visibleSignals = createMemo(() =>
    props.signals.filter(s => !hiddenKeys().has(signalKey(s)))
  );

  const data = createMemo(() => deriveData(props.frames, visibleSignals()));
  const dataPointCount = createMemo(() => data()?.[0]?.length ?? 0);

  const latestValues = createMemo(() => {
    const map = new Map<string, LatestValue>();
    const frames = props.frames;
    for (let i = frames.length - 1; i >= 0; i--) {
      const frame = frames[i];
      if (!frame.signals) continue;
      for (const s of props.signals) {
        const key = signalKey(s);
        if (map.has(key)) continue;
        if (frame.can_id !== s.canId) continue;
        const decoded = frame.signals.find(d => d.name === s.signalName);
        if (decoded !== undefined) {
          map.set(key, { value: decoded.physical_value, timestamp: frame.timestamp });
        }
      }
    }
    return map;
  });

  const signalColorIndex = (s: ChartSignal) =>
    props.signals.findIndex(x => x.canId === s.canId && x.signalName === s.signalName);

  const toggleVisibility = (e: MouseEvent, key: string) => {
    e.stopPropagation();
    setHiddenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSelectedKey(null);
  };

  const handleSelect = (key: string) => {
    setSelectedKey(prev => prev === key ? null : key);
  };

  const handleRemoveSelected = () => {
    const key = selectedKey();
    if (!key) return;
    const signal = props.signals.find(s => signalKey(s) === key);
    if (signal) props.onRemoveSignal(signal);
    setSelectedKey(null);
  };

  const clearPlot = () => {
    if (plot) {
      plot.destroy();
      plot = null;
    }
  };

  const buildOpts = (sigs: ChartSignal[]): uPlot.Options => ({
    width: containerRef.clientWidth,
    height: containerRef.clientHeight,
    cursor: {
      show: true,
      drag: { x: true, y: false },
      points: {
        show: true,
        size: 4.5,
        width: 1.2,
        stroke: (_u, seriesIdx) => COLORS[seriesIdx % COLORS.length] + 'CC',
        fill: (_u, seriesIdx) => COLORS[seriesIdx % COLORS.length] + '33',
      },
    },
    legend: { show: true, live: false },
    scales: {
      x: { time: false },
    },
    axes: [
      {
        grid: { show: true, stroke: 'var(--border)', width: 0.5 },
        ticks: { stroke: '#666', size: 4 },
        font: '10px "JetBrains Mono", monospace',
        stroke: '#888',
        gap: 6,
      },
      {
        side: 1,
        grid: { show: true, stroke: 'var(--border)', width: 0.5 },
        ticks: { stroke: '#666', size: 4 },
        font: '10px "JetBrains Mono", monospace',
        stroke: '#888',
        size: 60,
        gap: 6,
      },
    ],
    series: [
      {},
      ...sigs.map((s) => ({
        label: `${s.signalName}${s.unit ? ` (${s.unit})` : ''}`,
        stroke: COLORS[signalColorIndex(s) % COLORS.length],
        width: 1.8,
        fill: COLORS[signalColorIndex(s) % COLORS.length] + '14',
        points: { show: false },
        value: (_self: uPlot, rawValue: number | null) =>
          rawValue == null ? '\u2014' : rawValue.toFixed(3) + (s.unit ? ` ${s.unit}` : ''),
      })),
    ],
    plugins: [
      {
        hooks: {
          init: (u: uPlot) => {
            u.over.style.overflow = 'hidden';
            const legendEl = u.root.querySelector('.u-legend');
            if (legendEl) {
              (legendEl as HTMLElement).style.padding = '2px 8px';
              (legendEl as HTMLElement).style.fontSize = '11px';
              (legendEl as HTMLElement).style.fontFamily = '"IBM Plex Sans", sans-serif';
              (legendEl as HTMLElement).style.borderTop = '1px solid var(--border)';
              (legendEl as HTMLElement).style.background = 'var(--bg-secondary)';
            }
          },
          setCursor: (u: uPlot) => {
            const idx = u.cursor.idx;
            if (idx == null || idx < 0) {
              setCursorInfo({ timestamp: null, values: [] });
              return;
            }
            const d = u.data as uPlot.AlignedData;
            const ts = d[0]?.[idx] ?? null;
            const vals: (number | null)[] = [];
            for (let i = 1; i < d.length; i++) {
              vals.push(d[i]?.[idx] ?? null);
            }
            setCursorInfo({ timestamp: ts, values: vals });
          },
        },
      },
    ],
  });

  let splitterRef!: HTMLDivElement;
  let dragging = false;
  let dragStartX = 0;
  let dragStartWidth = 0;

  const onSplitterDown = (e: MouseEvent) => {
    e.preventDefault();
    dragging = true;
    dragStartX = e.clientX;
    dragStartWidth = sidebarWidth();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!dragging) return;
      const dx = ev.clientX - dragStartX;
      setSidebarWidth(Math.max(160, Math.min(400, dragStartWidth + dx)));
    };
    const onUp = () => {
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  onMount(() => {
    createEffect(() => {
      const d = data();
      const sigs = visibleSignals();

      if (sigs.length === 0) {
        clearPlot();
        return;
      }

      if (!d) {
        if (plot) {
          plot.destroy();
          plot = null;
        }
        return;
      }

      if (!plot) {
        plot = new uPlot(buildOpts(sigs), d, containerRef);
      } else {
        plot.setData(d);
        plot.setSize({ width: containerRef.clientWidth, height: containerRef.clientHeight });
      }
    });

    const onResize = () => {
      if (plot && containerRef) {
        plot.setSize({ width: containerRef.clientWidth, height: containerRef.clientHeight });
      }
    };
    window.addEventListener('resize', onResize);
    onCleanup(() => {
      window.removeEventListener('resize', onResize);
      clearPlot();
    });
  });

  return (
    <div class="signal-chart">
      {/* ---- 工具栏 ---- */}
      <div class="signal-chart__toolbar">
        <button class="signal-chart__tool-btn" onClick={() => setShowAddDialog(true)} title="添加信号">
          <Plus size={15} strokeWidth={2} />
        </button>
        <button
          class="signal-chart__tool-btn"
          disabled={!selectedKey()}
          onClick={handleRemoveSelected}
          title="移除选中信号"
        >
          <Minus size={15} strokeWidth={2} />
        </button>
        <button class="signal-chart__tool-btn" onClick={() => props.onClearSignals?.()} title="清空信号列表">
          <Trash2 size={14} strokeWidth={2} />
        </button>

        <div class="signal-chart__tool-separator" />

        <button class="signal-chart__tool-btn" onClick={() => props.onMoveSignalUp?.()} title="上移">
          <ArrowUp size={14} strokeWidth={2} />
        </button>
        <button class="signal-chart__tool-btn" onClick={() => props.onMoveSignalDown?.()} title="下移">
          <ArrowDown size={14} strokeWidth={2} />
        </button>

        <button class="signal-chart__tool-btn" onClick={() => props.onLayout?.()} title="布局">
          <LayoutPanelTop size={14} strokeWidth={2} />
        </button>
      </div>

      {/* ---- 内容区：侧栏 + 拖拽分隔条 + 图形区 ---- */}
      <div class="signal-chart__content">
        <div class="signal-chart__sidebar" style={{ width: sidebarWidth() + 'px' }}>
          <div class="signal-chart__sidebar-header">
            <span>信号</span>
            <span class="signal-chart__sidebar-count">{props.signals.length}</span>
          </div>
          <div class="signal-chart__sidebar-list">
            <For each={props.signals}>
              {(s, i) => {
                const key = signalKey(s);
                const hidden = hiddenKeys().has(key);
                const isSelected = key === selectedKey();
                const lv = latestValues().get(key);
                const ci = i();
                const color = COLORS[ci % COLORS.length];
                const hasRange = s.min != null && s.max != null;
                return (
                  <div
                    class="signal-chart__sig-row"
                    classList={{
                      'signal-chart__sig-row--selected': isSelected,
                      'signal-chart__sig-row--hidden': hidden,
                    }}
                    onClick={() => handleSelect(key)}
                  >
                    <div class="signal-chart__sig-row-top">
                      <span
                        class="signal-chart__sig-dot"
                        style={{ color }}
                      >
                        ●
                      </span>
                      <span class="signal-chart__sig-name">{s.signalName}</span>
                      <span class="signal-chart__sig-canid">{formatHex(s.canId)}</span>
                      <button
                        class="signal-chart__sig-eye"
                        onClick={(e) => toggleVisibility(e, key)}
                        title={hidden ? '显示曲线' : '隐藏曲线'}
                      >
                        {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                    <div class="signal-chart__sig-row-bottom">
                      <span class="signal-chart__sig-value">
                        {lv ? lv.value.toFixed(3) : '\u2014'}
                      </span>
                      <span class="signal-chart__sig-unit">{s.unit || ''}</span>
                      {hasRange && (
                        <span class="signal-chart__sig-range">[{s.min} .. {s.max}]</span>
                      )}
                    </div>
                  </div>
                );
              }}
            </For>
            {props.signals.length === 0 && (
              <div class="signal-chart__sidebar-empty">暂无信号</div>
            )}
          </div>
        </div>

        <div ref={splitterRef} class="signal-chart__splitter" onMouseDown={onSplitterDown} />

        <div ref={containerRef} class="signal-chart__plot">
          {visibleSignals().length === 0 && props.signals.length > 0 && (
            <div class="signal-chart__empty">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="signal-chart__empty-icon"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <span class="signal-chart__empty-title">所有信号已隐藏</span>
            </div>
          )}
          {props.signals.length === 0 && (
            <div class="signal-chart__empty">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="signal-chart__empty-icon"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <span class="signal-chart__empty-title">无信号数据</span>
              <span class="signal-chart__empty-desc">
                在信号树中点击信号<br />将其添加到图表查看曲线
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ---- 底部状态栏 ---- */}
      <div class="signal-chart__statusbar">
        <div class="signal-chart__statusbar-left">
          <div class="signal-chart__status-item">
            <span class="signal-chart__status-label">光标:</span>
            <span class="signal-chart__status-value">
              {cursorInfo().timestamp != null
                ? formatTimeDelta(cursorInfo().timestamp!)
                : '\u2014'}
            </span>
          </div>
          <div class="signal-chart__status-divider" />
          {visibleSignals().length > 0 &&
            cursorInfo().values.length > 0 &&
            cursorInfo().timestamp != null && (
              <div class="signal-chart__status-item">
                {visibleSignals().map((s, i) => {
                  const v = cursorInfo().values[i];
                  const ci = signalColorIndex(s);
                  return (
                    <>
                      {i > 0 && <span class="signal-chart__status-label" style="margin: 0 6px;">|</span>}
                      <span
                        class="signal-chart__status-value"
                        style={{ color: v != null ? COLORS[ci % COLORS.length] : undefined }}
                      >
                        {s.signalName}={v != null ? v.toFixed(3) : '\u2014'}
                        {s.unit && v != null ? ` ${s.unit}` : ''}
                      </span>
                    </>
                  );
                })}
              </div>
            )}
        </div>
        <div class="signal-chart__statusbar-right">
          <div class="signal-chart__status-item">
            <span class="signal-chart__status-label">数据点:</span>
            <span class="signal-chart__status-value">{formatCount(dataPointCount())}</span>
          </div>
        </div>
      </div>

      <Show when={showAddDialog()}>
        <AddSignalDialog
          dbcBindings={props.dbcBindings}
          existingSignals={props.signals}
          onConfirm={(signals) => {
            props.onAddSignals(signals);
            setShowAddDialog(false);
          }}
          onCancel={() => setShowAddDialog(false)}
        />
      </Show>
    </div>
  );
};

export default SignalChart;
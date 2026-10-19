import { Component, createMemo, createSignal, onMount, onCleanup, createEffect } from 'solid-js';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import {
  Plus,
  Minus,
  Trash2,
  ArrowUp,
  ArrowDown,
  LayoutPanelTop,
} from 'lucide-solid';
import type { FrameInfo, ChartSignal } from '../types';
import './SignalChart.css';

interface SignalChartProps {
  frames: FrameInfo[];
  signals: ChartSignal[];
  onRemoveSignal: (s: ChartSignal) => void;
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

const COLORS = ['#38BFA7', '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF922B'];

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

  const data = createMemo(() => deriveData(props.frames, props.signals));
  const dataPointCount = createMemo(() => data()?.[0]?.length ?? 0);

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
        stroke: (_u, seriesIdx) => COLORS[(seriesIdx - 1) % COLORS.length] + 'CC',
        fill: (_u, seriesIdx) => COLORS[(seriesIdx - 1) % COLORS.length] + '33',
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
      ...sigs.map((s, i) => ({
        label: `${s.signalName}${s.unit ? ` (${s.unit})` : ''}`,
        stroke: COLORS[i % COLORS.length],
        width: 1.8,
        fill: COLORS[i % COLORS.length] + '14',
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

  onMount(() => {
    createEffect(() => {
      const d = data();
      const sigs = props.signals;

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
      {/* ---- 信号标签栏 ---- */}
      {props.signals.length > 0 && (
        <div class="signal-chart__tags">
          <span class="signal-chart__tags-label">信号:</span>
          {props.signals.map((s, i) => (
            <span
              class="signal-chart__tag"
              style={{
                background: COLORS[i % COLORS.length] + '22',
                color: COLORS[i % COLORS.length],
                border: '1px solid ' + COLORS[i % COLORS.length] + '44',
              }}
            >
              {s.signalName}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="signal-chart__tag-close"
                onClick={() => props.onRemoveSignal(s)}
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          ))}
        </div>
      )}

      {/* ---- 工具栏 ---- */}
      <div class="signal-chart__toolbar">
        <button class="signal-chart__tool-btn" onClick={() => props.onAddSignal?.()} title="添加信号">
          <Plus size={15} strokeWidth={2} />
        </button>
        <button class="signal-chart__tool-btn" onClick={() => props.onRemoveSelectedSignal?.()} title="移除选中信号">
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

      {/* ---- 图形区 ---- */}
      <div ref={containerRef} class="signal-chart__plot">
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
          {props.signals.length > 0 &&
            cursorInfo().values.length > 0 &&
            cursorInfo().timestamp != null && (
              <div class="signal-chart__status-item">
                {props.signals.map((s, i) => {
                  const v = cursorInfo().values[i];
                  return (
                    <>
                      {i > 0 && <span class="signal-chart__status-label" style="margin: 0 6px;">|</span>}
                      <span
                        class="signal-chart__status-value"
                        style={{ color: v != null ? COLORS[i % COLORS.length] : undefined }}
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
    </div>
  );
};

export default SignalChart;
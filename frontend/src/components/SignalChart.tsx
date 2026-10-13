import { Component, createMemo, onMount, onCleanup, createEffect } from 'solid-js';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { FrameInfo, ChartSignal } from '../types';
import './SignalChart.css';

interface SignalChartProps {
  frames: FrameInfo[];
  signals: ChartSignal[];
  onRemoveSignal: (s: ChartSignal) => void;
}

const COLORS = ['#38BFA7', '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF922B'];

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

  const data = createMemo(() => deriveData(props.frames, props.signals));

  const clearPlot = () => {
    if (plot) {
      plot.destroy();
      plot = null;
    }
  };

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
        const opts: uPlot.Options = {
          width: containerRef.clientWidth,
          height: containerRef.clientHeight - 32,
          cursor: { show: true, drag: { x: true, y: false } },
          select: { show: true, left: 0, top: 0, width: 0, height: 0 },
          legend: { show: true, live: false },
          scales: {
            x: { time: false },
          },
          axes: [
            {
              grid: { show: true, stroke: '#333', width: 1 },
              ticks: { stroke: '#666' },
              font: '11px "JetBrains Mono", monospace',
              stroke: '#999',
            },
            {
              side: 1,
              grid: { show: true, stroke: '#333', width: 1 },
              ticks: { stroke: '#666' },
              font: '11px "JetBrains Mono", monospace',
              stroke: '#999',
              size: 60,
            },
          ],
          series: [
            {},
            ...sigs.map((s, i) => ({
              label: `${s.signalName}${s.unit ? ` (${s.unit})` : ''}`,
              stroke: COLORS[i % COLORS.length],
              width: 2,
              fill: COLORS[i % COLORS.length] + '18',
              points: { show: false },
              value: (_self: uPlot, rawValue: number | null) =>
                rawValue == null ? '—' : rawValue.toFixed(3) + (s.unit ? ` ${s.unit}` : ''),
            })),
          ],
          plugins: [
            {
              hooks: {
                init: (u: uPlot) => {
                  u.over.style.overflow = 'hidden';
                  const legendEl = u.root.querySelector('.u-legend');
                  if (legendEl) {
                    (legendEl as HTMLElement).style.padding = '2px 4px';
                    (legendEl as HTMLElement).style.fontSize = '11px';
                    (legendEl as HTMLElement).style.fontFamily = '"IBM Plex Sans", sans-serif';
                  }
                },
              },
            },
          ],
        };

        plot = new uPlot(opts, d, containerRef);
      } else {
        plot.setData(d);
        plot.setSize({ width: containerRef.clientWidth, height: containerRef.clientHeight - 32 });
      }
    });

    const onResize = () => {
      if (plot && containerRef) {
        plot.setSize({ width: containerRef.clientWidth, height: containerRef.clientHeight - 32 });
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
      <div ref={containerRef} class="signal-chart__plot">
        {props.signals.length === 0 && (
          <div class="signal-chart__empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="signal-chart__empty-icon">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <span class="signal-chart__empty-title">
              无信号数据
            </span>
            <span class="signal-chart__empty-desc">
              请在左侧信号树中点击信号<br />将其添加到图表中查看曲线
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SignalChart;
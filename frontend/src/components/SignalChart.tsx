import { Component, createMemo, onMount, onCleanup, createEffect } from 'solid-js';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { FrameInfo, ChartSignal } from '../types';

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
              font: '11px sans-serif',
              stroke: '#999',
            },
            {
              side: 1,
              grid: { show: true, stroke: '#333', width: 1 },
              ticks: { stroke: '#666' },
              font: '11px sans-serif',
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
    <div style={{
      display: 'flex',
      'flex-direction': 'column',
      height: '100%',
      background: 'var(--bg-primary)',
    }}>
      {props.signals.length > 0 && (
        <div style={{
          display: 'flex',
          'align-items': 'center',
          gap: '4px',
          padding: '2px 8px',
          'border-bottom': '1px solid var(--border)',
          'font-size': '11px',
          'flex-wrap': 'wrap',
          'min-height': '26px',
        }}>
          <span style={{ color: 'var(--text-secondary)', 'margin-right': '4px', 'font-weight': '600' }}>
            Signals:
          </span>
          {props.signals.map((s, i) => (
            <span style={{
              display: 'inline-flex',
              'align-items': 'center',
              gap: '4px',
              padding: '1px 6px',
              'border-radius': '3px',
              background: COLORS[i % COLORS.length] + '22',
              color: COLORS[i % COLORS.length],
              border: '1px solid ' + COLORS[i % COLORS.length] + '44',
            }}>
              {s.signalName}
              <span
                onClick={() => props.onRemoveSignal(s)}
                style={{ cursor: 'pointer', opacity: 0.6, 'font-size': '10px' }}
              >
                ✕
              </span>
            </span>
          ))}
        </div>
      )}
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
      >
        {props.signals.length === 0 && (
          <div style={{
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            height: '100%',
            color: 'var(--text-secondary)',
            'font-size': '13px',
          }}>
            Click a signal in the tree to plot its curve
          </div>
        )}
      </div>
    </div>
  );
};

export default SignalChart;
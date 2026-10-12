import { Component, createSignal, onMount, onCleanup } from 'solid-js';
import type { FrameInfo } from '../types';
import { formatHex, formatDataHex, formatSignal } from '../types';

interface FrameTableProps {
  frames: FrameInfo[];
}

const ROW_HEIGHT = 24;
const OVERSCAN = 20;

const FrameTable: Component<FrameTableProps> = (props) => {
  let containerRef!: HTMLDivElement;
  let resizeObserver: ResizeObserver | undefined;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewHeight, setViewHeight] = createSignal(0);

  const totalHeight = () => props.frames.length * ROW_HEIGHT;
  const startIndex = () => Math.max(0, Math.floor(scrollTop() / ROW_HEIGHT) - OVERSCAN);
  const endIndex = () => Math.min(
    props.frames.length,
    Math.ceil((scrollTop() + viewHeight()) / ROW_HEIGHT) + OVERSCAN,
  );
  const visibleFrames = () => props.frames.slice(startIndex(), endIndex());

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

  return (
    <div
      ref={containerRef}
      class="frame-table"
      onScroll={handleScroll}
      style={{
        overflow: 'auto',
        height: '100%',
        position: 'relative',
      }}
    >
      <table style={{ width: '100%', 'border-collapse': 'collapse', 'table-layout': 'fixed' }}>
        <thead style={{
          position: 'sticky',
          top: 0,
          'z-index': 1,
          background: 'var(--bg-secondary)',
        }}>
          <tr>
            <th style={thStyle('#', '40px')}>#</th>
            <th style={thStyle('Time', '100px')}>Time (s)</th>
            <th style={thStyle('CAN ID', '80px')}>CAN ID</th>
            <th style={thStyle('Type', '55px')}>Type</th>
            <th style={thStyle('DLC', '45px')}>DLC</th>
            <th style={thStyle('Data', '200px')}>Data</th>
            <th style={thStyle('Signals')}>Signals</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ height: `${startIndex() * ROW_HEIGHT}px` }} />
          {visibleFrames().map((frame, i) => {
            const idx = startIndex() + i;
            return (
              <tr
                style={{
                  height: `${ROW_HEIGHT}px`,
                  background: idx % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                }}
              >
                <td style={tdStyle}>{idx + 1}</td>
                <td style={tdStyle}>{frame.timestamp.toFixed(6)}</td>
                <td style={{ ...tdStyle, 'font-family': 'monospace', color: 'var(--accent)' }}>
                  {formatHex(frame.can_id, frame.is_extended ? 8 : 3)}
                </td>
                <td style={tdStyle}>
                  {frame.is_fd ? 'FD' : frame.is_extended ? 'EXT' : 'STD'}
                </td>
                <td style={tdStyle}>{frame.dlc}</td>
                <td style={{ ...tdStyle, 'font-family': 'monospace', 'font-size': '11px' }}>
                  {formatDataHex(frame.data, frame.dlc)}
                </td>
                <td style={{ ...tdStyle, 'font-size': '11px', color: 'var(--text-primary)' }}>
                  {frame.signals && frame.signals.length > 0
                    ? frame.signals.map(s => formatSignal(s)).join(', ')
                    : <span style="color: var(--text-secondary)">—</span>
                  }
                </td>
              </tr>
            );
          })}
          <tr style={{ height: `${Math.max(0, totalHeight() - endIndex() * ROW_HEIGHT)}px` }} />
        </tbody>
      </table>

      {props.frames.length === 0 && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'var(--text-secondary)',
        }}>
          No frames to display
        </div>
      )}
    </div>
  );
};

function thStyle(_text: string, width?: string): Record<string, string> {
  return {
    'text-align': 'left',
    padding: '4px 8px',
    'border-bottom': '1px solid var(--border)',
    'font-size': '12px',
    'font-weight': '600',
    color: 'var(--text-secondary)',
    'white-space': 'nowrap',
    ...(width ? { width } : {}),
  };
}

const tdStyle: Record<string, string> = {
  padding: '2px 8px',
  'font-size': '12px',
  color: 'var(--text-primary)',
  'white-space': 'nowrap',
  overflow: 'hidden',
  'text-overflow': 'ellipsis',
};

export default FrameTable;
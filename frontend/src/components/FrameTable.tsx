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
            <th style={{ width: '40px' }}>#</th>
            <th style={{ width: '100px' }}>时间 (s)</th>
            <th style={{ width: '80px' }}>CAN ID</th>
            <th style={{ width: '55px' }}>Type</th>
            <th style={{ width: '45px' }}>DLC</th>
            <th style={{ width: '200px' }}>Data</th>
            <th>Signals</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ height: `${startIndex() * ROW_HEIGHT}px` }} />
          {visibleFrames().map((frame, i) => {
            const idx = startIndex() + i;
            return (
              <tr
                style={{ height: `${ROW_HEIGHT}px`, background: idx % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}
              >
                <td>{idx + 1}</td>
                <td>{frame.timestamp.toFixed(6)}</td>
                <td style={{ 'font-family': 'var(--font-mono)', color: 'var(--accent)' }}>
                  {formatHex(frame.can_id, frame.is_extended ? 8 : 3)}
                </td>
                <td>
                  {frame.is_fd ? 'FD' : frame.is_extended ? 'EXT' : 'STD'}
                </td>
                <td>{frame.dlc}</td>
                <td style={{ 'font-family': 'var(--font-mono)', 'font-size': '11px' }}>
                  {formatDataHex(frame.data, frame.dlc)}
                </td>
                <td style={{ 'font-size': '11px', color: 'var(--text-primary)' }}>
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
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          gap: '10px',
          color: 'var(--text-secondary)',
          'font-size': '12px',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <span style={{ color: 'var(--text-primary)', 'font-weight': '500' }}>
            暂无报文数据
          </span>
          <span>请加载数据文件并启动播放</span>
        </div>
      )}
    </div>
  );
};



export default FrameTable;
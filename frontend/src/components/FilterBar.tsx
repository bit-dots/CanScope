import { Component } from 'solid-js';
import type { FilterConfig } from '../types';

interface FilterBarProps {
  filter: FilterConfig;
  onFilterChange: (f: FilterConfig) => void;
  visible: boolean;
}

const inputStyle = {
  padding: '2px 6px',
  border: '1px solid var(--border)',
  'border-radius': '3px',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  'font-size': '12px',
  width: '120px',
  outline: 'none',
};

const labelStyle = {
  'font-size': '12px',
  color: 'var(--text-secondary)',
};

const FilterBar: Component<FilterBarProps> = (props) => {
  const setCanId = (v: string) =>
    props.onFilterChange({ ...props.filter, canId: v });

  const setTimeStart = (v: string) =>
    props.onFilterChange({ ...props.filter, timeStart: v });

  const setTimeEnd = (v: string) =>
    props.onFilterChange({ ...props.filter, timeEnd: v });

  const clearAll = () =>
    props.onFilterChange({ canId: '', timeStart: '', timeEnd: '' });

  const hasFilter = () =>
    props.filter.canId || props.filter.timeStart || props.filter.timeEnd;

  if (!props.visible) return null;

  return (
    <div style={{
      display: 'flex',
      'align-items': 'center',
      gap: '10px',
      padding: '4px 12px',
      background: 'var(--bg-secondary)',
      'border-bottom': '1px solid var(--border)',
      'min-height': '30px',
    }}>
      <span style={labelStyle}>CAN ID:</span>
      <input
        style={inputStyle}
        placeholder="e.g. 0x123"
        value={props.filter.canId}
        onInput={e => setCanId(e.currentTarget.value)}
      />

      <span style={labelStyle}>Time:</span>
      <input
        style={{ ...inputStyle, width: '70px' }}
        placeholder="start (s)"
        value={props.filter.timeStart}
        onInput={e => setTimeStart(e.currentTarget.value)}
      />
      <span style={{ ...labelStyle, margin: '0 -6px' }}>—</span>
      <input
        style={{ ...inputStyle, width: '70px' }}
        placeholder="end (s)"
        value={props.filter.timeEnd}
        onInput={e => setTimeEnd(e.currentTarget.value)}
      />

      {hasFilter() && (
        <button
          onClick={clearAll}
          style={{
            padding: '2px 10px',
            border: '1px solid var(--border)',
            'border-radius': '3px',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            'font-size': '11px',
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
};

export default FilterBar;
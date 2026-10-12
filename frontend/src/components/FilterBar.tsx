import { Component } from 'solid-js';
import type { FilterConfig } from '../types';

interface FilterBarProps {
  filter: FilterConfig;
  onFilterChange: (f: FilterConfig) => void;
  visible: boolean;
}

const inputClass = 'py-0.5 px-1.5 border border-border rounded bg-bg-primary text-text-primary text-xs outline-none';

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
    <div class="flex items-center gap-2.5 px-3 py-1 bg-bg-secondary border-b border-border" style={{ 'min-height': '30px' }}>
      <span class="text-xs text-text-secondary">CAN ID:</span>
      <input
        class={inputClass}
        style={{ width: '120px' }}
        placeholder="e.g. 0x123"
        value={props.filter.canId}
        onInput={e => setCanId(e.currentTarget.value)}
      />

      <span class="text-xs text-text-secondary">Time:</span>
      <input
        class={inputClass}
        style={{ width: '70px' }}
        placeholder="start (s)"
        value={props.filter.timeStart}
        onInput={e => setTimeStart(e.currentTarget.value)}
      />
      <span class="text-xs text-text-secondary -mx-1.5">&mdash;</span>
      <input
        class={inputClass}
        style={{ width: '70px' }}
        placeholder="end (s)"
        value={props.filter.timeEnd}
        onInput={e => setTimeEnd(e.currentTarget.value)}
      />

      {hasFilter() && (
        <button
          onClick={clearAll}
          class="px-2.5 py-0.5 border border-border rounded bg-transparent text-text-secondary cursor-pointer text-[11px] transition-colors duration-150 hover:bg-bg-tertiary"
        >
          Clear
        </button>
      )}
    </div>
  );
};

export default FilterBar;
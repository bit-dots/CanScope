import { Component, For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { Download, Eraser, Pause, Play, Search, X } from 'lucide-solid';
import type { EventLevel, RuntimeLogEntry } from '../runtimeEvents';
import './RuntimeLogPanel.css';

interface RuntimeLogPanelProps {
  entries: RuntimeLogEntry[];
  onClose: () => void;
  onClear: () => void;
  onExport: () => void;
}

const levelLabels: Record<EventLevel, string> = {
  error: '错误',
  warning: '警告',
  info: '信息',
};

const formatTimestamp = (timestamp: number) =>
  new Date(timestamp).toLocaleString(undefined, { hour12: false });

const RuntimeLogPanel: Component<RuntimeLogPanelProps> = (props) => {
  const [level, setLevel] = createSignal<EventLevel | 'all'>('all');
  const [query, setQuery] = createSignal('');
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [followLatest, setFollowLatest] = createSignal(true);
  const [confirmClear, setConfirmClear] = createSignal(false);
  const [height, setHeight] = createSignal(280);
  let listRef: HTMLDivElement | undefined;
  let dragStartY = 0;
  let dragStartHeight = 0;

  const filteredEntries = createMemo(() => {
    const search = query().trim().toLocaleLowerCase();
    return props.entries.filter((entry) =>
      (level() === 'all' || entry.level === level()) &&
      (!search || `${entry.source} ${entry.message} ${entry.details ?? ''}`.toLocaleLowerCase().includes(search)),
    ).reverse();
  });
  const levelCount = (selected: EventLevel) =>
    props.entries.filter((entry) => entry.level === selected).length;

  const selectedEntry = createMemo(() =>
    filteredEntries().find((entry) => entry.id === selectedId()) ??
    filteredEntries()[0] ??
    null,
  );

  createEffect(() => {
    filteredEntries();
    if (followLatest()) requestAnimationFrame(() => {
      if (listRef) listRef.scrollTop = 0;
    });
  });

  const onResizeMove = (event: MouseEvent) => {
    const maxHeight = Math.floor(window.innerHeight * 0.65);
    setHeight(Math.max(150, Math.min(maxHeight, dragStartHeight + dragStartY - event.clientY)));
  };

  const stopResize = () => {
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  const startResize = (event: MouseEvent) => {
    event.preventDefault();
    dragStartY = event.clientY;
    dragStartHeight = height();
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  onCleanup(stopResize);

  return (
    <section class="runtime-log" style={{ height: `${height()}px` }} aria-label="应用日志">
      <button class="runtime-log__resize" type="button" aria-label="拖动调整日志面板高度" onMouseDown={startResize} />
      <header class="runtime-log__header">
        <div class="runtime-log__title">
          <strong>日志</strong>
          <span>{props.entries.length.toLocaleString()} / 5,000</span>
          <span class="runtime-log__counts">
            <span class="runtime-log__count--error">错 {levelCount('error')}</span>
            <span class="runtime-log__count--warning">警 {levelCount('warning')}</span>
            <span>信 {levelCount('info')}</span>
          </span>
        </div>
        <div class="runtime-log__tools">
          <label class="runtime-log__search">
            <Search size={14} />
            <input
              aria-label="搜索日志"
              placeholder="搜索来源或内容"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
          <select aria-label="按等级筛选日志" value={level()} onChange={(event) => setLevel(event.currentTarget.value as EventLevel | 'all')}>
            <option value="all">全部等级</option>
            <option value="error">错误</option>
            <option value="warning">警告</option>
            <option value="info">信息</option>
          </select>
          <button
            type="button"
            class="runtime-log__icon-button"
            title={followLatest() ? '暂停跟随最新日志' : '跟随最新日志'}
            aria-label={followLatest() ? '暂停跟随最新日志' : '跟随最新日志'}
            onClick={() => setFollowLatest((following) => !following)}
          >
            {followLatest() ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button type="button" class="runtime-log__icon-button" title="导出日志" aria-label="导出日志" onClick={props.onExport}>
            <Download size={14} />
          </button>
          <Show when={confirmClear} fallback={
            <button type="button" class="runtime-log__icon-button" title="清空日志" aria-label="清空日志" onClick={() => setConfirmClear(true)}>
              <Eraser size={14} />
            </button>
          }>
            <span class="runtime-log__confirm">清空日志？</span>
            <button type="button" class="runtime-log__text-button" onClick={() => { props.onClear(); setConfirmClear(false); }}>确认</button>
            <button type="button" class="runtime-log__text-button" onClick={() => setConfirmClear(false)}>取消</button>
          </Show>
          <button type="button" class="runtime-log__icon-button" title="收起日志" aria-label="收起日志" onClick={props.onClose}>
            <X size={15} />
          </button>
        </div>
      </header>
      <div class="runtime-log__body">
        <div class="runtime-log__list" ref={listRef}>
          <Show when={filteredEntries().length > 0} fallback={<div class="runtime-log__empty">没有匹配的日志</div>}>
            <For each={filteredEntries()}>
              {(entry) => (
                <button
                  type="button"
                  class="runtime-log__row"
                  classList={{
                    'runtime-log__row--selected': selectedEntry()?.id === entry.id,
                    [`runtime-log__row--${entry.level}`]: true,
                  }}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <time>{formatTimestamp(entry.timestamp)}</time>
                  <span class="runtime-log__level">{levelLabels[entry.level]}</span>
                  <span class="runtime-log__source">{entry.source}</span>
                  <span class="runtime-log__message">
                    {entry.message}{(entry.occurrences ?? 1) > 1 ? ` ×${entry.occurrences}` : ''}
                  </span>
                </button>
              )}
            </For>
          </Show>
        </div>
        <aside class="runtime-log__detail">
          <Show when={selectedEntry()} fallback={<span>选择一条日志查看详情</span>}>
            {(entry) => (
              <>
                <div class="runtime-log__detail-meta">
                  <span class={`runtime-log__detail-level runtime-log__detail-level--${entry().level}`}>
                    {levelLabels[entry().level]}
                  </span>
                  <span>{entry().source}</span>
                  <time>{formatTimestamp(entry().timestamp)}</time>
                </div>
                <strong>{entry().message}</strong>
                <Show when={(entry().occurrences ?? 1) > 1}>
                  <span>重复发生 {entry().occurrences} 次</span>
                </Show>
                <Show when={entry().details}>
                  <pre>{entry().details}</pre>
                </Show>
              </>
            )}
          </Show>
        </aside>
      </div>
    </section>
  );
};

export default RuntimeLogPanel;

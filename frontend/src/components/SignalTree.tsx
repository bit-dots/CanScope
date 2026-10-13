import { Component, createSignal } from 'solid-js';
import type { DbcTreeInfo, DbcMessageInfo, ChartSignal } from '../types';
import { formatHex } from '../types';
import './SignalTree.css';

const COLORS = ['#38BFA7', '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF922B'];

interface SignalTreeProps {
  tree: DbcTreeInfo | null;
  onSelectMessage: (canId: number | null) => void;
  selectedCanId: number | null;
  onSelectSignal: (s: ChartSignal) => void;
  onRemoveSignal: (s: ChartSignal) => void;
  chartSignals: ChartSignal[];
}

const SignalTree: Component<SignalTreeProps> = (props) => {
  const [expanded, setExpanded] = createSignal<Set<number>>(new Set());
  const [search, setSearch] = createSignal('');

  const toggleMsg = (canId: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(canId)) next.delete(canId);
      else next.add(canId);
      return next;
    });
  };

  const selectMsg = (msg: DbcMessageInfo) => {
    if (props.selectedCanId === msg.canId) {
      props.onSelectMessage(null);
    } else {
      props.onSelectMessage(msg.canId);
      setExpanded(prev => new Set([...prev, msg.canId]));
    }
  };

  if (!props.tree) {
    return (
      <div class="signal-tree__empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="signal-tree__empty-icon">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <span class="signal-tree__empty-title">未加载 DBC 文件</span>
        <span class="signal-tree__empty-desc">
          请在主页 Ribbon 中点击 "DBC 导入"<br />加载数据库文件以查看信号
        </span>
      </div>
    );
  }

  const isChartSignal = (canId: number, signalName: string) =>
    props.chartSignals.some(s => s.canId === canId && s.signalName === signalName);

  const toggleSignalChart = (canId: number, signalName: string, unit: string) => {
    const existing = props.chartSignals.find(s => s.canId === canId && s.signalName === signalName);
    if (existing) {
      props.onRemoveSignal(existing);
    } else {
      props.onSelectSignal({ canId, signalName, unit });
    }
  };

  const searchLower = () => search().toLowerCase();
  const filtered = () => {
    if (!searchLower()) return props.tree!.messages;
    return props.tree!.messages.filter(m =>
      m.name.toLowerCase().includes(searchLower()) ||
      m.signals.some(s => s.name.toLowerCase().includes(searchLower())) ||
      formatHex(m.canId, 8).toLowerCase().includes(searchLower())
    );
  };

  return (
    <div class="signal-tree">
      <div class="signal-tree__header">
        <div class="signal-tree__title">
          DBC 信号
          <span class="signal-tree__stat">
            {props.tree.messageCount} 条报文 / {props.tree.signalCount} 个信号
          </span>
        </div>
        <input
          class="signal-tree__search"
          placeholder="搜索报文 / 信号..."
          value={search()}
          onInput={e => setSearch(e.currentTarget.value)}
        />
      </div>

      <div class="signal-tree__list">
        {filtered().map(msg => {
          const isExpanded = expanded().has(msg.canId);
          const isSelected = props.selectedCanId === msg.canId;

          return (
            <div>
              <div
                onClick={() => selectMsg(msg)}
                class="signal-tree__msg"
                classList={{ 'signal-tree__msg--selected': isSelected }}
              >
                <svg
                  onClick={e => { e.stopPropagation(); toggleMsg(msg.canId); }}
                  class="signal-tree__arrow"
                  classList={{ 'signal-tree__arrow--collapsed': !isExpanded }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-label={isExpanded ? '折叠' : '展开'}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                <span class="signal-tree__canid">
                  {formatHex(msg.canId, 3)}
                </span>
                <span class="signal-tree__msg-name">
                  {msg.name}
                </span>
                <span class="signal-tree__msg-count">
                  {msg.signalCount}
                </span>
              </div>

              {isExpanded && (
                <div class="signal-tree__signals">
                  <table class="signal-tree__sig-table">
                    <thead>
                      <tr>
                        <th class="signal-tree__sig-th">信号</th>
                        <th class="signal-tree__sig-th">位</th>
                        <th class="signal-tree__sig-th">字节序</th>
                        <th class="signal-tree__sig-th">单位</th>
                      </tr>
                    </thead>
                    <tbody>
                      {msg.signals.map(sig => {
                          const inChart = isChartSignal(msg.canId, sig.name);
                          const chartIdx = props.chartSignals.findIndex(s => s.canId === msg.canId && s.signalName === sig.name);
                          const color = chartIdx >= 0 ? COLORS[chartIdx % COLORS.length] : null;
                          return (
                        <tr
                          onClick={() => toggleSignalChart(msg.canId, sig.name, sig.unit)}
                          class="signal-tree__sig-row"
                          style={color ? { background: color + '14' } : {}}
                        >
                          <td class="signal-tree__sig-td" classList={{ 'signal-tree__sig-td--inchart': inChart }}>
                            {sig.multiplexer !== 'None' && (
                              <span class="signal-tree__sig-mux">
                                [{sig.multiplexer === 'Multiplexor' ? 'M' : 'm'}]
                              </span>
                            )}
                            {sig.name}
                          </td>
                          <td class="signal-tree__sig-td signal-tree__sig-bits">
                            {sig.startBit}:{sig.bitLength}
                          </td>
                          <td class="signal-tree__sig-td signal-tree__sig-order">
                            {sig.byteOrder === 'Intel' ? 'LE' : 'BE'}
                          </td>
                          <td class="signal-tree__sig-td signal-tree__sig-unit">
                            {sig.unit || '—'}
                          </td>
                        </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {filtered().length === 0 && (
          <div class="signal-tree__no-matches">
            无匹配结果
          </div>
        )}
      </div>
    </div>
  );
};

export default SignalTree;
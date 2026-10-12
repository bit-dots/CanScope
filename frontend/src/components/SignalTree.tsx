import { Component, createSignal } from 'solid-js';
import type { DbcTreeInfo, DbcMessageInfo, ChartSignal } from '../types';
import { formatHex } from '../types';

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
      <div style={{
        padding: '16px 12px',
        color: 'var(--text-secondary)',
        'font-size': '12px',
      }}>
        Load a DBC file to view signals
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
    <div style={{
      display: 'flex',
      'flex-direction': 'column',
      height: '100%',
      background: 'var(--bg-secondary)',
    }}>
      <div style={{
        padding: '6px 10px',
        'border-bottom': '1px solid var(--border)',
        'font-size': '11px',
        color: 'var(--text-secondary)',
      }}>
        <div style={{ 'margin-bottom': '6px', 'font-weight': '600', 'font-size': '12px', color: 'var(--text-primary)' }}>
          DBC Signals
          <span style={{ 'margin-left': '6px', 'font-weight': '400', color: 'var(--text-secondary)' }}>
            {props.tree.messageCount} msgs / {props.tree.signalCount} sigs
          </span>
        </div>
        <input
          style={{
            width: '100%',
            padding: '3px 6px',
            border: '1px solid var(--border)',
            'border-radius': '3px',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            'font-size': '11px',
            outline: 'none',
            'box-sizing': 'border-box',
          }}
          placeholder="Search messages / signals..."
          value={search()}
          onInput={e => setSearch(e.currentTarget.value)}
        />
      </div>

      <div style={{
        flex: 1,
        overflow: 'auto',
        'font-size': '12px',
      }}>
        {filtered().map(msg => {
          const isExpanded = expanded().has(msg.canId);
          const isSelected = props.selectedCanId === msg.canId;

          return (
            <div>
              <div
                onClick={() => selectMsg(msg)}
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--accent)' : 'transparent',
                  color: isSelected ? '#fff' : 'var(--text-primary)',
                  'border-bottom': '1px solid var(--border)',
                }}
              >
                <svg
                  onClick={e => { e.stopPropagation(); toggleMsg(msg.canId); }}
                  style={{
                    cursor: 'pointer',
                    width: '16px',
                    height: '16px',
                    'flex-shrink': '0',
                    color: isSelected ? '#fff' : 'var(--text-secondary)',
                    transition: 'transform 0.15s',
                    transform: isExpanded ? '' : 'rotate(-90deg)',
                  }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                <span style={{
                  'font-family': '"JetBrains Mono", monospace',
                  'font-size': '11px',
                  'margin-left': '4px',
                  'flex-shrink': '0',
                }}>
                  {formatHex(msg.canId, 3)}
                </span>
                <span style={{
                  'margin-left': '8px',
                  overflow: 'hidden',
                  'text-overflow': 'ellipsis',
                  'white-space': 'nowrap',
                  'font-weight': '500',
                }}>
                  {msg.name}
                </span>
                <span style={{
                  'margin-left': 'auto',
                  'font-size': '10px',
                  'flex-shrink': '0',
                  'padding-left': '6px',
                  opacity: 0.6,
                }}>
                  {msg.signalCount}
                </span>
              </div>

              {isExpanded && (
                <div style={{
                  background: 'var(--bg-primary)',
                  'border-bottom': '1px solid var(--border)',
                }}>
                  <table style={{
                    width: '100%',
                    'border-collapse': 'collapse',
                    'font-size': '11px',
                  }}>
                    <thead>
                      <tr style={{ color: 'var(--text-secondary)' }}>
                        <th style={sigTh}>Signal</th>
                        <th style={sigTh}>Bits</th>
                        <th style={sigTh}>Order</th>
                        <th style={sigTh}>Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {msg.signals.map(sig => {
                          const inChart = isChartSignal(msg.canId, sig.name);
                          return (
                        <tr
                          onClick={() => toggleSignalChart(msg.canId, sig.name, sig.unit)}
                          style={{
                            'border-top': '1px solid var(--border)',
                            cursor: 'pointer',
                            background: inChart ? COLORS[props.chartSignals.findIndex(s => s.canId === msg.canId && s.signalName === sig.name) % COLORS.length] + '14' : 'transparent',
                          }}
                        >
                          <td style={{ ...sigTd, 'font-weight': inChart ? '600' : '400' }}>
                            {sig.multiplexer !== 'None' && (
                              <span style={{ color: 'var(--accent)', 'font-size': '9px', 'margin-right': '2px' }}>
                                [{sig.multiplexer === 'Multiplexor' ? 'M' : 'm'}]
                              </span>
                            )}
                            {sig.name}
                          </td>
                          <td style={{ ...sigTd, 'font-family': 'monospace' }}>
                            {sig.startBit}:{sig.bitLength}
                          </td>
                          <td style={{ ...sigTd, 'font-family': '"JetBrains Mono", monospace', 'font-size': '10px' }}>
                            {sig.byteOrder === 'Intel' ? 'LE' : 'BE'}
                          </td>
                          <td style={{ ...sigTd, color: 'var(--text-secondary)' }}>
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
          <div style={{
            padding: '12px',
            'text-align': 'center',
            color: 'var(--text-secondary)',
          }}>
            No matches
          </div>
        )}
      </div>
    </div>
  );
};

const sigTh: Record<string, string> = {
  padding: '2px 6px',
  'text-align': 'left',
  'font-weight': '500',
};

const sigTd: Record<string, string> = {
  padding: '2px 6px',
  'white-space': 'nowrap',
  overflow: 'hidden',
  'text-overflow': 'ellipsis',
  'max-width': '180px',
};

export default SignalTree;
import { Component, createSignal, For, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { X, ChevronRight, ChevronDown, File, Layers, Mail, Cpu, Activity } from 'lucide-solid';
import type { DbcBinding, ChartSignal } from '../types';
import './AddSignalDialog.css';

/* ============================================
   Types (mirroring DatabaseManagerDialog DBC detail)
   ============================================ */

interface DbcSignalDetail {
  name: string;
  startBit: number;
  bitLength: number;
  byteOrder: string;
  unit: string;
  min: number | null;
  max: number | null;
  multiplexer: string;
}

interface DbcMessageDetail {
  canId: number;
  name: string;
  dlc: number;
  sender: string;
  signalCount: number;
  signals: DbcSignalDetail[];
}

interface DbcNodeDetail {
  name: string;
  messageCount: number;
  signalCount: number;
  messages: DbcMessageDetail[];
}

interface DbcDetail {
  messages: DbcMessageDetail[];
  nodes: DbcNodeDetail[];
}

/* ============================================
   Props
   ============================================ */

interface AddSignalDialogProps {
  dbcBindings: DbcBinding[];
  existingSignals: ChartSignal[];
  onConfirm: (signals: ChartSignal[]) => void;
  onCancel: () => void;
}

/* ============================================
   Helpers
   ============================================ */

function getFileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

/* ============================================
   Component
   ============================================ */

const AddSignalDialog: Component<AddSignalDialogProps> = (props) => {
  const [closing, setClosing] = createSignal(false);

  // ---- 左栏：通道展开 & DBC 选中 ----
  const [expandedChannels, setExpandedChannels] = createSignal<Set<number>>(new Set());
  const [selectedDbcPath, setSelectedDbcPath] = createSignal<string | null>(null);

  // ---- 右栏：DBC 详情 + 信号树展开 ----
  const [dbcDetail, setDbcDetail] = createSignal<DbcDetail | null>(null);
  const [loadingDbc, setLoadingDbc] = createSignal(false);
  const [expandedSection, setExpandedSection] = createSignal<Set<string>>(new Set());
  const [expandedMsgs, setExpandedMsgs] = createSignal<Set<string>>(new Set());
  const [expandedNodes, setExpandedNodes] = createSignal<Set<string>>(new Set());

  // ---- DBC 根节点展开/折叠 ----
  const [dbcExpanded, setDbcExpanded] = createSignal(true);

  // ---- 已选信号 ----
  const [selectedSignals, setSelectedSignals] = createSignal<ChartSignal[]>([]);

  // ---- 通道分组 ----
  const channelGroups = () => {
    const map = new Map<number, DbcBinding[]>();
    for (const b of props.dbcBindings) {
      if (!map.has(b.busId)) map.set(b.busId, []);
      map.get(b.busId)!.push(b);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  };

  const toggleChannel = (busId: number) => {
    setExpandedChannels((prev) => {
      const next = new Set<number>(prev);
      if (next.has(busId)) next.delete(busId);
      else next.add(busId);
      return next;
    });
  };

  const selectDbc = async (path: string) => {
    if (selectedDbcPath() === path) return;
    setSelectedDbcPath(path);
    setSelectedSignals([]);
    setDbcDetail(null);
    setLoadingDbc(true);
    try {
      const detail = await invoke<DbcDetail>('get_dbc_detail', { path });
      setDbcDetail(detail);
      setExpandedSection(new Set<string>());
      setExpandedMsgs(new Set<string>());
      setExpandedNodes(new Set<string>());
    } catch (e) {
      console.error('Failed to load DBC detail:', e);
    } finally {
      setLoadingDbc(false);
    }
  };

  // ---- 信号选择 ----
  const isExisting = (canId: number, sigName: string) =>
    props.existingSignals.some((s) => s.canId === canId && s.signalName === sigName);

  const isSelected = (canId: number, sigName: string) =>
    selectedSignals().some((s) => s.canId === canId && s.signalName === sigName);

  const toggleSignal = (canId: number, sigName: string, unit: string) => {
    if (isExisting(canId, sigName)) return;
    setSelectedSignals((prev) => {
      const idx = prev.findIndex((s) => s.canId === canId && s.signalName === sigName);
      if (idx >= 0) {
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      }
      return [...prev, { canId, signalName: sigName, unit }];
    });
  };

  // ---- 关闭 ----
  const handleClose = () => {
    setClosing(true);
    setTimeout(() => props.onCancel(), 150);
  };

  const handleConfirm = () => {
    setClosing(true);
    setTimeout(() => props.onConfirm(selectedSignals()), 150);
  };

  // ---- 渲染信号行（匹配 dm-tree-sig 结构） ----
  const renderSignalRow = (
    sig: DbcSignalDetail,
    canId: number,
  ) => {
    const existing = isExisting(canId, sig.name);
    const selected = isSelected(canId, sig.name);
    return (
      <div
        class="dm-tree-sig"
        classList={{
          'add-signal-dialog__sig--selected': selected,
          'add-signal-dialog__sig--existing': existing,
        }}
        onClick={() => toggleSignal(canId, sig.name, sig.unit)}
      >
        <span class="dm-tree-sig__name">
          <Activity size={12} class="dm-tree-sig__icon" />
          {' '}{existing ? '✓ ' : selected ? '● ' : ''}{sig.name}
        </span>
        <span class="dm-tree-sig__bits">
          [{sig.startBit}|{sig.bitLength}]
        </span>
        <span class="dm-tree-sig__order">{sig.byteOrder}</span>
        <Show when={sig.min != null && sig.max != null}>
          <span class="dm-tree-sig__range">{sig.min}..{sig.max}</span>
        </Show>
        <Show when={sig.unit}>
          <span class="dm-tree-sig__unit">{sig.unit}</span>
        </Show>
      </div>
    );
  };

  return (
    <div
      class="add-signal-overlay"
      classList={{ 'add-signal-overlay--closing': closing() }}
      onClick={handleClose}
    >
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        class="add-signal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- 标题栏 ---- */}
        <div class="add-signal-dialog__header">
          <span class="add-signal-dialog__title">添加信号</span>
          <button class="add-signal-dialog__close" onClick={handleClose}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* ---- 主体 ---- */}
        <div class="add-signal-dialog__body">
          {/* ---- 左栏 ---- */}
          <div class="add-signal-dialog__left">
            <div class="add-signal-dialog__left-header">通道 / DBC</div>
            <div class="add-signal-dialog__left-list">
              <Show
                when={channelGroups().length > 0}
                fallback={
                  <div class="add-signal-dialog__empty-left">
                    暂无绑定的 DBC 文件<br />
                    请先在数据库管理器中导入
                  </div>
                }
              >
                <For each={channelGroups()}>
                  {([busId, bindings]) => {
                    const open = () => expandedChannels().has(busId);
                    return (
                      <div class="add-signal-dialog__channel">
                        <div
                          class="add-signal-dialog__channel-header"
                          onClick={() => toggleChannel(busId)}
                        >
                          <ChevronRight
                            size={12}
                            class="add-signal-dialog__channel-arrow"
                            classList={{ 'add-signal-dialog__channel-arrow--open': open() }}
                          />
                          <span class="add-signal-dialog__channel-name">
                            CAN {busId}
                          </span>
                          <span class="add-signal-dialog__channel-count">
                            {bindings.length} DBC
                          </span>
                        </div>
                        <Show when={open()}>
                          <div class="add-signal-dialog__dbc-list">
                            <For each={bindings}>
                              {(binding) => {
                                const path = binding.path;
                                const isSel = selectedDbcPath() === path;
                                return (
                                  <div
                                    class="add-signal-dialog__dbc-item"
                                    classList={{ 'add-signal-dialog__dbc-item--selected': isSel }}
                                    onClick={() => selectDbc(path)}
                                  >
                                    <File size={12} class="add-signal-dialog__dbc-icon" />
                                    <span class="add-signal-dialog__dbc-name">
                                      {getFileName(path)}
                                    </span>
                                  </div>
                                );
                              }}
                            </For>
                          </div>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </Show>
            </div>
          </div>

          {/* ---- 右栏 ---- */}
          <div class="add-signal-dialog__right">
            <Show
              when={selectedDbcPath()}
              fallback={
                <div class="add-signal-dialog__right-empty">
                  <Layers size={32} class="add-signal-dialog__right-empty-icon" />
                  <span>请在左侧选择一个 DBC 文件</span>
                </div>
              }
            >
              <Show
                when={!loadingDbc() && dbcDetail()}
                fallback={
                  <div class="add-signal-dialog__right-loading">
                    加载中...
                  </div>
                }
              >
                {(detail) => (
                  <div class="add-signal-dialog__right-tree">
                      {/* ---- DBC 根节点 ---- */}
                      <div
                        class="add-signal-dialog__dbc-root"
                        onClick={() => setDbcExpanded((v) => !v)}
                      >
                        <span class="dm-tree-arrow">
                          {dbcExpanded()
                            ? <ChevronDown size={12} />
                            : <ChevronRight size={12} />}
                        </span>
                        <File size={12} class="add-signal-dialog__dbc-root-icon" />
                        <span class="add-signal-dialog__dbc-root-name">
                          {getFileName(selectedDbcPath()!)}
                        </span>
                      </div>

                      {/* ---- DBC 子级（Messages + Network Nodes） ---- */}
                      <Show when={dbcExpanded()}>
                      <div class="add-signal-dialog__dbc-children">
                        {/* ---- Messages 区块 ---- */}
                        <div class="dm-tree-section">
                          <div
                            class="dm-tree-section__header"
                            onClick={() => {
                              const key = 'messages';
                              setExpandedSection((prev) => {
                                const next = new Set<string>(prev);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              });
                            }}
                          >
                            <span class="dm-tree-arrow">
                              {expandedSection().has('messages')
                                ? <ChevronDown size={12} />
                                : <ChevronRight size={12} />}
                            </span>
                            <Layers size={12} class="dm-tree-section__icon" />
                            <span class="dm-tree-section__label">Messages</span>
                            <span class="dm-tree-section__count">
                              {detail().messages.length}
                            </span>
                          </div>
                          <Show when={expandedSection().has('messages')}>
                            <For each={detail().messages}>
                              {(msg) => (
                                <div class="dm-tree-group">
                                  <div
                                    class="dm-tree-msg"
                                    onClick={() => {
                                      setExpandedMsgs((prev) => {
                                        const next = new Set<string>(prev);
                                        const key = `m:${msg.canId}`;
                                        if (next.has(key)) next.delete(key);
                                        else next.add(key);
                                        return next;
                                      });
                                    }}
                                  >
                                    <span class="dm-tree-arrow">
                                      {msg.signalCount > 0
                                        ? (expandedMsgs().has(`m:${msg.canId}`)
                                          ? <ChevronDown size={12} />
                                          : <ChevronRight size={12} />)
                                        : null}
                                    </span>
                                    <span class="dm-tree-msg__name">
                                      <Mail size={12} class="dm-tree-msg__icon" />
                                      {' '}{msg.name}
                                    </span>
                                    <span class="dm-tree-msg__id">
                                      (0x{msg.canId.toString(16).toUpperCase()})
                                    </span>
                                    <span class="dm-tree-msg__meta">
                                      dlc:{msg.dlc} {msg.sender}
                                    </span>
                                  </div>
                                  <Show when={expandedMsgs().has(`m:${msg.canId}`)}>
                                    <div class="dm-tree-signals">
                                      <For each={msg.signals}>
                                        {(sig) => renderSignalRow(sig, msg.canId)}
                                      </For>
                                    </div>
                                  </Show>
                                </div>
                              )}
                            </For>
                          </Show>
                        </div>

                        {/* ---- Network Nodes 区块 ---- */}
                        <Show when={detail().nodes.length > 0}>
                          <div class="dm-tree-section">
                            <div
                              class="dm-tree-section__header"
                              onClick={() => {
                                const key = 'nodes';
                                setExpandedSection((prev) => {
                                  const next = new Set<string>(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                              }}
                            >
                              <span class="dm-tree-arrow">
                                {expandedSection().has('nodes')
                                  ? <ChevronDown size={12} />
                                  : <ChevronRight size={12} />}
                              </span>
                              <Layers size={12} class="dm-tree-section__icon" />
                              <span class="dm-tree-section__label">Network Nodes</span>
                              <span class="dm-tree-section__count">
                                {detail().nodes.length}
                              </span>
                            </div>
                            <Show when={expandedSection().has('nodes')}>
                              <For each={detail().nodes}>
                                {(node) => (
                                  <div class="dm-tree-group">
                                    <div
                                      class="dm-tree-node"
                                      onClick={() => {
                                        setExpandedNodes((prev) => {
                                          const next = new Set<string>(prev);
                                          if (next.has(node.name)) next.delete(node.name);
                                          else next.add(node.name);
                                          return next;
                                        });
                                      }}
                                    >
                                      <span class="dm-tree-arrow">
                                        {node.messageCount > 0
                                          ? (expandedNodes().has(node.name)
                                            ? <ChevronDown size={12} />
                                            : <ChevronRight size={12} />)
                                          : null}
                                      </span>
                                      <span class="dm-tree-node__name">
                                        <Cpu size={12} class="dm-tree-node__icon" />
                                        {' '}{node.name}
                                      </span>
                                      <span class="dm-tree-node__meta">
                                        {node.messageCount} msgs · {node.signalCount} sigs
                                      </span>
                                    </div>
                                    <Show when={expandedNodes().has(node.name)}>
                                      <div class="dm-tree-node-messages">
                                        <For each={node.messages}>
                                          {(msg) => (
                                            <div class="dm-tree-group">
                                              <div
                                                class="dm-tree-msg dm-tree-msg--nested"
                                                onClick={() => {
                                                  setExpandedMsgs((prev) => {
                                                    const next = new Set<string>(prev);
                                                    const key = `n:${msg.canId}`;
                                                    if (next.has(key)) next.delete(key);
                                                    else next.add(key);
                                                    return next;
                                                  });
                                                }}
                                              >
                                                <span class="dm-tree-arrow">
                                                  {msg.signalCount > 0
                                                    ? (expandedMsgs().has(`n:${msg.canId}`)
                                                      ? <ChevronDown size={12} />
                                                      : <ChevronRight size={12} />)
                                                    : null}
                                                </span>
                                                <span class="dm-tree-msg__name">
                                                  <Mail size={12} class="dm-tree-msg__icon" />
                                                  {' '}{msg.name}
                                                </span>
                                                <span class="dm-tree-msg__id">
                                                  (0x{msg.canId.toString(16).toUpperCase()})
                                                </span>
                                                <span class="dm-tree-msg__meta">
                                                  dlc:{msg.dlc}
                                                </span>
                                              </div>
                                              <Show when={expandedMsgs().has(`n:${msg.canId}`)}>
                                                <div class="dm-tree-signals">
                                                  <For each={msg.signals}>
                                                    {(sig) => renderSignalRow(sig, msg.canId)}
                                                  </For>
                                                </div>
                                              </Show>
                                            </div>
                                          )}
                                        </For>
                                      </div>
                                    </Show>
                                  </div>
                                )}
                              </For>
                            </Show>
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </div>
                )}
              </Show>
            </Show>
          </div>
        </div>

        {/* ---- 底部栏 ---- */}
        <div class="add-signal-dialog__footer">
          <span class="add-signal-dialog__footer-info">
            已添加 {selectedSignals().length} 个信号
          </span>
          <div class="add-signal-dialog__footer-actions">
            <button
              class="add-signal-dialog__btn"
              disabled={selectedSignals().length === 0}
              onClick={() => setSelectedSignals([])}
            >
              清空
            </button>
            <button
              class="add-signal-dialog__btn add-signal-dialog__btn--primary"
              disabled={selectedSignals().length === 0}
              onClick={handleConfirm}
            >
              确定
            </button>
            <button class="add-signal-dialog__btn" onClick={handleClose}>
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddSignalDialog;
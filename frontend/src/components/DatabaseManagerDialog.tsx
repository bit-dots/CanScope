import { Component, createSignal, For, Show, onCleanup, onMount, createEffect, type JSX } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { FilePlus, FileX, RefreshCw, Info, Trash2, CircleHelp, X, File, Database, Layers, Mail, Activity, Cpu, ChevronDown, ChevronRight } from 'lucide-solid';

export interface DatabaseEntry {
  id: string;
  name: string;
  path: string;
  type: 'dbc' | 'ldf';
  busIds: number[];
}

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

interface DatabaseManagerProps {
  mode?: 'dialog' | 'panel';
  initialBindings: { busId: number; path: string }[];
  onConfirm: (entries: DatabaseEntry[]) => void;
}

const getFileType = (path: string): 'dbc' | 'ldf' => {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'ldf') return 'ldf';
  return 'dbc';
};

const getFileName = (path: string): string => {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
};

let idCounter = 0;
const nextId = () => `db-${++idCounter}`;

const ToolbarIcon: Component<{ title: string; onClick: () => void; disabled?: boolean; children?: JSX.Element }> = (props) => (
  <button
    class="dm-toolbar-btn"
    onClick={props.onClick}
    disabled={props.disabled}
    aria-label={props.title}
    title={props.title}
  >
    {props.children}
  </button>
);

const DatabaseManagerDialog: Component<DatabaseManagerProps> = (props) => {
  const isDialog = () => (props.mode ?? 'dialog') === 'dialog';

  const [visible, setVisible] = createSignal(false);
  const [closing, setClosing] = createSignal(false);

  onMount(() => {
    if (isDialog()) {
      requestAnimationFrame(() => setVisible(true));
    }
  });

  const closeWithAnimation = () => {
    if (!isDialog()) {
      props.onConfirm(entries());
      return;
    }
    setClosing(true);
    setVisible(false);
    setTimeout(() => props.onConfirm(entries()), 200);
  };

  // 将扁平的 {busId, path} 列表按路径分组，合并同一文件的多通道绑定
  const groupedBindings = new Map<string, number[]>();
  for (const b of props.initialBindings) {
    if (!groupedBindings.has(b.path)) {
      groupedBindings.set(b.path, []);
    }
    const ids = groupedBindings.get(b.path)!;
    if (!ids.includes(b.busId)) {
      ids.push(b.busId);
    }
  }

  const [entries, setEntries] = createSignal<DatabaseEntry[]>(
    [...groupedBindings.entries()].map(([path, busIds]) => ({
      id: nextId(),
      name: getFileName(path),
      path,
      type: getFileType(path),
      busIds: busIds.sort((a, b) => a - b),
    }))
  );
  const [showHelp, setShowHelp] = createSignal(false);
  let helpRef: HTMLDivElement | undefined;
  let dialogRef: HTMLDivElement | undefined;

  const hasEntries = () => entries().length > 0;

  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  let lastClickedIndex: number | null = null;

  const selectedCount = () => selectedIds().size;

  const isSelected = (id: string) => selectedIds().has(id);

  const clearSelection = () => {
    setSelectedIds(new Set<string>());
    lastClickedIndex = null;
  };

  const handleRowClick = (id: string, index: number, e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      lastClickedIndex = index;
    } else if (e.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const idsInRange = entries().slice(start, end + 1).map((e) => e.id);
      setSelectedIds(new Set(idsInRange));
    } else {
      setSelectedIds(new Set([id]));
      lastClickedIndex = index;
    }
  };

  const closeHelp = () => setShowHelp(false);
  const toggleHelp = () => setShowHelp((v) => !v);

  createEffect(() => {
    if (showHelp()) {
      document.addEventListener('click', handleHelpOutsideClick);
    } else {
      document.removeEventListener('click', handleHelpOutsideClick);
    }
  });

  onCleanup(() => {
    document.removeEventListener('click', handleHelpOutsideClick);
    document.removeEventListener('click', handleDropdownOutsideClick);
  });

  const handleHelpOutsideClick = (e: MouseEvent) => {
    if (helpRef && !helpRef.contains(e.target as Node)) {
      closeHelp();
    }
  };

  let channelDropRef: HTMLDivElement | undefined;

  const handleDropdownOutsideClick = (e: MouseEvent) => {
    if (channelDropdown() && channelDropRef && !channelDropRef.contains(e.target as Node)) {
      closeChannelDropdown();
    }
  };

  createEffect(() => {
    if (channelDropdown()) {
      document.addEventListener('click', handleDropdownOutsideClick, true);
    } else {
      document.removeEventListener('click', handleDropdownOutsideClick, true);
    }
  });

  const handleRemove = () => {
    const ids = selectedIds();
    if (ids.size === 0) return;
    setEntries((prev) => prev.filter((e) => !ids.has(e.id)));
    clearSelection();
  };

  const handleRefresh = async () => {
    const ids = selectedIds();
    if (ids.size === 0) return;
    const selected = entries().filter((e) => ids.has(e.id));
    for (const entry of selected) {
      if (entry.type === 'dbc') {
        for (const busId of entry.busIds) {
          try {
            await invoke('load_dbc', { path: entry.path, busId });
          } catch (e) {
            console.error('Failed to refresh DBC:', entry.name, busId, e);
          }
        }
      }
    }
    clearSelection();
  };

  const [showSidebar, setShowSidebar] = createSignal(false);

  const [expandedIds, setExpandedIds] = createSignal<Set<string>>(new Set());
  const [expandedMsgKeys, setExpandedMsgKeys] = createSignal<Set<string>>(new Set());
  const [expandedNodeKeys, setExpandedNodeKeys] = createSignal<Set<string>>(new Set());
  const [expandedSectionKeys, setExpandedSectionKeys] = createSignal<Set<string>>(new Set());
  const [dbcDetails, setDbcDetails] = createSignal<Record<string, DbcDetail>>({});

  const toggleExpand = async (entry: DatabaseEntry) => {
    const ids = expandedIds();
    const next = new Set(ids);
    if (next.has(entry.id)) {
      next.delete(entry.id);
      setExpandedIds(next);
    } else {
      next.add(entry.id);
      setExpandedIds(next);
      if (entry.type === 'dbc' && !dbcDetails()[entry.path]) {
        try {
          const detail = await invoke<DbcDetail>('get_dbc_detail', { path: entry.path });
          setDbcDetails((prev) => ({ ...prev, [entry.path]: detail }));
        } catch (e) {
          console.error('Failed to get DBC detail:', e);
        }
      }
    }
  };

  const toggleMsgExpand = (canId: number, entryId: string) => {
    const key = `${entryId}::${canId}`;
    setExpandedMsgKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleNodeExpand = (nodeName: string, entryId: string) => {
    const key = `${entryId}::${nodeName}`;
    setExpandedNodeKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSectionExpand = (sectionName: string, entryId: string) => {
    const key = `${entryId}::${sectionName}`;
    setExpandedSectionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const isExpanded = (id: string) => expandedIds().has(id);
  const isMsgExpanded = (entryId: string, canId: number) => expandedMsgKeys().has(`${entryId}::${canId}`);
  const isNodeExpanded = (entryId: string, nodeName: string) => expandedNodeKeys().has(`${entryId}::${nodeName}`);
  const isSectionExpanded = (entryId: string, sectionName: string) => expandedSectionKeys().has(`${entryId}::${sectionName}`);

  interface ChannelDropdownState {
    entryId: string;
    rect: { top: number; left: number; width: number };
  }
  const [channelDropdown, setChannelDropdown] = createSignal<ChannelDropdownState | null>(null);

  const toggleChannelDropdown = (entryId: string, e: MouseEvent) => {
    e.stopPropagation();
    if (channelDropdown()?.entryId === entryId) {
      setChannelDropdown(null);
      return;
    }
    const cell = (e.currentTarget as HTMLElement).closest('td');
    if (!cell || !dialogRef) return;
    const cellRect = cell.getBoundingClientRect();
    const dialogRect = dialogRef.getBoundingClientRect();
    setChannelDropdown({
      entryId,
      rect: {
        top: cellRect.bottom - dialogRect.top + 4,
        left: cellRect.left - dialogRect.left,
        width: cellRect.width,
      },
    });
  };

  const closeChannelDropdown = () => setChannelDropdown(null);

  const isChannelChecked = (entryId: string, busId: number) => {
    const entry = entries().find((e) => e.id === entryId);
    return entry ? entry.busIds.includes(busId) : false;
  };

  const toggleChannel = (entryId: string, busId: number) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e;
        const has = e.busIds.includes(busId);
        const next = has
          ? e.busIds.filter((id) => id !== busId)
          : [...e.busIds, busId].sort((a, b) => a - b);
        return { ...e, busIds: next.length > 0 ? next : [0] };
      })
    );
  };
  const sidebarEntry = () => {
    if (selectedCount() !== 1) return null;
    const ids = selectedIds();
    return entries().find((e) => ids.has(e.id)) ?? null;
  };

  // 当选中的文件不再是恰好 1 个，或该文件已被删除时，自动关闭 sidebar
  createEffect(() => {
    if (showSidebar() && !sidebarEntry()) {
      setShowSidebar(false);
    }
  });

  const [nameColWidth, setNameColWidth] = createSignal(164);
  const [typeColWidth, setTypeColWidth] = createSignal(52);
  const [chanColWidth, setChanColWidth] = createSignal(110);
  const [isResizing, setIsResizing] = createSignal(false);
  let resizeStartX = 0;
  let resizeStartWidth = 0;

  const makeResizeHandler = (setter: (v: number) => void, getter: () => number) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartX = e.clientX;
    resizeStartWidth = getter();
    setIsResizing(true);
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - resizeStartX;
      const newWidth = Math.max(40, Math.min(400, resizeStartWidth + delta));
      setter(newWidth);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setIsResizing(false);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  createEffect(() => {
    if (isResizing()) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  const handleToggleSidebar = () => {
    if (selectedCount() !== 1) return;
    setShowSidebar((v) => !v);
  };

  const handleCloseSidebar = (e?: MouseEvent) => {
    e?.stopPropagation();
    setShowSidebar(false);
  };

  const handleClearAll = () => {
    setEntries([]);
    clearSelection();
    setShowSidebar(false);
  };

  const handleImport = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        title: '导入数据库文件',
        filters: [
          { name: '数据库文件 (DBC, LDF)', extensions: ['dbc', 'ldf'] },
          { name: 'DBC Files', extensions: ['dbc'] },
          { name: 'LDF Files', extensions: ['ldf'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        multiple: true,
      });
      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      const existingMap = new Map(entries().map((e) => [e.path, e]));
      const newEntries: DatabaseEntry[] = [];

      for (const path of paths) {
        if (typeof path !== 'string') continue;
        const existing = existingMap.get(path);
        if (existing) {
          if (!existing.busIds.includes(1)) {
            setEntries((prev) =>
              prev.map((e) =>
                e.path === path
                  ? { ...e, busIds: [...e.busIds, 1].sort((a, b) => a - b) }
                  : e
              )
            );
          }
        } else {
          newEntries.push({
            id: nextId(),
            name: getFileName(path),
            path,
            type: getFileType(path),
            busIds: [1],
          });
        }
      }

      if (newEntries.length > 0) {
        setEntries((prev) => [...prev, ...newEntries]);
      }
    } catch {
      // dialog cancelled
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (channelDropdown()) {
        closeChannelDropdown();
      } else if (showSidebar()) {
        handleCloseSidebar();
      } else if (showHelp()) {
        closeHelp();
      } else {
        closeWithAnimation();
      }
    }
  };

  const handleOverlayClick = (e: MouseEvent) => {
    if (isDialog() && dialogRef && !dialogRef.contains(e.target as Node)) {
      closeWithAnimation();
    }
  };

  // Shared help button + popover
  const HelpButton = (
    <>
      <button
        class="dm-titlebar-help"
        classList={{ 'dm-titlebar-help--active': showHelp() }}
        onClick={toggleHelp}
        aria-label="帮助"
        title="关于此窗口"
      >
        <CircleHelp size={14} />
      </button>
      <Show when={showHelp()}>
        <div
          ref={helpRef}
          class="dm-help-popover"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="dm-help-popover-arrow" />
          <div class="dm-help-popover-body">
            <strong>在此统一管理工程加载的数据库文件。</strong>
            <ul>
              <li>点击 <FilePlus class="dm-inline-icon" size={12} /> 添加 DBC 或 LDF 文件</li>
              <li>选中文件后可移除、刷新或查看属性</li>
              <li>关闭窗口后自动加载至工程</li>
            </ul>
          </div>
        </div>
      </Show>
    </>
  );

  // Shared icon toolbar
  const Toolbar = (
    <div class="dm-toolbar">
      <div class="dm-toolbar__group">
        <ToolbarIcon title="添加文件" onClick={handleImport}>
          <FilePlus size={16} />
        </ToolbarIcon>
        <ToolbarIcon title="移除选中文件" onClick={handleRemove} disabled={selectedCount() === 0}>
          <FileX size={16} />
        </ToolbarIcon>
        <ToolbarIcon title="刷新选中文件" onClick={handleRefresh} disabled={selectedCount() === 0}>
          <RefreshCw size={16} />
        </ToolbarIcon>
      </div>
      <div class="dm-toolbar-sep" />
      <div class="dm-toolbar__group">
        <ToolbarIcon title="属性" onClick={handleToggleSidebar} disabled={selectedCount() !== 1}>
          <Info size={16} />
        </ToolbarIcon>
      </div>
      <div class="dm-toolbar-sep" />
      <div class="dm-toolbar__group">
        <ToolbarIcon title="清空全部" onClick={handleClearAll} disabled={!hasEntries()}>
          <Trash2 size={16} />
        </ToolbarIcon>
      </div>
      <Show when={hasEntries()}>
        <div class="dm-toolbar-sep" />
        <span class="dm-toolbar-count">{entries().length} 个文件</span>
      </Show>
      {!isDialog() && (
        <div class="dm-toolbar--right">
          {HelpButton}
        </div>
      )}
    </div>
  );

  // Shared content body
  const Content = (
    <div class="dm-files">
      <Show when={!hasEntries()}>
        <div class="dm-files-empty">
          <File size={24} strokeWidth={1.2} />
          <p>暂无文件，点击 <FilePlus class="dm-inline-icon" size={12} /> 添加</p>
        </div>
      </Show>
      <Show when={hasEntries()}>
        <div class="dm-files-body">
          <div class="dm-files-table-wrap">
            <table class="dm-files-table" onClick={() => clearSelection()}>
              <colgroup>
                <col style={{ width: `${nameColWidth()}px` }} />
                <col style={{ width: `${typeColWidth()}px` }} />
                <col style={{ width: `${chanColWidth()}px` }} />
              </colgroup>
              <thead class="dm-files-thead">
                <tr>
                  <th class="dm-files-th dm-files-th--resizable">
                    文件名
                    <div class="dm-files-col-resizer" onMouseDown={makeResizeHandler(setNameColWidth, nameColWidth)} />
                  </th>
                  <th class="dm-files-th dm-files-th--resizable">
                    类型
                    <div class="dm-files-col-resizer" onMouseDown={makeResizeHandler(setTypeColWidth, typeColWidth)} />
                  </th>
                  <th class="dm-files-th dm-files-th--resizable">
                    通道
                    <div class="dm-files-col-resizer" onMouseDown={makeResizeHandler(setChanColWidth, chanColWidth)} />
                  </th>
                </tr>
              </thead>
              <For each={entries()}>
                  {(entry, idx) => (
                    <tbody>
                      <tr
                        class="dm-files-row"
                        classList={{ 'dm-files-row--selected': isSelected(entry.id), 'dm-files-row--expanded': isExpanded(entry.id) }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(entry.id, idx(), e);
                        }}
                      >
                        <td class="dm-files-cell dm-files-cell--name">
                          <button
                            class="dm-tree-expand"
                            classList={{ 'dm-tree-expand--invisible': entry.type !== 'dbc' }}
                            onClick={(e) => { e.stopPropagation(); toggleExpand(entry); }}
                            aria-label={isExpanded(entry.id) ? '折叠' : '展开'}
                          >
                            <Show when={entry.type === 'dbc'} fallback={<span class="dm-tree-expand--spacer" />}>
                              {isExpanded(entry.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </Show>
                          </button>
                          <span class="dm-files-icon">
                            <File size={14} />
                          </span>
                          {entry.name}
                        </td>
                        <td class="dm-files-cell dm-files-cell--type">
                          <span class={`dm-files-badge${entry.type === 'dbc' ? ' dm-files-badge--dbc' : ' dm-files-badge--ldf'}`}>
                            {entry.type.toUpperCase()}
                          </span>
                        </td>
                        <td
                          class="dm-files-cell dm-files-cell--channel"
                        >
                          <div
                            class="dm-channel-trigger"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleChannelDropdown(entry.id, e);
                            }}
                          >
                            <span class="dm-channel-display">
                              {entry.busIds.length > 0
                                ? entry.busIds.map((id) => `CAN ${id}`).join(', ')
                                : '未绑定'}
                            </span>
                            <ChevronDown class="dm-channel-chevron" size={12} />
                          </div>
                        </td>
                      </tr>
                      <Show when={isExpanded(entry.id) && entry.type === 'dbc'}>
                        <tr class="dm-tree-row">
                          <td colspan="3" class="dm-tree-cell">
                            <Show
                              when={dbcDetails()[entry.path]}
                              fallback={<div class="dm-tree-loading">解析中...</div>}
                            >
                              {(detail) => (
                                <div class="dm-tree">
                                  <div class="dm-tree-section">
                                    <div
                                      class="dm-tree-section__header"
                                      onClick={(e) => { e.stopPropagation(); toggleSectionExpand('messages', entry.id); }}
                                    >
                                      <span class="dm-tree-arrow">
                                        {isSectionExpanded(entry.id, 'messages') ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                      </span>
                                      <Layers size={12} class="dm-tree-section__icon" />
                                      <span class="dm-tree-section__label">Messages</span>
                                      <span class="dm-tree-section__count">{detail().messages.length}</span>
                                    </div>
                                    <Show when={isSectionExpanded(entry.id, 'messages')}>
                                      <For each={detail().messages}>
                                      {(msg) => (
                                        <div class="dm-tree-group">
                                          <div
                                            class="dm-tree-msg"
                                            onClick={(e) => { e.stopPropagation(); toggleMsgExpand(msg.canId, entry.id); }}
                                          >
                                            <span class="dm-tree-arrow">
                                              {msg.signalCount > 0
                                                ? (isMsgExpanded(entry.id, msg.canId) ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
                                                : null}
                                            </span>
                                            <span class="dm-tree-msg__name"><Mail size={12} class="dm-tree-msg__icon" /> {msg.name}</span>
                                            <span class="dm-tree-msg__id">(0x{msg.canId.toString(16).toUpperCase()})</span>
                                            <span class="dm-tree-msg__meta">dlc:{msg.dlc} {msg.sender}</span>
                                          </div>
                                          <Show when={isMsgExpanded(entry.id, msg.canId)}>
                                            <div class="dm-tree-signals">
                                              <For each={msg.signals}>
                                                {(sig) => (
                                                  <div class="dm-tree-sig">
                                                    <span class="dm-tree-sig__name"><Activity size={12} class="dm-tree-sig__icon" /> {sig.name}</span>
                                                    <span class="dm-tree-sig__bits">[{sig.startBit}|{sig.bitLength}]</span>
                                                    <span class="dm-tree-sig__order">{sig.byteOrder}</span>
                                                    <Show when={sig.min != null && sig.max != null}>
                                                      <span class="dm-tree-sig__range">{sig.min}..{sig.max}</span>
                                                    </Show>
                                                    <Show when={sig.unit}>
                                                      <span class="dm-tree-sig__unit">{sig.unit}</span>
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
                                  <Show when={detail().nodes.length > 0}>
                                    <div class="dm-tree-section">
                                      <div
                                        class="dm-tree-section__header"
                                        onClick={(e) => { e.stopPropagation(); toggleSectionExpand('nodes', entry.id); }}
                                      >
                                        <span class="dm-tree-arrow">
                                          {isSectionExpanded(entry.id, 'nodes') ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                        </span>
                                        <Layers size={12} class="dm-tree-section__icon" />
                                        <span class="dm-tree-section__label">Network Nodes</span>
                                        <span class="dm-tree-section__count">{detail().nodes.length}</span>
                                      </div>
                                      <Show when={isSectionExpanded(entry.id, 'nodes')}>
                                      <For each={detail().nodes}>
                                        {(node) => (
                                          <div class="dm-tree-group">
                                            <div
                                              class="dm-tree-node"
                                              onClick={(e) => { e.stopPropagation(); toggleNodeExpand(node.name, entry.id); }}
                                            >
                                              <span class="dm-tree-arrow">
                                                {node.messageCount > 0
                                                  ? (isNodeExpanded(entry.id, node.name) ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
                                                  : null}
                                              </span>
                                              <span class="dm-tree-node__name"><Cpu size={12} class="dm-tree-node__icon" /> {node.name}</span>
                                              <span class="dm-tree-node__meta">{node.messageCount} msgs · {node.signalCount} sigs</span>
                                            </div>
                                            <Show when={isNodeExpanded(entry.id, node.name)}>
                                              <div class="dm-tree-node-messages">
                                                <For each={node.messages}>
                                                  {(msg) => (
                                                    <div class="dm-tree-group">
                                                      <div
                                                        class="dm-tree-msg dm-tree-msg--nested"
                                                        onClick={(e) => { e.stopPropagation(); toggleMsgExpand(msg.canId, entry.id); }}
                                                      >
                                                        <span class="dm-tree-arrow">
                                                            {msg.signalCount > 0
                                                              ? (isMsgExpanded(entry.id, msg.canId) ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
                                                              : null}
                                                          </span>
                                                        <span class="dm-tree-msg__name"><Mail size={12} class="dm-tree-msg__icon" /> {msg.name}</span>
                                                        <span class="dm-tree-msg__id">(0x{msg.canId.toString(16).toUpperCase()})</span>
                                                        <span class="dm-tree-msg__meta">dlc:{msg.dlc}</span>
                                                      </div>
                                                      <Show when={isMsgExpanded(entry.id, msg.canId)}>
                                                        <div class="dm-tree-signals">
                                                          <For each={msg.signals}>
                                                            {(sig) => (
                                                              <div class="dm-tree-sig">
                                                                <span class="dm-tree-sig__name"><Activity size={12} class="dm-tree-sig__icon" /> {sig.name}</span>
                                                                <span class="dm-tree-sig__bits">[{sig.startBit}|{sig.bitLength}]</span>
                                                                <span class="dm-tree-sig__order">{sig.byteOrder}</span>
                                                                <Show when={sig.min != null && sig.max != null}>
                                                                  <span class="dm-tree-sig__range">{sig.min}..{sig.max}</span>
                                                                </Show>
                                                                <Show when={sig.unit}>
                                                                  <span class="dm-tree-sig__unit">{sig.unit}</span>
                                                                </Show>
                                                              </div>
                                                            )}
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
                              )}
                            </Show>
                          </td>
                        </tr>
                      </Show>
                    </tbody>
                  )}
                </For>
            </table>
          </div>
          <Show when={channelDropdown()}>
            {(dd) => {
              const entry = entries().find((e) => e.id === dd().entryId);
              if (!entry) return null;
              return (
                <div
                  ref={channelDropRef}
                  class="dm-channel-drop"
                  style={{
                    top: `${dd().rect.top}px`,
                    left: `${dd().rect.left}px`,
                    width: `${dd().rect.width}px`,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <For each={Array.from({ length: 16 }, (_, i) => i)}>
                    {(busId) => (
                      <label class="dm-channel-drop__item">
                        <input
                          type="checkbox"
                          class="dm-channel-drop__check"
                          checked={isChannelChecked(entry.id, busId)}
                          onChange={() => toggleChannel(entry.id, busId)}
                        />
                        <span>CAN {busId}</span>
                      </label>
                    )}
                  </For>
                </div>
              );
            }}
          </Show>
          <Show when={showSidebar() && sidebarEntry()}>
            {(entry) => (
              <div class="dm-sidebar">
                <div class="dm-sidebar__header">
                  <span class="dm-sidebar__title">文件属性</span>
                  <button class="dm-sidebar__close" onClick={handleCloseSidebar} aria-label="关闭属性面板">
                    <X size={12} />
                  </button>
                </div>
                <div class="dm-sidebar__body">
                  <div class="dm-sidebar__icon">
                    <File size={28} strokeWidth={1.2} />
                  </div>
                  <div class="dm-sidebar__name">{entry().name}</div>
                  <div class="dm-sidebar__field">
                    <span class="dm-sidebar__label">类型</span>
                    <span class={`dm-files-badge${entry().type === 'dbc' ? ' dm-files-badge--dbc' : ' dm-files-badge--ldf'}`}>
                      {entry().type.toUpperCase()}
                    </span>
                  </div>
                  <div class="dm-sidebar__field">
                    <span class="dm-sidebar__label">绑定通道</span>
                    <div class="dm-sidebar__channels">
                      <For each={entry().busIds}>
                        {(busId) => (
                          <span class="dm-sidebar__channel">CAN {busId}</span>
                        )}
                      </For>
                    </div>
                  </div>
                  <div class="dm-sidebar__field">
                    <span class="dm-sidebar__label">完整路径</span>
                    <span class="dm-sidebar__path">{entry().path}</span>
                  </div>
                </div>
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  );

  // Shared status bar
  const StatusBar = (
    <div class="dm-statusbar">
      <Show
        when={hasEntries()}
        fallback={<span class="dm-statusbar__text">未加载数据库文件</span>}
      >
        <span class="dm-statusbar__text">
          <strong>{entries().length}</strong>{' 个文件'}
          <Show when={selectedCount() > 0}>
            <span class="dm-statusbar__sep">·</span>
            {'已选中 '}<strong>{selectedCount()}</strong>{' 个'}
          </Show>
        </span>
      </Show>
    </div>
  );

  // Panel mode: inline layout
  if (!isDialog()) {
    return (
      <div class="dm-panel" onKeyDown={handleKeyDown}>
        {Toolbar}
        {Content}
        {StatusBar}
      </div>
    );
  }

  // Dialog mode: overlay + centered modal
  return (
    <div
      class="dm-overlay"
      classList={{
        'dm-overlay--visible': visible(),
        'dm-overlay--closing': closing(),
      }}
      onKeyDown={handleKeyDown}
      onClick={handleOverlayClick}
    >
      <div
        ref={dialogRef}
        class="dm-dialog"
        classList={{
          'dm-dialog--visible': visible(),
          'dm-dialog--closing': closing(),
        }}
      >
        <div class="dm-titlebar">
          <span class="dm-titlebar-text">
            <Database size={14} strokeWidth={2} />
            数据库
          </span>
          <div class="dm-titlebar-actions">
            {HelpButton}
            <button class="dm-titlebar-close" onClick={closeWithAnimation} aria-label="关闭">
              <X size={14} />
            </button>
          </div>
        </div>
        {Toolbar}
        {Content}
        {StatusBar}
      </div>
    </div>
  );
};

export default DatabaseManagerDialog;
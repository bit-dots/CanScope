import { Component, createMemo, createSignal, For, JSX, Show } from 'solid-js';
import { ChevronDown, Cpu, Database, FileText, FolderOpen, PanelsTopLeft, Radio, Search, X } from 'lucide-solid';
import type { DbcBinding, DbcMessageInfo, DbcTreeInfo } from '../types';
import type { PanelWindowState } from './windowing/window-types';
import './ResourceManager.css';

export interface ResourceManagerProps {
  dbcTree: DbcTreeInfo | null;
  projectName: string;
  dbcBindings: DbcBinding[];
  canLogPath: string | null;
  visiblePanels: PanelWindowState[];
  minimizedPanels: PanelWindowState[];
  onSelectMessage: (canId: number | null) => void;
  onActivatePanel: (id: string) => void;
}

type ResourceView = 'project' | 'network';

const ResourceManager: Component<ResourceManagerProps> = (props) => {
  const [activeView, setActiveView] = createSignal<ResourceView>('project');
  const [search, setSearch] = createSignal('');
  const [expanded, setExpanded] = createSignal<Set<string>>(
    new Set(['files', 'workspace', 'dbc-root'])
  );

  const query = createMemo(() => search().trim().toLocaleLowerCase());
  const allPanels = createMemo(() => [
    ...props.visiblePanels,
    ...props.minimizedPanels,
  ].filter((panel) => panel.id !== 'resource-manager'));

  const toggle = (id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isExpanded = (id: string) => expanded().has(id) || query().length > 0;
  const basename = (path: string) => path.split(/[/\\]/).pop() || path;
  const matches = (...values: (string | number | undefined)[]) => {
    const term = query();
    return !term || values.some((value) => String(value ?? '').toLocaleLowerCase().includes(term));
  };

  const filteredBindings = createMemo(() =>
    props.dbcBindings.filter((binding) =>
      matches(basename(binding.path), binding.path, `CAN ${binding.busId + 1}`)
    )
  );
  const filteredPanels = createMemo(() =>
    allPanels().filter((panel) => matches(panel.title))
  );
  const filteredMessages = createMemo(() => {
    const messages = props.dbcTree?.messages ?? [];
    return messages.filter((message) =>
      matches(
        message.name,
        message.sender || 'Unknown',
        `CAN ${message.busId + 1}`,
        message.canId.toString(16),
        `0x${message.canId.toString(16)}`,
        ...message.signals.flatMap((signal) => [signal.name, signal.unit])
      )
    );
  });

  const messagesByBus = createMemo(() => {
    const buses = new Map<number, DbcMessageInfo[]>();
    for (const message of filteredMessages()) {
      const messages = buses.get(message.busId) ?? [];
      messages.push(message);
      buses.set(message.busId, messages);
    }

    return [...buses.entries()]
      .sort(([a], [b]) => a - b)
      .map(([busId, messages]) => {
        const senders = new Map<string, DbcMessageInfo[]>();
        for (const message of messages) {
          const sender = message.sender || 'Unknown';
          const senderMessages = senders.get(sender) ?? [];
          senderMessages.push(message);
          senders.set(sender, senderMessages);
        }
        return {
          busId,
          senders: [...senders.entries()].sort(([a], [b]) => a.localeCompare(b)),
        };
      });
  });

  const TreeRow: Component<{
    indent: number;
    icon?: JSX.Element;
    label: string;
    meta?: string;
    badge?: string;
    nodeId?: string;
    onClick?: () => void;
    dimmed?: boolean;
  }> = (row) => {
    const parent = () => Boolean(row.nodeId);
    const open = () => row.nodeId ? isExpanded(row.nodeId) : false;
    const activate = () => {
      if (row.nodeId) toggle(row.nodeId);
      else row.onClick?.();
    };

    return (
      <div
        class="rm-row"
        classList={{
          'rm-row--parent': parent(),
          'rm-row--dimmed': row.dimmed,
          'rm-row--interactive': parent() || Boolean(row.onClick),
        }}
        style={{ 'padding-left': `${8 + row.indent * 14}px` }}
        role="treeitem"
        aria-expanded={parent() ? open() : undefined}
        aria-disabled={row.dimmed || undefined}
        tabIndex={row.dimmed || (!parent() && !row.onClick) ? undefined : 0}
        onClick={() => { if (!row.dimmed) activate(); }}
        onKeyDown={(event) => {
          if (row.dimmed) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate();
          } else if (event.key === 'ArrowRight' && row.nodeId && !open()) {
            event.preventDefault();
            toggle(row.nodeId);
          } else if (event.key === 'ArrowLeft' && row.nodeId && open()) {
            event.preventDefault();
            toggle(row.nodeId);
          }
        }}
      >
        <span class="rm-arrow-wrapper">
          <Show when={parent()}>
            <ChevronDown class="rm-arrow" classList={{ 'rm-arrow--closed': !open() }} size={14} />
          </Show>
        </span>
        <Show when={row.icon}>{row.icon}</Show>
        <span class="rm-row__label" title={row.label}>{row.label}</span>
        <Show when={row.meta}>
          <span class="rm-row__meta" title={row.meta}>{row.meta}</span>
        </Show>
        <Show when={row.badge}>
          <span class="rm-row__badge">{row.badge}</span>
        </Show>
      </div>
    );
  };

  const ProjectView = () => (
    <div class="rm-tree" role="tree" aria-label="项目资源">
      <div class="rm-group-label">工程文件</div>
      <div class="rm-section">
        <TreeRow
          indent={0}
          icon={<FolderOpen class="rm-icon" size={15} />}
          label="数据库"
          badge={String(filteredBindings().length)}
          nodeId="files"
        />
        <Show when={isExpanded('files')}>
          <Show
            when={filteredBindings().length > 0}
            fallback={<div class="rm-tree-empty" role="treeitem">没有匹配的 DBC 文件</div>}
          >
            <For each={filteredBindings()}>
              {(binding) => (
                <TreeRow
                  indent={1}
                  icon={<Database class="rm-icon" size={14} />}
                  label={basename(binding.path)}
                  meta={`CAN ${binding.busId + 1}`}
                  badge="DBC"
                />
              )}
            </For>
          </Show>
        </Show>
      </div>
      <div class="rm-section">
        <TreeRow
          indent={0}
          icon={<FileText class="rm-icon" size={15} />}
          label="CAN 日志"
          badge={props.canLogPath ? '1' : '0'}
          nodeId="logs"
        />
        <Show when={isExpanded('logs')}>
          <Show
            when={props.canLogPath && matches(basename(props.canLogPath), props.canLogPath)}
            fallback={
              <div class="rm-tree-empty" role="treeitem">
                {props.canLogPath ? '没有匹配的 CAN 日志' : '工程中尚未加载 CAN 日志'}
              </div>
            }
          >
            <TreeRow
              indent={1}
              icon={<FileText class="rm-icon" size={14} />}
              label={basename(props.canLogPath ?? '')}
              meta={props.canLogPath ?? ''}
            />
          </Show>
        </Show>
      </div>

      <div class="rm-group-label rm-group-label--separated">工作区</div>
      <div class="rm-section">
        <TreeRow
          indent={0}
          icon={<PanelsTopLeft class="rm-icon" size={15} />}
          label="已打开面板"
          badge={String(filteredPanels().length)}
          nodeId="workspace"
        />
        <Show when={isExpanded('workspace')}>
          <Show
            when={filteredPanels().length > 0}
            fallback={<div class="rm-tree-empty" role="treeitem">没有匹配的面板</div>}
          >
            <For each={filteredPanels()}>
              {(panel) => (
                <TreeRow
                  indent={1}
                  icon={<PanelsTopLeft class="rm-icon" size={14} />}
                  label={panel.title}
                  dimmed={panel.window.minimized}
                  onClick={() => props.onActivatePanel(panel.id)}
                />
              )}
            </For>
          </Show>
        </Show>
      </div>
    </div>
  );

  const NetworkView = () => (
    <div class="rm-tree" role="tree" aria-label="CAN 网络结构">
      <Show
        when={props.dbcTree}
        fallback={
          <div class="rm-empty">
            <Database size={22} />
            <span class="rm-empty__title">尚未加载 DBC</span>
            <span class="rm-empty__desc">加载数据库文件后，可在此浏览 ECU、报文和信号。</span>
          </div>
        }
      >
        <div class="rm-section">
          <TreeRow
            indent={0}
            icon={<Database class="rm-icon" size={15} />}
            label="CAN 网络"
            badge={`${filteredMessages().length} 条报文`}
            nodeId="dbc-root"
          />
          <Show when={isExpanded('dbc-root')}>
            <Show
              when={messagesByBus().length > 0}
              fallback={
                <div class="rm-tree-empty" role="treeitem">
                  {query()
                    ? '没有匹配的网络资源'
                    : '已加载的 DBC 中没有可显示的报文'}
                </div>
              }
            >
              <For each={messagesByBus()}>
                {(bus) => {
                  const busId = `bus-${bus.busId}`;
                  const busMessages = () => bus.senders.flatMap(([, messages]) => messages);
                  return (
                    <div class="rm-section">
                      <TreeRow
                        indent={1}
                        icon={<Radio class="rm-icon" size={14} />}
                        label={`CAN ${bus.busId + 1}`}
                        badge={`${busMessages().length}`}
                        nodeId={busId}
                      />
                      <Show when={isExpanded(busId)}>
                        <For each={bus.senders}>
                          {([sender, messages]) => {
                            const senderId = `${busId}-ecu-${sender}`;
                            return (
                              <div class="rm-section">
                                <TreeRow
                                  indent={2}
                                  icon={<Cpu class="rm-icon" size={14} />}
                                  label={sender}
                                  badge={String(messages.length)}
                                  nodeId={senderId}
                                />
                                <Show when={isExpanded(senderId)}>
                                  <For each={messages}>
                                    {(message) => {
                                      const messageId = `${senderId}-msg-${message.canId}`;
                                      const messageMatches = () =>
                                        !query() || matches(
                                          message.name,
                                          sender,
                                          `CAN ${bus.busId + 1}`,
                                          message.canId.toString(16),
                                          `0x${message.canId.toString(16)}`
                                        );
                                      const signals = () => message.signals.filter((signal) =>
                                        messageMatches() || matches(signal.name, signal.unit)
                                      );
                                      return (
                                        <div class="rm-section">
                                          <TreeRow
                                            indent={3}
                                            icon={<Radio class="rm-icon rm-icon--message" size={13} />}
                                            label={message.name}
                                            meta={`0x${message.canId.toString(16).toUpperCase()}`}
                                            badge={`${message.signalCount} 信号`}
                                            nodeId={messageId}
                                          />
                                          <Show when={isExpanded(messageId)}>
                                            <Show
                                              when={signals().length > 0}
                                              fallback={<div class="rm-tree-empty" role="treeitem">此报文没有匹配的信号</div>}
                                            >
                                              <For each={signals()}>
                                                {(signal) => (
                                                  <TreeRow
                                                    indent={4}
                                                    icon={<span class="rm-signal-mark" aria-hidden="true" />}
                                                    label={signal.name}
                                                    meta={signal.unit || `${signal.startBit}:${signal.bitLength}`}
                                                    onClick={() => props.onSelectMessage(message.canId)}
                                                  />
                                                )}
                                              </For>
                                            </Show>
                                          </Show>
                                        </div>
                                      );
                                    }}
                                  </For>
                                </Show>
                              </div>
                            );
                          }}
                        </For>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  );

  return (
    <div class="resource-manager">
      <header class="rm-header">
        <div class="rm-project-heading">
          <FolderOpen size={16} class="rm-project-icon" />
          <span class="rm-project-name" title={props.projectName}>{props.projectName}</span>
        </div>
        <div class="rm-tabs" role="tablist" aria-label="资源视图">
          <button
            class="rm-tab"
            classList={{ 'rm-tab--active': activeView() === 'project' }}
            type="button"
            role="tab"
            id="rm-tab-project"
            aria-controls="rm-tabpanel"
            aria-selected={activeView() === 'project'}
            onClick={() => { setActiveView('project'); setSearch(''); }}
          >
            项目资源
          </button>
          <button
            class="rm-tab"
            classList={{ 'rm-tab--active': activeView() === 'network' }}
            type="button"
            role="tab"
            id="rm-tab-network"
            aria-controls="rm-tabpanel"
            aria-selected={activeView() === 'network'}
            onClick={() => { setActiveView('network'); setSearch(''); }}
          >
            网络
          </button>
        </div>
        <label class="rm-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={search()}
            placeholder={activeView() === 'project' ? '搜索工程资源' : '搜索 ECU、报文或信号'}
            aria-label={activeView() === 'project' ? '搜索工程资源' : '搜索网络资源'}
            onInput={(event) => setSearch(event.currentTarget.value)}
          />
          <Show when={search()}>
            <button type="button" class="rm-search-clear" aria-label="清除搜索" onClick={() => setSearch('')}>
              <X size={13} />
            </button>
          </Show>
        </label>
      </header>
      <div
        class="rm-content"
        id="rm-tabpanel"
        role="tabpanel"
        aria-labelledby={activeView() === 'project' ? 'rm-tab-project' : 'rm-tab-network'}
      >
        <Show when={activeView() === 'project'} fallback={<NetworkView />}>
          <ProjectView />
        </Show>
      </div>
    </div>
  );
};

export default ResourceManager;

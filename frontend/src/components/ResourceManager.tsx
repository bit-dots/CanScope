import { Component, createSignal, For, Show, createMemo, JSX } from 'solid-js';
import type { DbcTreeInfo, DbcMessageInfo } from '../types';
import type { PanelWindowState } from './windowing/window-types';
import './ResourceManager.css';

/* ============================================
   Props
   ============================================ */
export interface ResourceManagerProps {
  dbcTree: DbcTreeInfo | null;
  projectName: string;
  dbcPaths: string[];
  canLogPath: string | null;
  visiblePanels: PanelWindowState[];
  minimizedPanels: PanelWindowState[];
  onSelectMessage: (canId: number | null) => void;
  onActivatePanel: (id: string) => void;
}

/* ============================================
   ResourceManager
   ============================================ */
const ResourceManager: Component<ResourceManagerProps> = (props) => {
  const [activeTab, setActiveTab] = createSignal<'project' | 'signal'>('project');
  const [expanded, setExpanded] = createSignal<Set<string>>(
    new Set(['channels', 'databases', 'ecus', 'logs', 'windows', 'dbc-root'])
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isExpanded = (id: string) => expanded().has(id);

  /* ---- Derived data ---- */
  const ecus = createMemo(() => {
    const tree = props.dbcTree;
    if (!tree) return [];
    const senders = new Set<string>();
    for (const msg of tree.messages) {
      if (msg.sender) senders.add(msg.sender);
    }
    return [...senders].sort();
  });

  const messagesBySender = createMemo(() => {
    const tree = props.dbcTree;
    const map = new Map<string, DbcMessageInfo[]>();
    if (!tree) return map;
    for (const msg of tree.messages) {
      const sender = msg.sender || 'Unknown';
      if (!map.has(sender)) map.set(sender, []);
      map.get(sender)!.push(msg);
    }
    return map;
  });

  const allPanels = createMemo(() => [
    ...props.visiblePanels,
    ...props.minimizedPanels,
  ]);

  /* ---- SVG Icons ---- */
  const ArrowIcon: Component<{ open: boolean }> = (p) => (
    <svg
      class="rm-arrow"
      classList={{ 'rm-arrow--open': p.open }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );

  const FolderIcon = () => (
    <svg class="rm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );

  const ChannelIcon = () => (
    <svg class="rm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="8" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
    </svg>
  );

  const FileIcon = () => (
    <svg class="rm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );

  const EcuIcon = () => (
    <svg class="rm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <polyline points="8 12 11 15 16 9" />
    </svg>
  );

  const WindowIcon = () => (
    <svg class="rm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );

  const MessageIcon = () => (
    <svg class="rm-icon rm-icon--msg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );

  /* ---- Tree Row Helper ---- */
  const TreeRow: Component<{
    indent: number;
    icon?: JSX.Element;
    label: string;
    meta?: string;
    badge?: string;
    hasChildren?: boolean;
    expanded?: boolean;
    onClick?: () => void;
    onToggle?: () => void;
    dimmed?: boolean;
  }> = (p) => (
    <div
      class="rm-row"
      classList={{ 'rm-row--parent': p.hasChildren, 'rm-row--dimmed': p.dimmed }}
      style={{ 'padding-left': `${8 + p.indent * 14}px` }}
      onClick={p.onClick ?? p.onToggle}
    >
      <Show when={p.hasChildren} fallback={<span class="rm-arrow-spacer" />}>
        <span class="rm-arrow-wrapper" onClick={(e) => { e.stopPropagation(); p.onToggle?.(); }}>
          <ArrowIcon open={p.expanded ?? false} />
        </span>
      </Show>
      <Show when={p.icon}>{p.icon}</Show>
      <span class="rm-row__label">{p.label}</span>
      <Show when={p.meta}>
        <span class="rm-row__meta">{p.meta}</span>
      </Show>
      <Show when={p.badge}>
        <span class="rm-row__badge">{p.badge}</span>
      </Show>
    </div>
  );

  /* ---- Section Helper ---- */
  const Section: Component<{
    id: string;
    icon: JSX.Element;
    label: string;
    badge?: string;
    children: JSX.Element;
  }> = (p) => {
    const open = isExpanded(p.id);
    return (
      <div class="rm-section">
        <TreeRow
          indent={0}
          icon={p.icon}
          label={p.label}
          badge={p.badge}
          hasChildren
          expanded={open}
          onToggle={() => toggle(p.id)}
        />
        <Show when={open}>{p.children}</Show>
      </div>
    );
  };

  /* ==========================================
     项目 Tab
     ========================================== */
  const ProjectTab = () => (
    <div class="rm-tree">
      {/* 通道配置 */}
      <Section id="channels" icon={<ChannelIcon />} label="通道配置" badge="0">
        <TreeRow indent={1} label="暂无通道" dimmed onClick={() => {}} />
      </Section>

      {/* 数据库文件 */}
      <Section
        id="databases"
        icon={<FolderIcon />}
        label="数据库文件"
        badge={String(props.dbcPaths.length)}
      >
        <Show
          when={props.dbcPaths.length > 0}
          fallback={<TreeRow indent={1} label="暂无数据库文件" dimmed onClick={() => {}} />}
        >
          <For each={props.dbcPaths}>
            {(path) => {
              const name = path.split(/[/\\]/).pop() ?? path;
              return (
                <TreeRow indent={1} icon={<FileIcon />} label={name} meta={path} onClick={() => {}} />
              );
            }}
          </For>
        </Show>
      </Section>

      {/* ECU 节点 */}
      <Section id="ecus" icon={<EcuIcon />} label="ECU 节点" badge={String(ecus().length)}>
        <Show
          when={ecus().length > 0}
          fallback={<TreeRow indent={1} label="已加载 DBC 后显示" dimmed onClick={() => {}} />}
        >
          <For each={ecus()}>
            {(ecu) => <TreeRow indent={1} icon={<EcuIcon />} label={ecu} onClick={() => {}} />}
          </For>
        </Show>
      </Section>

      {/* CAN 日志 */}
      <Section id="logs" icon={<FileIcon />} label="CAN 日志" badge={props.canLogPath ? '1' : '0'}>
        <Show
          when={props.canLogPath}
          fallback={<TreeRow indent={1} label="暂无日志文件" dimmed onClick={() => {}} />}
        >
          {(path) => {
            const name = path().split(/[/\\]/).pop() ?? path();
            return (
              <TreeRow indent={1} icon={<FileIcon />} label={name} meta={path()} onClick={() => {}} />
            );
          }}
        </Show>
      </Section>

      {/* 已打开窗口 */}
      <Section id="windows" icon={<WindowIcon />} label="已打开窗口" badge={String(allPanels().length)}>
        <Show
          when={allPanels().length > 0}
          fallback={<TreeRow indent={1} label="无已打开窗口" dimmed onClick={() => {}} />}
        >
          <For each={allPanels()}>
            {(panel) => (
              <TreeRow
                indent={1}
                icon={<WindowIcon />}
                label={panel.title}
                dimmed={panel.window.minimized}
                onClick={() => props.onActivatePanel(panel.id)}
              />
            )}
          </For>
        </Show>
      </Section>
    </div>
  );

  /* ==========================================
     信号 Tab
     ========================================== */
  const SignalTab = () => {
    const tree = props.dbcTree;
    const bySender = messagesBySender();

    return (
      <div class="rm-tree">
        <Show
          when={tree}
          fallback={
            <div class="rm-empty">
              <span class="rm-empty__title">未加载 DBC 文件</span>
              <span class="rm-empty__desc">请在项目页签中导入 DBC</span>
            </div>
          }
        >
          <div class="rm-section">
            <TreeRow
              indent={0}
              icon={<FolderIcon />}
              label="DBC 数据库"
              badge={`${tree!.messageCount} 条报文`}
              hasChildren
              expanded={isExpanded('dbc-root')}
              onToggle={() => toggle('dbc-root')}
            />
            <Show when={isExpanded('dbc-root')}>
              <For each={[...bySender.entries()]}>
                {([sender, msgs]) => {
                  const senderId = `sender-${sender}`;
                  const open = isExpanded(senderId);
                  return (
                    <div class="rm-section">
                      <TreeRow
                        indent={1}
                        icon={<EcuIcon />}
                        label={sender}
                        badge={`${msgs.length} 条`}
                        hasChildren
                        expanded={open}
                        onToggle={() => toggle(senderId)}
                      />
                      <Show when={open}>
                        <For each={msgs}>
                          {(msg) => (
                            <TreeRow
                              indent={2}
                              icon={<MessageIcon />}
                              label={msg.name}
                              meta={`0x${msg.canId.toString(16).toUpperCase()}`}
                              badge={`${msg.dlc}B`}
                              onClick={() => props.onSelectMessage(msg.canId)}
                            />
                          )}
                        </For>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </Show>
          </div>
        </Show>
      </div>
    );
  };

  /* ==========================================
     Render
     ========================================== */
  return (
    <div class="resource-manager">
      <div class="rm-tabs">
        <button
          class="rm-tab"
          classList={{ 'rm-tab--active': activeTab() === 'project' }}
          onClick={() => setActiveTab('project')}
        >
          项目
        </button>
        <button
          class="rm-tab"
          classList={{ 'rm-tab--active': activeTab() === 'signal' }}
          onClick={() => setActiveTab('signal')}
        >
          信号
        </button>
      </div>
      <div class="rm-content">
        {activeTab() === 'project' && <ProjectTab />}
        {activeTab() === 'signal' && <SignalTab />}
      </div>
    </div>
  );
};

export default ResourceManager;
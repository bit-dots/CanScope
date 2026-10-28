import { Component, createEffect, createSignal, For } from 'solid-js';
import ContextMenu, { type ContextMenuItem } from '../ContextMenu';
import MeasurementSettingsPanel from '../MeasurementSettingsPanel';
import type { MeasurementSettings } from '../../measurementSettings';
import './Ribbon.css';

interface RecentProjectInfo {
  name: string;
  path: string;
  openedAt: string;
}

interface BackstageMenuItem {
  id: string;
  label: string;
  danger?: boolean;
}

const MENU_ITEMS: BackstageMenuItem[] = [
  { id: 'new', label: '新建' },
  { id: 'open', label: '打开' },
  { id: 'save', label: '保存' },
  { id: 'saveas', label: '另存为' },
  { id: 'options', label: '选项' },
  { id: 'close', label: '关闭工程', danger: true },
];

export interface BackstageProps {
  visible: boolean;
  onClose: () => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  onCloseProject: () => void;
  onOpenRecent: (path: string) => void;
  projectLoaded: boolean;
  measurementSettings: MeasurementSettings;
  cachedFrameCount: number;
  estimatedCacheBytes: number;
  onMeasurementSettingsChange: (settings: MeasurementSettings) => void;
}

const Backstage: Component<BackstageProps> = (props) => {
  const [activeItem, setActiveItem] = createSignal('new');
  const [recentProjects, setRecentProjects] = createSignal<RecentProjectInfo[]>([]);
  const [menuError, setMenuError] = createSignal<string | null>(null);

  const refreshRecentProjects = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const list: RecentProjectInfo[] = await invoke('get_recent_projects');
      setRecentProjects(list);
      setMenuError(null);
    } catch (e) {
      setMenuError(`无法读取最近工程：${String(e)}`);
    }
  };

  createEffect(() => {
    if (props.visible) void refreshRecentProjects();
  });

  const handleItemClick = (item: BackstageMenuItem) => {
    setActiveItem(item.id);
  };

  const formatTime = (iso: string): string => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      const mins = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (mins < 1) return '刚刚';
      if (mins < 60) return `${mins} 分钟前`;
      if (hours < 24) return `${hours} 小时前`;
      if (days < 7) return `${days} 天前`;

      return d.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const [contextTarget, setContextTarget] = createSignal<{ x: number; y: number; project: RecentProjectInfo } | null>(null);

  const closeContextMenu = () => setContextTarget(null);

  const handleClickRecent = (p: RecentProjectInfo) => {
    props.onOpenRecent(p.path);
    props.onClose();
  };

  const handleRemoveRecent = async (path: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('remove_recent_project', { path });
      setRecentProjects((prev) => prev.filter((r) => r.path !== path));
      setMenuError(null);
    } catch (e) {
      setMenuError(`无法从最近列表移除工程：${String(e)}`);
    }
    closeContextMenu();
  };

  const handleClearRecent = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('clear_recent_projects');
      setRecentProjects([]);
      setMenuError(null);
    } catch (e) {
      setMenuError(`无法清空最近工程列表：${String(e)}`);
    }
    closeContextMenu();
  };

  const buildContextItems = (): ContextMenuItem[] => [
    { id: 'open', label: '打开工程', action: () => handleClickRecent(contextTarget()!.project) },
    { id: 'remove', label: '从列表中移除', action: () => handleRemoveRecent(contextTarget()!.project.path) },
    { id: 'sep', label: '', separator: true },
    { id: 'clear', label: '清空列表', action: handleClearRecent },
  ];

  return (
    <div class="backstage" classList={{ 'backstage--visible': props.visible }}>
      <div class="backstage__header">
        <button class="backstage__back" onClick={props.onClose} type="button">
          &#8592; 返回
        </button>
        <span class="backstage__title">CanScope</span>
      </div>
      <div class="backstage__body">
        <nav class="backstage__nav">
          <For each={MENU_ITEMS}>
            {(item) => (
              <button
                class="backstage__nav-item"
                classList={{
                  'backstage__nav-item--active': activeItem() === item.id,
                  'backstage__nav-item--danger': item.danger,
                }}
                onClick={() => handleItemClick(item)}
                type="button"
              >
                {item.label}
              </button>
            )}
          </For>
        </nav>
        <div class="backstage__content">
          {menuError() && <p class="backstage__error" role="alert">{menuError()}</p>}
          {/* 新建 */}
          <div style={{ display: activeItem() === 'new' ? 'block' : 'none' }}>
            <h2 class="backstage__heading">新建工程</h2>
            <p class="backstage__desc">创建一个新的 CAN 工作工程。</p>
            <button class="backstage__action-btn" onClick={() => { props.onNewProject(); props.onClose(); }} type="button">
              新建工程
            </button>
          </div>

          {/* 打开 */}
          <div style={{ display: activeItem() === 'open' ? 'block' : 'none' }}>
            <h2 class="backstage__heading">打开工程</h2>
            <p class="backstage__desc">选择已有工程文件，或从最近列表中打开</p>
            <div style={{ 'margin-bottom': '20px' }}>
              <button class="backstage__action-btn" onClick={() => { props.onOpenProject(); props.onClose(); }} type="button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                浏览本地文件
              </button>
            </div>
            {recentProjects().length > 0 && (
              <>
                <p class="backstage__desc" style={{ 'margin-bottom': '12px' }}>最近工程</p>
                <div class="backstage__recent-list">
                  <For each={recentProjects()}>
                    {(p) => (
                      <div
                        class="backstage__recent-item"
                        onClick={() => handleClickRecent(p)}
                        onContextMenu={(e) => { e.preventDefault(); setContextTarget({ x: e.clientX, y: e.clientY, project: p }); }}
                      >
                        <span class="backstage__recent-name">{p.name}</span>
                        <span class="backstage__recent-time">{formatTime(p.openedAt)}</span>
                        <span class="backstage__recent-path" title={p.path}>{p.path}</span>
                      </div>
                    )}
                  </For>
                </div>
              </>
            )}
          </div>

          {/* 保存 */}
          <div style={{ display: activeItem() === 'save' ? 'block' : 'none' }}>
            <h2 class="backstage__heading">保存工程</h2>
            <p class="backstage__desc">将当前工程保存到文件。快捷键：Ctrl+S</p>
            {props.projectLoaded ? (
              <button class="backstage__action-btn" onClick={() => { props.onSaveProject(); props.onClose(); }} type="button">
                保存
              </button>
            ) : (
              <p class="backstage__desc" style={{ color: 'var(--text-secondary)' }}>当前未打开工程</p>
            )}
          </div>

          {/* 另存为 */}
          <div style={{ display: activeItem() === 'saveas' ? 'block' : 'none' }}>
            <h2 class="backstage__heading">另存为</h2>
            <p class="backstage__desc">将当前工程保存为新文件</p>
            {props.projectLoaded ? (
              <button class="backstage__action-btn" onClick={() => { props.onSaveProjectAs(); props.onClose(); }} type="button">
                另存为
              </button>
            ) : (
              <p class="backstage__desc" style={{ color: 'var(--text-secondary)' }}>当前未打开工程</p>
            )}
          </div>

          {/* 选项 */}
          <div style={{ display: activeItem() === 'options' ? 'block' : 'none' }}>
            <h2 class="backstage__heading">选项</h2>
            <MeasurementSettingsPanel
              settings={props.measurementSettings}
              cachedFrameCount={props.cachedFrameCount}
              estimatedCacheBytes={props.estimatedCacheBytes}
              onChange={props.onMeasurementSettingsChange}
            />
          </div>

          {/* 关闭工程 */}
          <div style={{ display: activeItem() === 'close' ? 'block' : 'none' }}>
            <h2 class="backstage__heading">关闭工程</h2>
            <p class="backstage__desc">关闭当前工程并返回欢迎界面。</p>
            {props.projectLoaded ? (
              <button class="backstage__action-btn backstage__action-btn--danger" onClick={() => { props.onCloseProject(); props.onClose(); }} type="button">
                关闭工程
              </button>
            ) : (
              <p class="backstage__desc" style={{ color: 'var(--text-secondary)' }}>当前未打开工程</p>
            )}
          </div>
        </div>
      </div>
      {contextTarget() !== null && (
        <ContextMenu x={contextTarget()!.x} y={contextTarget()!.y} items={buildContextItems()} onClose={closeContextMenu} />
      )}
    </div>
  );
};

export default Backstage;
import { Component, createSignal, For, JSX, onMount } from 'solid-js';
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
  { id: 'import', label: '导入' },
  { id: 'export', label: '导出' },
  { id: 'options', label: '选项' },
  { id: 'exit', label: '退出', danger: true },
];

const PROJECT_TEMPLATES = [
  { id: 'blank', name: '空白工程', desc: '创建一个空的工程文件，手动导入数据' },
  { id: 'can', name: 'CAN 分析工程', desc: '预设 CAN 总线分析视图，适用于 DBC 回放' },
  { id: 'logging', name: '数据记录工程', desc: '预设记录视图，适用于实时采集场景' },
];

const IMPORT_FORMATS = [
  { id: 'asc', name: 'ASC', desc: 'Vector ASCII 日志' },
  { id: 'csv', name: 'CSV', desc: '逗号分隔值' },
  { id: 'blf', name: 'BLF', desc: 'Binary Logging Format' },
  { id: 'dbc', name: 'DBC', desc: 'CAN 数据库文件' },
];

const EXPORT_FORMATS = [
  { id: 'asc', name: 'ASC', desc: 'Vector ASCII 日志' },
  { id: 'csv', name: 'CSV', desc: '逗号分隔值' },
  { id: 'blf', name: 'BLF', desc: 'Binary Logging Format' },
];

const OPTIONS_CATEGORIES = [
  { id: 'general', name: '通用', desc: '语言、数据目录、自动保存' },
  { id: 'theme', name: '主题', desc: '深色 / 浅色模式' },
  { id: 'playback', name: '回放', desc: '默认速度、循环模式' },
];

export interface BackstageProps {
  visible: boolean;
  onClose: () => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  onCloseProject: () => void;
  projectLoaded: boolean;
  children?: JSX.Element;
}

const Backstage: Component<BackstageProps> = (props) => {
  const [activeItem, setActiveItem] = createSignal('new');
  const [recentProjects, setRecentProjects] = createSignal<RecentProjectInfo[]>([]);

  onMount(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const list: RecentProjectInfo[] = await invoke('get_recent_projects');
      setRecentProjects(list);
    } catch {
      // Backend may not be available
    }
  });

  const handleItemClick = (item: BackstageMenuItem) => {
    setActiveItem(item.id);

    switch (item.id) {
      case 'new':
        props.onNewProject();
        props.onClose();
        break;
      case 'open':
        props.onOpenProject();
        props.onClose();
        break;
      case 'save':
        if (props.projectLoaded) props.onSaveProject();
        break;
      case 'saveas':
        if (props.projectLoaded) props.onSaveProjectAs();
        break;
      case 'exit':
        props.onCloseProject();
        props.onClose();
        break;
      default:
        break;
    }
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
          {/* 新建 */}
          <div style={{ display: activeItem() === 'new' ? 'block' : 'none' }}>
            <h2 class="backstage__heading">新建工程</h2>
            <p class="backstage__desc">选择工程模板开始</p>
            <div class="backstage__card-list">
              <For each={PROJECT_TEMPLATES}>
                {(tmpl) => (
                  <div class="backstage__card" onClick={() => { props.onNewProject(); props.onClose(); }}>
                    <div class="backstage__card-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        {tmpl.id === 'blank'
                          ? <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>
                          : tmpl.id === 'can'
                            ? <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>
                            : <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></>
                        }
                      </svg>
                    </div>
                    <div class="backstage__card-title">{tmpl.name}</div>
                    <div class="backstage__card-desc">{tmpl.desc}</div>
                  </div>
                )}
              </For>
            </div>
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
                      <div class="backstage__recent-item">
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
              <button class="backstage__action-btn" onClick={props.onSaveProject} type="button">
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
              <button class="backstage__action-btn" onClick={props.onSaveProjectAs} type="button">
                另存为
              </button>
            ) : (
              <p class="backstage__desc" style={{ color: 'var(--text-secondary)' }}>当前未打开工程</p>
            )}
          </div>

          {/* 导入 */}
          <div style={{ display: activeItem() === 'import' ? 'block' : 'none' }}>
            <h2 class="backstage__heading">导入文件</h2>
            <p class="backstage__desc">支持的导入格式</p>
            <div class="backstage__card-list">
              <For each={IMPORT_FORMATS}>
                {(fmt) => (
                  <div class="backstage__card backstage__card--small" onClick={() => props.onOpenProject()}>
                    <div class="backstage__card-title">{fmt.name}</div>
                    <div class="backstage__card-desc">{fmt.desc}</div>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* 导出 */}
          <div style={{ display: activeItem() === 'export' ? 'block' : 'none' }}>
            <h2 class="backstage__heading">导出文件</h2>
            <p class="backstage__desc">支持的导出格式</p>
            <div class="backstage__card-list">
              <For each={EXPORT_FORMATS}>
                {(fmt) => (
                  <div class="backstage__card backstage__card--small">
                    <div class="backstage__card-title">{fmt.name}</div>
                    <div class="backstage__card-desc">{fmt.desc}</div>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* 选项 */}
          <div style={{ display: activeItem() === 'options' ? 'block' : 'none' }}>
            <h2 class="backstage__heading">选项</h2>
            <p class="backstage__desc">应用设置</p>
            <div class="backstage__card-list">
              <For each={OPTIONS_CATEGORIES}>
                {(cat) => (
                  <div class="backstage__card backstage__card--small">
                    <div class="backstage__card-title">{cat.name}</div>
                    <div class="backstage__card-desc">{cat.desc}</div>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* 退出 */}
          <div style={{ display: activeItem() === 'exit' ? 'block' : 'none' }}>
            <h2 class="backstage__heading">退出</h2>
            <p class="backstage__desc">关闭当前工程并返回欢迎界面</p>
            {props.projectLoaded ? (
              <button class="backstage__action-btn backstage__action-btn--danger" onClick={() => { props.onCloseProject(); props.onClose(); }} type="button">
                退出工程
              </button>
            ) : (
              <p class="backstage__desc" style={{ color: 'var(--text-secondary)' }}>当前未打开工程</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Backstage;
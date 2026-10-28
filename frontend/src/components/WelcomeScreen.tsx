import { Component, createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { ArrowUpRight, Clock3, FolderOpen, Plus, Settings, X } from 'lucide-solid';
import type { RecentProjectInfo } from '../types';
import type { MeasurementSettings } from '../measurementSettings';
import MeasurementSettingsPanel from './MeasurementSettingsPanel';

interface WelcomeScreenProps {
  onNewProject: () => void;
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onRemoveRecent: (path: string) => void;
  measurementSettings: MeasurementSettings;
  onMeasurementSettingsChange: (settings: MeasurementSettings) => void;
}

const WelcomeScreen: Component<WelcomeScreenProps> = (props) => {
  const [recentProjects, setRecentProjects] = createSignal<RecentProjectInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  createEffect(() => {
    if (!settingsOpen()) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));
  });

  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const modKey = isMac ? '⌘' : 'Ctrl';

  onMount(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const list: RecentProjectInfo[] = await invoke('get_recent_projects');
      setRecentProjects(list);
    } catch (e) {
      console.error('Failed to load recent projects:', e);
    }
  });

  const handleOpenRecent = (path: string) => {
    props.onOpenRecent(path);
  };

  const handleRemoveRecent = async (e: MouseEvent, path: string) => {
    e.stopPropagation();
    try {
      await props.onRemoveRecent(path);
      const { invoke } = await import('@tauri-apps/api/core');
      const list: RecentProjectInfo[] = await invoke('get_recent_projects');
      setRecentProjects(list);
    } catch (err) {
      console.error('Failed to refresh recent projects:', err);
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

      return d.toLocaleDateString(undefined, {
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
    <div class="welcome-screen">
      <header class="welcome-topbar">
        <div class="welcome-brand">
          <img
            src="/icon.png"
            alt=""
            class="welcome-brand-icon"
            onError={(event) => {
              (event.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <span>CanScope</span>
        </div>
        <button
          class="welcome-settings-button"
          type="button"
          aria-label="全局设置"
          title="全局设置"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={17} />
        </button>
      </header>

      <div class="welcome-launchpad">
        <section class="welcome-start">
          <span class="welcome-product-label">CAN 总线回放与分析</span>
          <h1>准备开始工作</h1>
          <p>创建一个新工程，或打开已有工程继续分析 CAN 数据。</p>

          <div class="welcome-actions">
            <button class="welcome-btn welcome-btn-primary" onClick={props.onNewProject}>
              <Plus size={18} />
              新建工程
            </button>
            <button class="welcome-btn welcome-btn-secondary" onClick={props.onOpenProject}>
              <FolderOpen size={18} />
              打开工程
            </button>
          </div>
        </section>

        <section class="welcome-recent" aria-labelledby="welcome-recent-title">
          <div class="welcome-recent-heading">
            <div>
              <h2 id="welcome-recent-title">最近工程</h2>
              <p>快速回到最近使用的工作</p>
            </div>
            <Show when={recentProjects().length > 0}>
              <span class="welcome-recent-count">{recentProjects().length}</span>
            </Show>
          </div>

          <Show
            when={recentProjects().length > 0}
            fallback={
              <div class="welcome-recent-empty">
                <Clock3 size={20} />
                <span>最近打开的工程会显示在这里</span>
              </div>
            }
          >
            <ul class="welcome-recent-list">
              {recentProjects().map((p) => (
                <li class="welcome-recent-item">
                  <button
                    class="welcome-recent-open"
                    type="button"
                    onClick={() => handleOpenRecent(p.path)}
                  >
                    <span class="welcome-recent-icon"><FolderOpen size={17} /></span>
                    <span class="welcome-recent-info">
                      <span class="welcome-recent-name">{p.name}</span>
                      <span class="welcome-recent-meta">
                        <span class="welcome-recent-time">{formatTime(p.openedAt)}</span>
                        <span class="welcome-recent-path" title={p.path}>
                          {p.path.length > 60 ? '...' + p.path.slice(-57) : p.path}
                        </span>
                      </span>
                    </span>
                    <ArrowUpRight class="welcome-recent-arrow" size={16} />
                  </button>
                  <button
                    class="welcome-recent-remove"
                    type="button"
                    onClick={(event) => handleRemoveRecent(event, p.path)}
                    aria-label={`从最近工程中移除 ${p.name}`}
                    title="从列表中移除"
                  >
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </Show>
        </section>
      </div>
      <footer class="welcome-footer">
        <span>快捷键</span>
        <span>新建工程 <kbd>{modKey}+N</kbd></span>
        <span>打开工程 <kbd>{modKey}+O</kbd></span>
      </footer>
      <Show when={settingsOpen()}>
        <div class="welcome-settings-overlay" onClick={() => setSettingsOpen(false)}>
          <section
            class="welcome-settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header class="welcome-settings-header">
              <h2 id="welcome-settings-title">全局设置</h2>
              <button
                type="button"
                aria-label="关闭全局设置"
                title="关闭"
                onClick={() => setSettingsOpen(false)}
              >
                <X size={17} />
              </button>
            </header>
            <div class="welcome-settings-body">
              <div class="welcome-settings-panel">
                <MeasurementSettingsPanel
                  settings={props.measurementSettings}
                  cachedFrameCount={0}
                  estimatedCacheBytes={0}
                  onChange={props.onMeasurementSettingsChange}
                />
              </div>
            </div>
          </section>
        </div>
      </Show>
    </div>
  );
};

export default WelcomeScreen;
import { Component, createSignal, onMount } from 'solid-js';
import type { RecentProjectInfo } from '../types';

interface WelcomeScreenProps {
  onNewProject: () => void;
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onRemoveRecent: (path: string) => void;
}

const WelcomeScreen: Component<WelcomeScreenProps> = (props) => {
  const [recentProjects, setRecentProjects] = createSignal<RecentProjectInfo[]>([]);

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
      <div class="welcome-logo">
        <img
          src="/icon.png"
          alt="CanScope"
          style={{ width: '72px', height: '72px' }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
      <h1 class="welcome-title">CanScope</h1>
      <p class="welcome-subtitle">CAN 总线回放与分析工具</p>

      <div class="welcome-actions">
        <button class="welcome-btn welcome-btn-primary" onClick={props.onNewProject}>
          <svg class="welcome-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建工程
        </button>
        <button class="welcome-btn welcome-btn-secondary" onClick={props.onOpenProject}>
          <svg class="welcome-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          打开工程
        </button>
      </div>

      <div class="welcome-footer">
        <span>快捷键：</span>
        <kbd>{modKey}+N</kbd> 新建工程 &nbsp;
        <kbd>{modKey}+O</kbd> 打开工程
      </div>

      {recentProjects().length > 0 && (
        <div class="welcome-recent">
          <div class="welcome-recent-header">最近工程</div>
          <div class="welcome-recent-list">
            {recentProjects().map((p) => (
              <div
                class="welcome-recent-item"
                onClick={() => handleOpenRecent(p.path)}
              >
                <div class="welcome-recent-info">
                  <div class="welcome-recent-name">{p.name}</div>
                  <div class="welcome-recent-meta">
                    <span class="welcome-recent-time">{formatTime(p.openedAt)}</span>
                    <span class="welcome-recent-path" title={p.path}>
                      {p.path.length > 60
                        ? '...' + p.path.slice(-57)
                        : p.path}
                    </span>
                  </div>
                </div>
                <button
                  class="welcome-recent-remove"
                  onClick={(e) => handleRemoveRecent(e, p.path)}
                  title="从列表中移除"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="welcome-remove-icon">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WelcomeScreen;
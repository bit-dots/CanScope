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
      props.onRemoveRecent(path);
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

      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;

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
      <p class="welcome-subtitle">CAN Bus Playback &amp; Analysis Tool</p>

      <div class="welcome-actions">
        <button class="welcome-btn welcome-btn-primary" onClick={props.onNewProject}>
          <span class="welcome-btn-icon">+</span>
          New Project
        </button>
        <button class="welcome-btn welcome-btn-secondary" onClick={props.onOpenProject}>
          <span class="welcome-btn-icon">&#x1F4C2;</span>
          Open Project
        </button>
      </div>

      {recentProjects().length > 0 && (
        <div class="welcome-recent">
          <div class="welcome-recent-header">Recent Projects</div>
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
                  title="Remove from list"
                >
                  &#x2715;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div class="welcome-footer">
        <span>Keyboard shortcuts:</span>
        <kbd>Ctrl+N</kbd> New Project &nbsp;
        <kbd>Ctrl+O</kbd> Open Project
      </div>
    </div>
  );
};

export default WelcomeScreen;
import { Component, createSignal, For, Show } from 'solid-js';

export interface DatabaseEntry {
  id: string;
  name: string;
  path: string;
  type: 'dbc' | 'ldf';
}

interface DatabaseManagerDialogProps {
  initialPaths: string[];
  onConfirm: (entries: DatabaseEntry[]) => void;
  onCancel: () => void;
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

const ToolbarIcon: Component<{ title: string; onClick: () => void; disabled?: boolean }> = (props) => (
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

const DatabaseManagerDialog: Component<DatabaseManagerDialogProps> = (props) => {
  const [entries, setEntries] = createSignal<DatabaseEntry[]>(() =>
    props.initialPaths.map((p) => ({
      id: nextId(),
      name: getFileName(p),
      path: p,
      type: getFileType(p),
    }))
  );

  const hasEntries = () => entries().length > 0;

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
      const existingPaths = new Set(entries().map((e) => e.path));
      const newEntries: DatabaseEntry[] = [];

      for (const path of paths) {
        if (typeof path === 'string' && !existingPaths.has(path)) {
          newEntries.push({
            id: nextId(),
            name: getFileName(path),
            path,
            type: getFileType(path),
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

  const handleRemove = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onCancel();
  };

  const handleConfirm = () => {
    props.onConfirm(entries());
  };

  return (
    <div class="dm-overlay" onKeyDown={handleKeyDown}>
      <div class="dm-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Title Bar */}
        <div class="dm-titlebar">
          <span class="dm-titlebar-text">数据库管理</span>
          <button class="dm-titlebar-close" onClick={props.onCancel} aria-label="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Icon Toolbar */}
        <div class="dm-toolbar">
          <ToolbarIcon title="导入数据库文件" onClick={handleImport}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </ToolbarIcon>
          <div class="dm-toolbar-sep" />
          <ToolbarIcon title="通道绑定" onClick={() => {}} disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </ToolbarIcon>
          <Show when={hasEntries()}>
            <div class="dm-toolbar-sep" />
            <span class="dm-toolbar-count">{entries().length} 个文件</span>
          </Show>
        </div>

        {/* Content */}
        <div class="dm-content">
          {/* Section: Database Files */}
          <section class="dm-section">
            <h3 class="dm-section-title">数据库文件</h3>
            <Show
              when={hasEntries()}
              fallback={
                <div class="dm-section-empty">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="32" height="32">
                    <ellipse cx="12" cy="6" rx="8" ry="3" />
                    <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
                    <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                  </svg>
                  <p>暂无文件，点击工具栏 <span class="dm-inline-kbd">⊕</span> 导入</p>
                </div>
              }
            >
              <div class="dm-files-table">
                <div class="dm-files-head">
                  <span class="dm-files-th dm-files-th--name">文件名</span>
                  <span class="dm-files-th dm-files-th--type">类型</span>
                  <span class="dm-files-th dm-files-th--path">路径</span>
                  <span class="dm-files-th dm-files-th--action"></span>
                </div>
                <div class="dm-files-body">
                  <For each={entries()}>
                    {(entry) => (
                      <div class="dm-files-row">
                        <span class="dm-files-cell dm-files-cell--name">
                          <span class="dm-files-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <Show
                                when={entry.type === 'dbc'}
                                fallback={<polyline points="10 13 8 13" />}
                              >
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                              </Show>
                            </svg>
                          </span>
                          {entry.name}
                        </span>
                        <span class="dm-files-cell dm-files-cell--type">
                          <span class={`dm-files-badge${entry.type === 'dbc' ? ' dm-files-badge--dbc' : ' dm-files-badge--ldf'}`}>
                            {entry.type.toUpperCase()}
                          </span>
                        </span>
                        <span class="dm-files-cell dm-files-cell--path" title={entry.path}>
                          {entry.path}
                        </span>
                        <span class="dm-files-cell dm-files-cell--action">
                          <button class="dm-files-remove" onClick={() => handleRemove(entry.id)} title="移除">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </section>

          {/* Section: Channel Binding (placeholder) */}
          <section class="dm-section">
            <h3 class="dm-section-title">通道绑定</h3>
            <div class="dm-section-placeholder">功能开发中</div>
          </section>
        </div>

        {/* Footer */}
        <div class="dm-footer">
          <button class="dm-footer-btn dm-footer-btn--cancel" onClick={props.onCancel}>
            取消
          </button>
          <button class="dm-footer-btn dm-footer-btn--confirm" onClick={handleConfirm}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

export default DatabaseManagerDialog;
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
    if (e.key === 'Escape') {
      props.onCancel();
    }
  };

  const handleConfirm = () => {
    props.onConfirm(entries());
  };

  const badgeClass = (type: 'dbc' | 'ldf') =>
    `dm-badge${type === 'dbc' ? ' dm-badge--dbc' : ' dm-badge--ldf'}`;

  return (
    <div class="dm-overlay" onKeyDown={handleKeyDown}>
      <div class="dm-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div class="dm-header">
          <div>
            <h2 class="dm-title">数据库管理</h2>
            <p class="dm-subtitle">管理项目中加载的 DBC 和 LDF 数据库文件</p>
          </div>
          <button class="dm-close" onClick={props.onCancel} aria-label="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div class="dm-body">
          <div class="dm-toolbar">
            <button class="dm-import-btn" onClick={handleImport}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              导入数据库文件
            </button>
            <Show when={hasEntries()}>
              <span class="dm-count">{entries().length} 个文件</span>
            </Show>
          </div>

          <Show
            when={hasEntries()}
            fallback={
              <div class="dm-empty">
                <div class="dm-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="40" height="40">
                    <ellipse cx="12" cy="6" rx="8" ry="3" />
                    <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
                    <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                  </svg>
                </div>
                <p class="dm-empty-title">暂无数据库文件</p>
                <p class="dm-empty-desc">点击上方按钮导入 DBC 或 LDF 文件到当前工程</p>
              </div>
            }
          >
            <div class="dm-table">
              {/* Table Header */}
              <div class="dm-table-head">
                <div class="dm-th dm-th--name">文件名</div>
                <div class="dm-th dm-th--type">类型</div>
                <div class="dm-th dm-th--path">路径</div>
                <div class="dm-th dm-th--action"></div>
              </div>

              {/* Table Body */}
              <div class="dm-table-body">
                <For each={entries()}>
                  {(entry) => (
                    <div class="dm-row">
                      <div class="dm-cell dm-cell--name">
                        <span class="dm-file-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <Show when={entry.type === 'dbc'} fallback={<polyline points="10 13 8 13" />}>
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                            </Show>
                          </svg>
                        </span>
                        <span class="dm-name">{entry.name}</span>
                      </div>
                      <div class="dm-cell dm-cell--type">
                        <span class={badgeClass(entry.type)}>{entry.type.toUpperCase()}</span>
                      </div>
                      <div class="dm-cell dm-cell--path" title={entry.path}>
                        {entry.path}
                      </div>
                      <div class="dm-cell dm-cell--action">
                        <button class="dm-remove-btn" onClick={() => handleRemove(entry.id)} title="移除">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>

        {/* Footer */}
        <div class="dm-footer">
          <button class="dm-btn dm-btn-cancel" onClick={props.onCancel}>
            取消
          </button>
          <button class="dm-btn dm-btn-confirm" onClick={handleConfirm}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

export default DatabaseManagerDialog;
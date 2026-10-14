import { Component, createSignal, For, onMount } from 'solid-js';

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

  const handleImport = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        title: '导入数据库文件',
        filters: [
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

  return (
    <div class="dm-overlay" onKeyDown={handleKeyDown}>
      <div class="dm-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dm-header">
          <h2 class="dm-title">数据库管理</h2>
          <button class="dm-close" onClick={props.onCancel} aria-label="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="dm-body">
          <div class="dm-toolbar">
            <button class="dm-import-btn" onClick={handleImport}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5-6z" />
                <polyline points="14 3 14 9 20 9" />
                <line x1="12" y1="12" x2="12" y2="18" />
                <polyline points="9 15 12 18 15 15" />
              </svg>
              导入数据库文件
            </button>
          </div>

          <div class="dm-table-wrapper">
            <For
              each={entries()}
              fallback={
                <div class="dm-empty">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:32px;height:32px;opacity:0.3;margin-bottom:10px">
                    <ellipse cx="12" cy="6" rx="8" ry="3" />
                    <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
                    <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                  </svg>
                  暂无导入的数据库文件
                </div>
              }
            >
              {(entry) => (
                <div class="dm-row">
                  <div class="dm-cell dm-cell--name">
                    <span class="dm-file-icon">
                      {entry.type === 'ldf' ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      )}
                    </span>
                    <span class="dm-name">{entry.name}</span>
                  </div>
                  <div class="dm-cell dm-cell--type">
                    <span class="dm-badge dm-badge--{entry.type}">{entry.type.toUpperCase()}</span>
                  </div>
                  <div class="dm-cell dm-cell--path" title={entry.path}>
                    {entry.path}
                  </div>
                  <div class="dm-cell dm-cell--action">
                    <button class="dm-remove-btn" onClick={() => handleRemove(entry.id)} title="移除">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
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
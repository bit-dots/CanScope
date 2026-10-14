import { Component, createSignal, For, Show, onCleanup, createEffect } from 'solid-js';
import { PlusCircle, Link, CircleHelp, X, Database, File } from 'lucide-solid';

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
  const [showHelp, setShowHelp] = createSignal(false);
  let helpRef: HTMLDivElement | undefined;

  const hasEntries = () => entries().length > 0;

  const closeHelp = () => setShowHelp(false);
  const toggleHelp = () => setShowHelp((v) => !v);

  createEffect(() => {
    if (showHelp()) {
      document.addEventListener('click', handleHelpOutsideClick);
    } else {
      document.removeEventListener('click', handleHelpOutsideClick);
    }
  });

  onCleanup(() => {
    document.removeEventListener('click', handleHelpOutsideClick);
  });

  const handleHelpOutsideClick = (e: MouseEvent) => {
    if (helpRef && !helpRef.contains(e.target as Node)) {
      closeHelp();
    }
  };

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
      if (showHelp()) {
        closeHelp();
      } else {
        props.onCancel();
      }
    }
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
          <div class="dm-titlebar-actions">
            <button
              class="dm-titlebar-help"
              classList={{ 'dm-titlebar-help--active': showHelp() }}
              onClick={toggleHelp}
              aria-label="帮助"
              title="关于此窗口"
            >
              <CircleHelp size={14} />
            </button>
            <button class="dm-titlebar-close" onClick={props.onCancel} aria-label="关闭">
              <X size={14} />
            </button>
          </div>

          {/* Help Popover */}
          <Show when={showHelp()}>
            <div
              ref={helpRef}
              class="dm-help-popover"
              onClick={(e) => e.stopPropagation()}
            >
              <div class="dm-help-popover-arrow" />
              <div class="dm-help-popover-body">
                <strong>在此统一管理工程加载的数据库文件。</strong>
                <ul>
                  <li>点击工具栏 <PlusCircle class="dm-inline-icon" size={12} /> 导入 DBC 或 LDF 文件</li>
                  <li>在列表中确认后，点击"确定"将一次性加载所有 DBC</li>
                  <li>LDF / ARXML 文件的后端支持尚未实现，导入后暂不解析</li>
                </ul>
              </div>
            </div>
          </Show>
        </div>

        {/* Icon Toolbar */}
        <div class="dm-toolbar">
          <ToolbarIcon title="导入数据库文件" onClick={handleImport}>
            <PlusCircle size={16} />
          </ToolbarIcon>
          <div class="dm-toolbar-sep" />
          <ToolbarIcon title="通道绑定" onClick={() => {}} disabled>
            <Link size={16} />
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
                  <Database size={32} strokeWidth={1.2} />
                  <p>暂无文件，点击工具栏 <PlusCircle class="dm-inline-icon" size={12} /> 导入</p>
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
                            <File size={16} />
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
                            <X size={14} />
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
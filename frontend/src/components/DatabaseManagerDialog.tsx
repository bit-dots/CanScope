import { Component, createSignal, For, Show, onCleanup, onMount, createEffect, type JSX } from 'solid-js';
import { PlusCircle, CircleHelp, X, Database, File } from 'lucide-solid';

export interface DatabaseEntry {
  id: string;
  name: string;
  path: string;
  type: 'dbc' | 'ldf';
  busId: number;
}

interface DatabaseManagerProps {
  mode?: 'dialog' | 'panel';
  initialBindings: { busId: number; path: string }[];
  onConfirm: (entries: DatabaseEntry[]) => void;
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

const ToolbarIcon: Component<{ title: string; onClick: () => void; disabled?: boolean; children?: JSX.Element }> = (props) => (
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

const DatabaseManagerDialog: Component<DatabaseManagerProps> = (props) => {
  const isDialog = () => (props.mode ?? 'dialog') === 'dialog';

  const [visible, setVisible] = createSignal(false);
  const [closing, setClosing] = createSignal(false);

  onMount(() => {
    if (isDialog()) {
      requestAnimationFrame(() => setVisible(true));
    }
  });

  const closeWithAnimation = () => {
    if (!isDialog()) {
      props.onConfirm(entries());
      return;
    }
    setClosing(true);
    setVisible(false);
    setTimeout(() => props.onConfirm(entries()), 200);
  };

  const [entries, setEntries] = createSignal<DatabaseEntry[]>(
    props.initialBindings.map((b) => ({
      id: nextId(),
      name: getFileName(b.path),
      path: b.path,
      type: getFileType(b.path),
      busId: b.busId,
    }))
  );
  const [showHelp, setShowHelp] = createSignal(false);
  let helpRef: HTMLDivElement | undefined;
  let dialogRef: HTMLDivElement | undefined;

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
            busId: 1,
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
        closeWithAnimation();
      }
    }
  };

  const handleOverlayClick = (e: MouseEvent) => {
    if (isDialog() && dialogRef && !dialogRef.contains(e.target as Node)) {
      closeWithAnimation();
    }
  };

  // Shared help button + popover
  const HelpButton = (
    <>
      <button
        class="dm-titlebar-help"
        classList={{ 'dm-titlebar-help--active': showHelp() }}
        onClick={toggleHelp}
        aria-label="帮助"
        title="关于此窗口"
      >
        <CircleHelp size={14} />
      </button>
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
              <li>在列表中确认后，点击"确定"统一加载</li>
              <li>LDF / ARXML 文件暂未支持，导入后不解析</li>
            </ul>
          </div>
        </div>
      </Show>
    </>
  );

  // Shared icon toolbar
  const Toolbar = (
    <div class="dm-toolbar">
      <ToolbarIcon title="导入数据库文件" onClick={handleImport}>
        <PlusCircle size={16} />
      </ToolbarIcon>
      <Show when={hasEntries()}>
        <div class="dm-toolbar-sep" />
        <span class="dm-toolbar-count">{entries().length} 个文件</span>
      </Show>
      {!isDialog() && (
        <div class="dm-toolbar--right">
          {HelpButton}
        </div>
      )}
    </div>
  );

  // Shared content body
  const Content = (
    <div class="dm-content">
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
            <span class="dm-files-th dm-files-th--channel">通道</span>
            <span class="dm-files-th dm-files-th--path">路径</span>
            <span class="dm-files-th dm-files-th--action"></span>
          </div>
          <div class="dm-files-body">
            <For each={entries()}>
              {(entry, idx) => (
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
                  <span class="dm-files-cell dm-files-cell--channel">
                    <input
                      type="number"
                      class="dm-channel-input"
                      min="0"
                      max="15"
                      value={entry.busId}
                      onChange={(e) => {
                        const i = idx();
                        const v = parseInt(e.currentTarget.value, 10);
                        if (!isNaN(v) && v >= 0 && v <= 15) {
                          setEntries((prev) => {
                            const next = [...prev];
                            next[i] = { ...next[i], busId: v };
                            return next;
                          });
                        }
                      }}
                      onBlur={(e) => {
                        const i = idx();
                        const v = parseInt(e.currentTarget.value, 10);
                        if (isNaN(v) || v < 0) {
                          setEntries((prev) => {
                            const next = [...prev];
                            next[i] = { ...next[i], busId: 0 };
                            return next;
                          });
                        }
                      }}
                      title="该 DBC 数据库绑定的 CAN 通道编号"
                    />
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
    </div>
  );

  // Shared status bar
  const StatusBar = (
    <div class="dm-statusbar">
      <Show
        when={hasEntries()}
        fallback={<span class="dm-statusbar__text">未加载数据库文件</span>}
      >
        <span class="dm-statusbar__text">
          <strong>{entries().length}</strong>{' 个文件'}
        </span>
      </Show>
    </div>
  );

  // Panel mode: inline layout
  if (!isDialog()) {
    return (
      <div class="dm-panel" onKeyDown={handleKeyDown}>
        {Toolbar}
        {Content}
        {StatusBar}
      </div>
    );
  }

  // Dialog mode: overlay + centered modal
  return (
    <div
      class="dm-overlay"
      classList={{
        'dm-overlay--visible': visible(),
        'dm-overlay--closing': closing(),
      }}
      onKeyDown={handleKeyDown}
      onClick={handleOverlayClick}
    >
      <div
        ref={dialogRef}
        class="dm-dialog"
        classList={{
          'dm-dialog--visible': visible(),
          'dm-dialog--closing': closing(),
        }}
      >
        <div class="dm-titlebar">
          <span class="dm-titlebar-text">数据库管理</span>
          <div class="dm-titlebar-actions">
            {HelpButton}
            <button class="dm-titlebar-close" onClick={closeWithAnimation} aria-label="关闭">
              <X size={14} />
            </button>
          </div>
        </div>
        {Toolbar}
        {Content}
        {StatusBar}
      </div>
    </div>
  );
};

export default DatabaseManagerDialog;
import { createSignal, createMemo, createEffect, onCleanup, onMount } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import Ribbon from './components/ribbon/Ribbon';
import SignalTree from './components/SignalTree';
import FrameTable from './components/FrameTable';
import SignalChart from './components/SignalChart';
import StatusBar from './components/StatusBar';
import WelcomeScreen from './components/WelcomeScreen';
import { Radio, FilePlay } from 'lucide-solid';
import NewProjectDialog, { type NewProjectConfig } from './components/NewProjectDialog';
import ConfirmDialog from './components/ConfirmDialog';
import FloatingWindow from './components/windowing/FloatingWindow';
import WindowTaskbar from './components/windowing/WindowTaskbar';
import { useWindowManager } from './components/windowing/useWindowManager';
import ResourceManager from './components/ResourceManager';
import PlaybackPanel from './components/PlaybackPanel';
import DatabaseManagerDialog from './components/DatabaseManagerDialog';
import type {
  PlaybackState,
  FrameInfo,
  PlaylistInfo,
  FilterConfig,
  DbcTreeInfo,
  ChartSignal,
  ProjectInfo,
} from './types';
import { matchesFilter } from './types';
import './App.css';

function App() {
  const [project, setProject] = createSignal<ProjectInfo | null>(null);
  const [metadata, setMetadata] = createSignal<PlaylistInfo | null>(null);
  const [frames, setFrames] = createSignal<FrameInfo[]>([]);
  const [playbackState, setPlaybackState] = createSignal<PlaybackState>('stopped');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [filter, setFilter] = createSignal<FilterConfig>({ canId: '', timeStart: '', timeEnd: '' });
  const [dbcTree, setDbcTree] = createSignal<DbcTreeInfo | null>(null);
  const [selectedCanId, setSelectedCanId] = createSignal<number | null>(null);
  const [chartSignals, setChartSignals] = createSignal<ChartSignal[]>([]);
  const [speed, setSpeed] = createSignal(1);
  const [loopEnabled, setLoopEnabled] = createSignal(false);
  const [online] = createSignal(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = createSignal(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = createSignal(false);
  const [showDatabaseManager, setShowDatabaseManager] = createSignal(false);
  let isWindowClosing = false;

  const PANEL_DEFS = [
    { id: 'resource-manager', title: '资源管理器', defaultVisible: true, defaultPosition: { x: 0, y: 0, width: 280, height: 600 } },
    { id: 'dbc-tree', title: 'DBC 信号树', defaultVisible: false, defaultPosition: { x: 340, y: 20, width: 300, height: 400 } },
    { id: 'signal-decode', title: '信号解析', defaultVisible: false, defaultPosition: { x: 340, y: 20, width: 300, height: 400 } },
    { id: 'frame-monitor', title: '报文监控', defaultVisible: false, defaultPosition: { x: 300, y: 0, width: 600, height: 400 } },
    { id: 'chart', title: '图形曲线', defaultVisible: false, defaultPosition: { x: 20, y: 440, width: 620, height: 240 } },
    { id: 'message-send', title: '报文发送', defaultVisible: false, defaultPosition: { x: 200, y: 100, width: 400, height: 350 } },
    { id: 'statistics', title: '统计信息', defaultVisible: false, defaultPosition: { x: 250, y: 120, width: 450, height: 380 } },
    { id: 'log', title: '日志', defaultVisible: false, defaultPosition: { x: 150, y: 80, width: 500, height: 300 } },
    { id: 'playback', title: '数据回放', defaultVisible: false, defaultPosition: { x: 300, y: 50, width: 700, height: 500 } },
  ];

  const [workspaceEl, setWorkspaceEl] = createSignal<HTMLElement | null>(null);
  const windowManager = useWindowManager(PANEL_DEFS, workspaceEl);

  const filteredFrames = createMemo<FrameInfo[]>(() => {
    const f = filter();
    if (!f.canId && !f.timeStart && !f.timeEnd) return frames();
    return frames().filter(frame => matchesFilter(frame, f));
  });

  const currentTime = createMemo(() => {
    const list = frames();
    return list.length > 0 ? list[list.length - 1].timestamp : 0;
  });

  let playbackTimer: ReturnType<typeof setInterval> | null = null;

  const startPolling = () => {
    if (playbackTimer) return;
    const interval = Math.max(10, Math.round(100 / speed()));
    playbackTimer = setInterval(async () => {
      try {
        const batch: FrameInfo[] = await invoke('get_batch');
        if (batch.length > 0) {
          setFrames(prev => [...prev, ...batch]);
        }
      } catch (e) {
        console.error('get_batch failed:', e);
      }
    }, interval);
  };

  const stopPolling = () => {
    if (playbackTimer) {
      clearInterval(playbackTimer);
      playbackTimer = null;
    }
  };

  onCleanup(() => stopPolling());

  onMount(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    appWindow.setTheme('dark').catch((e) => console.error('setTheme failed:', e));
    appWindow.onCloseRequested(async (event) => {
      try {
        const dirty: boolean = await invoke('is_project_dirty');
        if (!dirty) return;
      } catch {
        return;
      }
      event.preventDefault();
      isWindowClosing = true;
      setShowUnsavedDialog(true);
    });

    
  });

  const handleNewProject = async () => {
    setShowNewProjectDialog(true);
  };

  const handleConfirmNewProject = async (config: NewProjectConfig) => {
    setShowNewProjectDialog(false);

    try {
      const sep = config.parentFolder.includes('\\') ? '\\' : '/';
      const basePath = config.parentFolder.endsWith(sep)
        ? config.parentFolder
        : config.parentFolder + sep;

      let projectDir: string;
      let projectFilePath: string;

      if (config.createSubfolder) {
        projectDir = basePath + config.name;
        projectFilePath = projectDir + sep + config.name + '.canscope';
        await invoke('ensure_dir', { path: projectDir });
      } else {
        projectDir = basePath;
        projectFilePath = basePath + config.name + '.canscope';
      }

      const proj: ProjectInfo = await invoke('create_project', {
        name: config.name,
      });

      setProject(proj);

      await invoke('save_project_as', { path: projectFilePath });

      setProject(prev => prev ? { ...prev, projectPath: projectFilePath } : null);
    } catch (e) {
      setError(String(e));
      console.error('Failed to create project:', e);
    }
  };

  const handleOpenProject = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        title: 'Open Project',
        filters: [
          { name: 'CanScope Project', extensions: ['canscope'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!selected) return;
      if (typeof selected !== 'string') return;

      await openProjectByPath(selected);
    } catch (e) {
      setError(String(e));
      console.error('Failed to open project:', e);
    }
  };

  const handleOpenRecent = async (path: string) => {
    try {
      await openProjectByPath(path);
    } catch (e) {
      setError(String(e));
      console.error('Failed to open recent project:', e);
    }
  };

  const handleRemoveRecent = async (path: string) => {
    try {
      await invoke('remove_recent_project', { path });
    } catch (e) {
      console.error('Failed to remove recent project:', e);
    }
  };

  const openProjectByPath = async (path: string) => {
    setLoading(true);
    setError(null);
    setDbcTree(null);
    setSelectedCanId(null);
    setChartSignals([]);
    stopPolling();

    try {
      const proj: ProjectInfo = await invoke('open_project', { path });
      setProject(proj);

      if (proj.canLogPath) {
        await invoke('playlist_add', { path: proj.canLogPath });
        const info: PlaylistInfo | null = await invoke('playlist_get_files');
        if (info) setMetadata(info);
        setPlaybackState('stopped');
      }

      if (proj.filters) {
        setFilter({
          canId: proj.filters.canId,
          timeStart: proj.filters.timeStart,
          timeEnd: proj.filters.timeEnd,
        });
      }
      if (proj.chartSignals && proj.chartSignals.length > 0) {
        setChartSignals(
          proj.chartSignals.map(s => ({ canId: s.canId, signalName: s.signalName, unit: s.unit }))
        );
      }

      if (proj.dbcBindings && proj.dbcBindings.length > 0) {
        for (const binding of proj.dbcBindings) {
          try {
            await invoke('load_dbc', { path: binding.path, busId: binding.busId });
            const tree: DbcTreeInfo | null = await invoke('get_dbc_info');
            if (tree) {
              setDbcTree(tree);
            }
          } catch {
            // DBC file may have been moved
          }
        }
      }
    } catch (e) {
      setError(String(e));
      console.error('Failed to open project:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProject = async () => {
    try {
      const proj = project();
      if (!proj) return;

      if (proj.projectPath) {
        await invoke('save_project');
      } else {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const selected = await save({
          title: 'Save Project As',
          filters: [
            { name: 'CanScope Project', extensions: ['canscope'] },
          ],
        });
        if (!selected || typeof selected !== 'string') return;

        let savePath = selected;
        if (!savePath.endsWith('.canscope')) {
          savePath += '.canscope';
        }
        await persistState(savePath);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleSaveProjectAs = async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const selected = await save({
        title: 'Save Project As',
        filters: [
          { name: 'CanScope Project', extensions: ['canscope'] },
        ],
      });
      if (!selected || typeof selected !== 'string') return;

      let savePath = selected;
      if (!savePath.endsWith('.canscope')) {
        savePath += '.canscope';
      }
      await persistState(savePath);
    } catch (e) {
      setError(String(e));
    }
  };

  const persistState = async (path: string) => {
    await invoke('update_project_state', {
      filters: {
        canId: filter().canId,
        timeStart: filter().timeStart,
        timeEnd: filter().timeEnd,
      },
      chartSignals: chartSignals().map(s => ({
        canId: s.canId,
        signalName: s.signalName,
        unit: s.unit,
      })),
      uiLayout: {
        panelWidth: 260,
        chartHeight: 220,
      },
      lastPosition: currentTime(),
    });

    await invoke('save_project_as', { path });

    setProject(prev => prev ? { ...prev, projectPath: path } : null);
  };

  const handleCloseProject = async () => {
    try {
      const dirty: boolean = await invoke('is_project_dirty');
      if (dirty) {
        setShowUnsavedDialog(true);
        return;
      }
      await doCloseProject();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleSaveAndClose = async () => {
    setShowUnsavedDialog(false);
    try {
      await handleSaveProject();
      if (isWindowClosing) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        getCurrentWindow().close();
      } else {
        await doCloseProject();
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDiscardAndClose = async () => {
    setShowUnsavedDialog(false);
    try {
      if (isWindowClosing) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        getCurrentWindow().close();
      } else {
        await doCloseProject();
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const doCloseProject = async () => {
    stopPolling();
    await invoke('close_project');
    setProject(null);
    setMetadata(null);
    setFrames([]);
    setPlaybackState('stopped');
    setDbcTree(null);
    setSelectedCanId(null);
    setChartSignals([]);
    setError(null);
    setFilter({ canId: '', timeStart: '', timeEnd: '' });
  };

  const handleLoadDbc = async (path: string, busId: number) => {
    try {
      const result: string = await invoke('load_dbc', { path, busId });
      console.log(result);

      const tree: DbcTreeInfo | null = await invoke('get_dbc_info');
      setDbcTree(tree);
    } catch (e) {
      console.error('Failed to load DBC:', e);
      setError(String(e));
    }
  };

  const handleOpenDatabaseManager = () => {
    setShowDatabaseManager(true);
  };

  const handleDatabaseManagerConfirm = async (entries: Array<{ id: string; name: string; path: string; type: string; busId: number }>) => {
    setShowDatabaseManager(false);

    // 先清空引擎中所有已加载的 DBC，再按最新列表逐条加载
    await invoke('clear_all_dbc');

    // Load all DBC entries with their assigned bus IDs
    for (const entry of entries) {
      if (entry.type === 'dbc') {
        await handleLoadDbc(entry.path, entry.busId);
      }
    }

    // 同步更新工程状态中的 DBC 绑定列表
    const bindings = entries.map((e) => ({ busId: e.busId, path: e.path }));
    setProject((prev) => prev ? { ...prev, dbcBindings: bindings } : null);

    // LDF import — not yet implemented on backend, skip for now
    const ldfPaths = entries
      .filter((e) => e.type === 'ldf')
      .map((e) => e.path);

    if (ldfPaths.length > 0) {
      console.log('LDF files selected (not yet implemented):', ldfPaths);
    }
  };

  const handleSeek = async (timestamp: number) => {
    try {
      const wasPlaying = playbackState() === 'playing';
      if (wasPlaying) stopPolling();
      await invoke('seek_to', { timestamp });
      setFrames([]);
      const batch: FrameInfo[] = await invoke('get_batch');
      setFrames(batch);
      if (wasPlaying) startPolling();
    } catch (e) {
      console.error('Seek failed:', e);
    }
  };

  const handleSelectMessage = (canId: number | null) => {
    setSelectedCanId(canId);
    if (canId !== null) {
      setFilter({ canId: '0x' + canId.toString(16).toUpperCase(), timeStart: '', timeEnd: '' });
    } else {
      setFilter({ canId: '', timeStart: '', timeEnd: '' });
    }
  };

  const handleAddSignal = (s: ChartSignal) => {
    setChartSignals(prev => [...prev, s]);
  };

  const handleRemoveSignal = (s: ChartSignal) => {
    setChartSignals(prev => prev.filter(x => !(x.canId === s.canId && x.signalName === s.signalName)));
  };

  const handlePlaybackControl = async (action: string) => {
    try {
      const state: string = await invoke('playback_control', { action });
      setPlaybackState(state as PlaybackState);

      if (state === 'playing') {
        startPolling();
      } else {
        stopPolling();
        if (state === 'stopped') {
          setFrames([]);
        }
      }
    } catch (e) {
      console.error('playback_control failed:', e);
    }
  };

  const hasSource = () => metadata() !== null;

  onMount(async () => {
    // 监听后端播放状态变更事件（如播放完毕自动停止）
    const unlisten = await listen<string>('playback-state-changed', (event) => {
      if (event.payload === 'stopped') {
        stopPolling();
        setPlaybackState('stopped');
      }
    });
    onCleanup(unlisten);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'n') {
          e.preventDefault();
          if (!hasSource()) handleNewProject();
        } else if (e.key === 'o') {
          e.preventDefault();
          if (!hasSource()) handleOpenProject();
        } else if (e.key === 's') {
          e.preventDefault();
          if (hasSource()) {
            if (e.shiftKey) {
              handleSaveProjectAs();
            } else {
              handleSaveProject();
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));

    // Anchor resource-manager as left sidebar, full height
    // Use createEffect so height syncs on workspace re-mount (open/close project)
    createEffect(() => {
      const ws = workspaceEl();
      const proj = project();
      if (!ws || !proj) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const ws2 = workspaceEl();
          if (ws2) {
            windowManager.setPanelRect('resource-manager', { height: ws2.clientHeight });
          }
        });
      });
    });

    const syncRmHeight = () => {
      const ws = workspaceEl();
      if (ws) windowManager.setPanelRect('resource-manager', { height: ws.clientHeight });
    };
    window.addEventListener('resize', syncRmHeight);
    onCleanup(() => window.removeEventListener('resize', syncRmHeight));
  });

  const handleSetSpeed = async (newSpeed: number) => {
    try {
      const actual: number = await invoke('set_speed', { speed: newSpeed });
      setSpeed(actual);
    } catch (e) {
      console.error('set_speed failed:', e);
    }
  };

  const handleSetLoop = async (enabled: boolean) => {
    try {
      const actual: boolean = await invoke('set_loop', { enabled });
      setLoopEnabled(actual);
    } catch (e) {
      console.error('set_loop failed:', e);
    }
  };

  const handleStepForward = async () => {
    try {
      const frame: FrameInfo | null = await invoke('step_forward');
      if (frame) {
        setFrames(prev => {
          const lastTs = prev.length > 0 ? prev[prev.length - 1].timestamp : 0;
          if (frame.timestamp > lastTs) {
            return [...prev, frame];
          }
          return [...prev, frame];
        });
      }
    } catch (e) {
      console.error('step_forward failed:', e);
    }
  };

  const handleStepBack = async () => {
    try {
      const frame: FrameInfo | null = await invoke('step_back');
      if (frame) {
        setFrames(prev => {
          // Replace frames from this timestamp onwards
          const idx = prev.findIndex(f => f.timestamp >= frame.timestamp);
          if (idx >= 0) {
            return [...prev.slice(0, idx), frame];
          }
          return [frame];
        });
      }
    } catch (e) {
      console.error('step_back failed:', e);
    }
  };

  const handleRefreshPlaylist = async () => {
    try {
      const info: PlaylistInfo | null = await invoke('playlist_get_files');
      if (info) {
        setMetadata(info);
      }
    } catch (e) {
      console.error('playlist_get_files failed:', e);
    }
  };

  return (
    <div class="app-layout">
      {project() && (
        <Ribbon
          projectLoaded={project() !== null}
          playbackState={playbackState()}
          online={online()}
          onToggleOnline={() => {}}
          onStart={() => handlePlaybackControl('play')}
          onStop={() => handlePlaybackControl('stop')}
          onOpenChannelConfig={() => {}}
          onOpenDatabaseManager={handleOpenDatabaseManager}
          onOpenResourceManager={() => windowManager.togglePanel('resource-manager')}
          onOpenSendPanel={() => windowManager.togglePanel('message-send')}
          onOpenMonitorPanel={() => windowManager.togglePanel('frame-monitor')}
          onOpenChartPanel={() => windowManager.togglePanel('chart')}
          onOpenRecorder={() => {}}
          onStartRecord={() => {}}
          onStopRecord={() => {}}
          onOpenPlayback={() => windowManager.togglePanel('playback')}
          onOpenUds={() => {}}
          onOpenObd={() => {}}
          onOpenEcuFlash={() => {}}
          onNewProject={handleNewProject}
          onOpenProject={handleOpenProject}
          onSaveProject={handleSaveProject}
          onSaveProjectAs={handleSaveProjectAs}
          onCloseProject={handleCloseProject}
          onOpenRecent={handleOpenRecent}
        />
      )}
      <main class="main-content">
        {error() && (
          <div class="error-bar">{error()}</div>
        )}
        {loading() ? (
          <div class="loading">Loading project...</div>
        ): (hasSource() || project() !== null) ? (
          <div
            ref={setWorkspaceEl}
            class="workspace"
            onMouseMove={(e) => {
              windowManager.onDrag(e);
              windowManager.onResize(e);
            }}
            onMouseUp={() => {
              windowManager.endDrag();
              windowManager.endResize();
            }}
          >
            {/* Snap preview overlay */}
            {windowManager.snapPreview() && (
              <div
                class="snap-preview"
                style={{
                  left: `${windowManager.snapPreview()!.rect.x}px`,
                  top: `${windowManager.snapPreview()!.rect.y}px`,
                  width: `${windowManager.snapPreview()!.rect.width}px`,
                  height: `${windowManager.snapPreview()!.rect.height}px`,
                }}
              />
            )}
            {/* Rendered panels as floating windows */}
            {windowManager.visiblePanels().map((panel) => {
              const panelContent = (() => {
                switch (panel.id) {
                  case 'resource-manager':
                    return (
                      <ResourceManager
                        dbcTree={dbcTree()}
                        projectName={project()?.name ?? '未命名'}
                        dbcBindings={project()?.dbcBindings ?? []}
                        canLogPath={project()?.canLogPath ?? null}
                        visiblePanels={windowManager.visiblePanels()}
                        minimizedPanels={windowManager.minimizedPanels()}
                        onSelectMessage={handleSelectMessage}
                        onActivatePanel={(id) => windowManager.setActivePanel(id)}
                      />
                    );
                  case 'dbc-tree':
                    return (
                      <SignalTree
                        tree={dbcTree()}
                        onSelectMessage={handleSelectMessage}
                        selectedCanId={selectedCanId()}
                        onSelectSignal={handleAddSignal}
                        onRemoveSignal={handleRemoveSignal}
                        chartSignals={chartSignals()}
                      />
                    );
                  case 'signal-decode':
                    return (
                      <div class="mock-panel">
                        <div class="mock-panel__placeholder">
                          选择一个信号查看解析详情
                        </div>
                      </div>
                    );
                  case 'frame-monitor':
                    return (
                      <FrameTable
                        frames={filteredFrames()}
                        totalFrameCount={frames().length}
                        hasDbc={dbcTree() !== null}
                        projectName={project()?.name ?? '未命名'}
                        busType={metadata()?.files?.[0]?.busType}
                        startTime={metadata()?.files?.[0]?.startTime}
                        onClear={() => setFrames([])}
                        onSelectMessage={handleSelectMessage}
                        onFilterByCanId={(canId: number) => setFilter({ canId: '0x' + canId.toString(16).toUpperCase(), timeStart: '', timeEnd: '' })}
                      />
                    );
                  case 'chart':
                    return (
                      <SignalChart
                        frames={frames()}
                        signals={chartSignals()}
                        onRemoveSignal={handleRemoveSignal}
                      />
                    );
                  case 'message-send':
                    return (
                      <div class="mock-panel">
                        <div class="mock-panel__placeholder">
                          报文发送 — 功能开发中
                        </div>
                      </div>
                    );
                  case 'statistics':
                    return (
                      <div class="mock-panel">
                        <div class="mock-panel__placeholder">
                          统计信息 — 功能开发中
                        </div>
                      </div>
                    );
                  case 'log':
                    return (
                      <div class="mock-panel">
                        <div class="mock-panel__placeholder">
                          日志 — 功能开发中
                        </div>
                      </div>
                    );
                  case 'playback':
                    return (
                      <PlaybackPanel
                        playlistInfo={metadata()}
                        playbackState={playbackState()}
                        speed={speed()}
                        loopEnabled={loopEnabled()}
                        onPlaybackControl={handlePlaybackControl}
                        onSetSpeed={handleSetSpeed}
                        onSetLoop={handleSetLoop}
                        onStepForward={handleStepForward}
                        onStepBack={handleStepBack}
                        onSeek={handleSeek}
                        onRefreshPlaylist={handleRefreshPlaylist}
                      />
                    );
                  default:
                    return null;
                }
              })();

              return (
                <FloatingWindow
                  panel={panel}
                  isDragging={windowManager.draggingPanelId() === panel.id}
                  visiblePanelCount={windowManager.visiblePanels().length}
                  titleIcon={
                    panel.id === 'frame-monitor' ? <Radio size={14} /> :
                    panel.id === 'playback' ? <FilePlay size={14} /> :
                    undefined
                  }
                  onMouseDown={(e) => windowManager.startDrag(e, panel.id)}
                  onMinimize={() => windowManager.minimizePanel(panel.id)}
                  onMaximize={() => windowManager.toggleMaximize(panel.id)}
                  onClose={() => windowManager.closePanel(panel.id)}
                  onCloseOther={() => {
                    const visible = windowManager.visiblePanels();
                    for (const p of visible) {
                      if (p.id !== panel.id) windowManager.closePanel(p.id);
                    }
                  }}
                  onCloseAll={() => {
                    const visible = windowManager.visiblePanels();
                    for (const p of visible) {
                      windowManager.closePanel(p.id);
                    }
                  }}
                  onPopOut={() => windowManager.popOutPanel(panel.id)}
                  onResizeStart={(e, dir) => windowManager.startResize(e, panel.id, dir)}
                  onActivate={() => windowManager.setActivePanel(panel.id)}
                >
                  {panelContent}
                </FloatingWindow>
              );
            })}
            {/* Minimized windows taskbar */}
            <WindowTaskbar
              panels={windowManager.minimizedPanels()}
              onRestore={(id) => windowManager.restorePanel(id)}
            />
          </div>
        ) : (
          <WelcomeScreen
            onNewProject={handleNewProject}
            onOpenProject={handleOpenProject}
            onOpenRecent={handleOpenRecent}
            onRemoveRecent={handleRemoveRecent}
          />
        )}
      </main>
      {showNewProjectDialog() && (
        <NewProjectDialog
          onConfirm={handleConfirmNewProject}
          onCancel={() => setShowNewProjectDialog(false)}
        />
      )}
      {showUnsavedDialog() && (
        <ConfirmDialog
          title="未保存的更改"
          message={`工程 "${project()?.name ?? '未命名'}" 有未保存的更改，是否在关闭前保存？`}
          buttons={[
            {
              label: '保存并关闭',
              kind: 'primary',
              onClick: handleSaveAndClose,
            },
            {
              label: '放弃',
              kind: 'danger',
              onClick: handleDiscardAndClose,
            },
            {
              label: '取消',
              kind: 'secondary',
              onClick: () => {
                isWindowClosing = false;
                setShowUnsavedDialog(false);
              },
            },
          ]}
        />
      )}
      {showDatabaseManager() && (
        <DatabaseManagerDialog
          initialBindings={project()?.dbcBindings ?? []}
          onConfirm={handleDatabaseManagerConfirm}
        />
      )}
      <StatusBar
        sourceLoaded={hasSource()}
        metadata={metadata()}
        frameCount={filteredFrames().length}
        totalFrameCount={frames().length}
        playbackState={playbackState()}
      />
    </div>
  );
}

export default App;
import { createSignal, createMemo, onCleanup, onMount } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import Toolbar from './components/Toolbar';
import FilterBar from './components/FilterBar';
import SignalTree from './components/SignalTree';
import FrameTable from './components/FrameTable';
import SignalChart from './components/SignalChart';
import Timeline from './components/Timeline';
import StatusBar from './components/StatusBar';
import WelcomeScreen from './components/WelcomeScreen';
import NewProjectDialog, { type NewProjectConfig } from './components/NewProjectDialog';
import ConfirmDialog from './components/ConfirmDialog';
import type {
  OpenResult,
  PlaybackState,
  FrameInfo,
  FileMetadata,
  FilterConfig,
  DbcTreeInfo,
  ChartSignal,
  ProjectInfo,
} from './types';
import { matchesFilter } from './types';
import './App.css';

function App() {
  const [project, setProject] = createSignal<ProjectInfo | null>(null);
  const [metadata, setMetadata] = createSignal<FileMetadata | null>(null);
  const [frames, setFrames] = createSignal<FrameInfo[]>([]);
  const [playbackState, setPlaybackState] = createSignal<PlaybackState>('stopped');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [filter, setFilter] = createSignal<FilterConfig>({ canId: '', timeStart: '', timeEnd: '' });
  const [dbcTree, setDbcTree] = createSignal<DbcTreeInfo | null>(null);
  const [selectedCanId, setSelectedCanId] = createSignal<number | null>(null);
  const [chartSignals, setChartSignals] = createSignal<ChartSignal[]>([]);
  const [speed, setSpeed] = createSignal(1);
  const [panelWidth, setPanelWidth] = createSignal(260);
  const [chartHeight, setChartHeight] = createSignal(200);
  const [showNewProjectDialog, setShowNewProjectDialog] = createSignal(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = createSignal(false);
  let isWindowClosing = false;

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

  const loadFileData = async () => {
    stopPolling();
    setLoading(true);
    setError(null);
    setDbcTree(null);
    setSelectedCanId(null);
    setChartSignals([]);

    try {
      const result: OpenResult = await invoke('open_file', { path: '' });
      if (result.metadata) {
        setMetadata(result.metadata);
        setFrames(result.frames);
      }
      setPlaybackState('stopped');
    } catch (e) {
      const msg = String(e);
      setError(msg);
      console.error('Failed to open file:', e);
    } finally {
      setLoading(false);
    }
  };

  onMount(async () => {
    try {
      const state: string = await invoke('get_playback_state');
      if (state !== 'stopped') {
        const progress: number | null = await invoke('get_progress');
        if (progress !== null) {
          loadFileData();
        }
      }
    } catch {
      // No active project on startup is normal
    }

    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
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

  const handleRemoveRecent = async (_path: string) => {
    // Recent projects are managed server-side via add_to_recent
    // The list will refresh on next WelcomeScreen mount
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
        const result: OpenResult = await invoke('open_file', { path: proj.canLogPath });
        setMetadata(result.metadata);
        setFrames(result.frames);
        setPlaybackState('stopped');
      }

      if (proj.uiLayout) {
        setPanelWidth(proj.uiLayout.panelWidth);
        setChartHeight(proj.uiLayout.chartHeight);
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

      if (proj.dbcPaths.length > 0) {
        for (const dbcPath of proj.dbcPaths) {
          try {
            await invoke('load_dbc', { path: dbcPath });
            const tree: DbcTreeInfo | null = await invoke('get_dbc_info');
            if (tree) {
              setDbcTree(tree);
              break;
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
        panelWidth: panelWidth(),
        chartHeight: chartHeight(),
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

  const handleFileOpen = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        title: 'Open CAN Log File',
        filters: [
          { name: 'CAN Log Files', extensions: ['asc', 'csv'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!selected) return;
      if (typeof selected !== 'string') return;

      setLoading(true);
      setError(null);
      setDbcTree(null);
      setSelectedCanId(null);
      setChartSignals([]);
      stopPolling();
      setFrames([]);

      const result: OpenResult = await invoke('open_file', { path: selected });
      setMetadata(result.metadata);
      setFrames(result.frames);
      setPlaybackState('stopped');

      await invoke('set_project_can_log', { canLogPath: selected });

      setProject(prev => prev ? { ...prev, canLogPath: selected } : null);
    } catch (e) {
      setError(String(e));
      console.error('Failed to open CAN log:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDbc = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        filters: [
          { name: 'DBC Files', extensions: ['dbc'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!selected || typeof selected !== 'string') return;

      const result: string = await invoke('load_dbc', { path: selected });
      console.log(result);

      const tree: DbcTreeInfo | null = await invoke('get_dbc_info');
      setDbcTree(tree);
    } catch (e) {
      console.error('Failed to load DBC:', e);
      setError(String(e));
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
    if (chartHeight() < 100) setChartHeight(200);
  };

  const handleRemoveSignal = (s: ChartSignal) => {
    setChartSignals(prev => prev.filter(x => !(x.canId === s.canId && x.signalName === s.signalName)));
  };

  const handleSpeedChange = async (newSpeed: number) => {
    setSpeed(newSpeed);
    try {
      await invoke('set_speed', { speed: newSpeed });
    } catch (e) {
      console.error('set_speed failed:', e);
    }
    if (playbackState() === 'playing') {
      stopPolling();
      startPolling();
    }
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

  onMount(() => {
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
  });

  let isDraggingH = false;
  let isDraggingV = false;

  const startResizeH = (_e: MouseEvent) => {
    isDraggingH = true;
    const onMove = (e: MouseEvent) => {
      if (isDraggingH) setPanelWidth(Math.max(180, Math.min(500, e.clientX)));
    };
    const onUp = () => {
      isDraggingH = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const startResizeV = (_e: MouseEvent) => {
    isDraggingV = true;
    const onMove = (e: MouseEvent) => {
      if (isDraggingV) {
        const rect = document.querySelector('.frame-panel')?.getBoundingClientRect();
        if (rect) setChartHeight(Math.max(80, rect.bottom - e.clientY));
      }
    };
    const onUp = () => {
      isDraggingV = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div class="app-layout">
      <Toolbar
        project={project()}
        onFileOpen={handleFileOpen}
        onLoadDbc={handleLoadDbc}
        sourceLoaded={hasSource()}
        playbackState={playbackState()}
        onPlaybackControl={handlePlaybackControl}
        speed={speed()}
        onSpeedChange={handleSpeedChange}
        onSaveProject={handleSaveProject}
        onSaveProjectAs={handleSaveProjectAs}
        onCloseProject={handleCloseProject}
      />
      {hasSource() && (
        <>
          <FilterBar
            filter={filter()}
            onFilterChange={setFilter}
            visible={hasSource()}
          />
          <Timeline
            duration={metadata()?.duration ?? null}
            currentTime={currentTime()}
            onSeek={handleSeek}
            disabled={!hasSource()}
          />
        </>
      )}
      <main class="main-content">
        {error() && (
          <div class="error-bar">{error()}</div>
        )}
        {loading() ? (
          <div class="loading">Loading project...</div>
        ) : hasSource() ? (
          <div class="split-layout-h">
            <div class="signal-panel" style={{ width: panelWidth() + 'px' }}>
              <SignalTree
                tree={dbcTree()}
                onSelectMessage={handleSelectMessage}
                selectedCanId={selectedCanId()}
                onSelectSignal={handleAddSignal}
                onRemoveSignal={handleRemoveSignal}
                chartSignals={chartSignals()}
              />
            </div>
            <div class="panel-resizer-h" onMouseDown={startResizeH} />
            <div class="frame-panel">
              <div class="table-area" style={{ flex: 1, 'min-height': '0' }}>
                <FrameTable frames={filteredFrames()} />
              </div>
              <div class="panel-resizer-v" onMouseDown={startResizeV} />
              <div class="chart-area" style={{ height: chartHeight() + 'px', 'flex-shrink': '0' }}>
                <SignalChart
                  frames={frames()}
                  signals={chartSignals()}
                  onRemoveSignal={handleRemoveSignal}
                />
              </div>
            </div>
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
          title="Unsaved Changes"
          message={`Do you want to save changes to "${project()?.name ?? 'Untitled'}" before closing?`}
          buttons={[
            {
              label: 'Save & Close',
              kind: 'primary',
              onClick: handleSaveAndClose,
            },
            {
              label: 'Discard',
              kind: 'danger',
              onClick: handleDiscardAndClose,
            },
            {
              label: 'Cancel',
              kind: 'secondary',
              onClick: () => {
                isWindowClosing = false;
                setShowUnsavedDialog(false);
              },
            },
          ]}
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
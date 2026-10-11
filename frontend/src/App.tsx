import { createSignal, createMemo, onCleanup } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import Toolbar from './components/Toolbar';
import FilterBar from './components/FilterBar';
import SignalTree from './components/SignalTree';
import FrameTable from './components/FrameTable';
import SignalChart from './components/SignalChart';
import StatusBar from './components/StatusBar';
import type { OpenResult, PlaybackState, FrameInfo, FileMetadata, FilterConfig, DbcTreeInfo, ChartSignal } from './types';
import { matchesFilter } from './types';
import './App.css';

function App() {
  const [metadata, setMetadata] = createSignal<FileMetadata | null>(null);
  const [frames, setFrames] = createSignal<FrameInfo[]>([]);
  const [playbackState, setPlaybackState] = createSignal<PlaybackState>('stopped');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [filter, setFilter] = createSignal<FilterConfig>({ canId: '', timeStart: '', timeEnd: '' });
  const [dbcTree, setDbcTree] = createSignal<DbcTreeInfo | null>(null);
  const [selectedCanId, setSelectedCanId] = createSignal<number | null>(null);
  const [chartSignals, setChartSignals] = createSignal<ChartSignal[]>([]);
  const [panelWidth, setPanelWidth] = createSignal(260);
  const [chartHeight, setChartHeight] = createSignal(200);

  const filteredFrames = createMemo<FrameInfo[]>(() => {
    const f = filter();
    if (!f.canId && !f.timeStart && !f.timeEnd) return frames();
    return frames().filter(frame => matchesFilter(frame, f));
  });

  let playbackTimer: ReturnType<typeof setInterval> | null = null;

  const startPolling = () => {
    if (playbackTimer) return;
    playbackTimer = setInterval(async () => {
      try {
        const batch: FrameInfo[] = await invoke('get_batch');
        if (batch.length > 0) {
          setFrames(prev => [...prev, ...batch]);
        }
      } catch (e) {
        console.error('get_batch failed:', e);
      }
    }, 100);
  };

  const stopPolling = () => {
    if (playbackTimer) {
      clearInterval(playbackTimer);
      playbackTimer = null;
    }
  };

  onCleanup(() => stopPolling());

  const handleFileOpen = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        filters: [
          { name: 'CAN Log Files', extensions: ['asc', 'csv'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!selected) return;
      if (typeof selected !== 'string') return;

      stopPolling();
      setLoading(true);
      setError(null);
      setDbcTree(null);
      setSelectedCanId(null);
      setChartSignals([]);

      const result: OpenResult = await invoke('open_file', { path: selected });
      setMetadata(result.metadata);
      setFrames(result.frames);
      setPlaybackState('stopped');
      setLoading(false);
    } catch (e) {
      setLoading(false);
      const msg = String(e);
      setError(msg);
      console.error('Failed to open file:', e);
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
        onFileOpen={handleFileOpen}
        onLoadDbc={handleLoadDbc}
        sourceLoaded={hasSource()}
        playbackState={playbackState()}
        onPlaybackControl={handlePlaybackControl}
      />
      <FilterBar
        filter={filter()}
        onFilterChange={setFilter}
        visible={hasSource()}
      />
      <main class="main-content">
        {error() && (
          <div class="error-bar">{error()}</div>
        )}
        {loading() ? (
          <div class="loading">Loading file...</div>
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
          <div class="welcome">
            <h1>CanScope</h1>
            <p>Cross-platform CAN bus analysis tool</p>
            <button class="btn-open" onClick={handleFileOpen}>
              Open CAN Log File
            </button>
          </div>
        )}
      </main>
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
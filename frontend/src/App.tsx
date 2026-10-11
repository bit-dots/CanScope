import { createSignal, createMemo, onCleanup } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import Toolbar from './components/Toolbar';
import FilterBar from './components/FilterBar';
import SignalTree from './components/SignalTree';
import FrameTable from './components/FrameTable';
import StatusBar from './components/StatusBar';
import type { OpenResult, PlaybackState, FrameInfo, FileMetadata, FilterConfig, DbcTreeInfo } from './types';
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
  const [panelWidth, setPanelWidth] = createSignal(260);

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

  let isDragging = false;
  const startResize = (_e: MouseEvent) => {
    isDragging = true;
    const onMove = (e: MouseEvent) => {
      if (isDragging) {
        const w = Math.max(180, Math.min(500, e.clientX));
        setPanelWidth(w);
      }
    };
    const onUp = () => {
      isDragging = false;
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
          <div class="split-layout">
            <div class="signal-panel" style={{ width: panelWidth() + 'px' }}>
              <SignalTree
                tree={dbcTree()}
                onSelectMessage={handleSelectMessage}
                selectedCanId={selectedCanId()}
              />
            </div>
            <div
              class="panel-resizer"
              onMouseDown={startResize}
            />
            <div class="frame-panel">
              <FrameTable frames={filteredFrames()} />
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
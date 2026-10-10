import { createSignal, onCleanup } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import Toolbar from './components/Toolbar';
import FrameTable from './components/FrameTable';
import StatusBar from './components/StatusBar';
import type { OpenResult, PlaybackState, FrameInfo, FileMetadata } from './types';
import './App.css';

function App() {
  const [metadata, setMetadata] = createSignal<FileMetadata | null>(null);
  const [frames, setFrames] = createSignal<FrameInfo[]>([]);
  const [playbackState, setPlaybackState] = createSignal<PlaybackState>('stopped');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

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

  return (
    <div class="app-layout">
      <Toolbar
        onFileOpen={handleFileOpen}
        sourceLoaded={hasSource()}
        playbackState={playbackState()}
        onPlaybackControl={handlePlaybackControl}
      />
      <main class="main-content">
        {error() && (
          <div class="error-bar">{error()}</div>
        )}
        {loading() ? (
          <div class="loading">Loading file...</div>
        ) : hasSource() ? (
          <FrameTable frames={frames()} />
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
        frameCount={frames().length}
        playbackState={playbackState()}
      />
    </div>
  );
}

export default App;
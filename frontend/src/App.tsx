import { createSignal } from 'solid-js';
import Toolbar from './components/Toolbar';
import StatusBar from './components/StatusBar';
import './App.css';

function App() {
  const [sourceLoaded, setSourceLoaded] = createSignal(false);

  const handleFileOpen = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        filters: [
          { name: 'CAN Log Files', extensions: ['asc', 'csv'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (selected) {
        setSourceLoaded(true);
      }
    } catch (e) {
      console.warn('Tauri dialog not available (browser mode):', e);
    }
  };

  return (
    <div class="app-layout">
      <Toolbar onFileOpen={handleFileOpen} sourceLoaded={sourceLoaded()} />
      <main class="main-content">
        {sourceLoaded() ? (
          <div class="placeholder">Frame data will be displayed here</div>
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
      <StatusBar sourceLoaded={sourceLoaded()} />
    </div>
  );
}

export default App;
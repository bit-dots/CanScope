import { Component, onMount, createSignal } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import './PanelPopout.css';

interface PanelPopoutProps {
  panelId: string;
}

const panelTitles: Record<string, string> = {
  'dbc-tree': 'DBC 信号树',
  'signal-decode': '信号解析',
  'frame-monitor': '报文监控',
  'chart': '图形曲线',
  'message-send': '报文发送',
  'statistics': '统计信息',
  'log': '日志',
  'resource-manager': '资源管理',
};

export const PanelPopout: Component<PanelPopoutProps> = (props) => {
  const [dataReady, setDataReady] = createSignal(false);

  onMount(async () => {
    try {
      const unlisten = await listen('popout-data-ready', () => {
        setDataReady(true);
      });
      return () => { unlisten(); };
    } catch {
      setDataReady(true);
    }
  });

  const title = () => panelTitles[props.panelId] ?? props.panelId;

  return (
    <div class="popout-container">
      <div class="popout-panel">
        <div class="popout-panel__header">
          <span class="popout-panel__title">{title()}</span>
        </div>
        <div class="popout-panel__content">
          <div class="popout-panel__placeholder">
            <div class="popout-panel__placeholder-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="9" x2="15" y2="15" />
                <line x1="15" y1="9" x2="9" y2="15" />
              </svg>
            </div>
            <p class="popout-panel__placeholder-text">
              {title()} — 独立窗口
            </p>
            <p class="popout-panel__placeholder-hint">
              {dataReady() ? '面板已就绪' : '面板数据正在从主窗口同步...'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
import { Component, createSignal, For } from 'solid-js';
import RibbonGroup from './RibbonGroup';
import RibbonButton from './RibbonButton';
import Backstage from './Backstage';
import './Ribbon.css';

/* ============================================
   Inline SVG Icons
   ============================================ */
const IconOnline: Component = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="22" y2="12" />
  </svg>
);

const IconPlay: Component = () => (
  <svg viewBox="0 0 24 24">
    <polygon points="6,3 20,12 6,21" />
  </svg>
);

const IconStop: Component = () => (
  <svg viewBox="0 0 24 24">
    <rect x="5" y="5" width="14" height="14" rx="1" />
  </svg>
);

const IconChannel: Component = () => (
  <svg viewBox="0 0 24 24">
    <line x1="4" y1="8" x2="10" y2="8" />
    <circle cx="14" cy="8" r="3" />
    <line x1="18" y1="8" x2="20" y2="8" />
    <line x1="4" y1="16" x2="8" y2="16" />
    <circle cx="12" cy="16" r="3" />
    <line x1="16" y1="16" x2="20" y2="16" />
  </svg>
);

const IconImport: Component = () => (
  <svg viewBox="0 0 24 24">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5-6z" />
    <polyline points="14 3 14 9 20 9" />
    <line x1="12" y1="12" x2="12" y2="18" />
    <polyline points="9 15 12 18 15 15" />
  </svg>
);

const IconSend: Component = () => (
  <svg viewBox="0 0 24 24">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IconMonitor: Component = () => (
  <svg viewBox="0 0 24 24">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const IconChart: Component = () => (
  <svg viewBox="0 0 24 24">
    <polyline points="3 20 9 12 13 16 21 6" />
    <polyline points="17 6 21 6 21 10" />
  </svg>
);

const IconRecord: Component = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconPlayback: Component = () => (
  <svg viewBox="0 0 24 24">
    <polygon points="3 5 3 19 16 12" />
    <line x1="19" y1="6" x2="19" y2="18" />
  </svg>
);

const IconUds: Component = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="14" rx="2" />
    <line x1="7" y1="8" x2="17" y2="8" />
    <line x1="7" y1="12" x2="15" y2="12" />
    <circle cx="6" cy="21" r="2" />
    <circle cx="18" cy="21" r="2" />
  </svg>
);

const IconObd: Component = () => (
  <svg viewBox="0 0 24 24">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

const IconEcu: Component = () => (
  <svg viewBox="0 0 24 24">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <polyline points="8 12 11 15 16 9" />
  </svg>
);

const IconDatabase: Component = () => (
  <svg viewBox="0 0 24 24">
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
    <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
  </svg>
);

const IconResource: Component = () => (
  <svg viewBox="0 0 24 24">
    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2l-1-2H8L7 7H5a2 2 0 0 0-2 2z" />
    <path d="M12 11v7" />
    <path d="M9 14h6" />
  </svg>
);

/* ============================================
   Ribbon Tab Definitions
   ============================================ */
interface RibbonTabDef {
  id: string;
  label: string;
}

const TABS: RibbonTabDef[] = [
  { id: 'file', label: '文件' },
  { id: 'project', label: '项目' },
  { id: 'analysis', label: '分析' },
  { id: 'calibration', label: '标定' },
  { id: 'diagnosis', label: '诊断' },
  { id: 'simulation', label: '仿真' },
  { id: 'acquisition', label: '采集' },
  { id: 'view', label: '视图' },
  { id: 'tools', label: '工具' },
  { id: 'help', label: '帮助' },
];

/* ============================================
   Ribbon Props
   ============================================ */
export interface RibbonProps {
  online: boolean;
  playbackState: 'playing' | 'paused' | 'stopped';
  projectLoaded: boolean;
  onToggleOnline: () => void;
  onStart: () => void;
  onStop: () => void;
  onOpenChannelConfig: () => void;
  onOpenDatabaseManager: () => void;
  onOpenResourceManager: () => void;
  onOpenSendPanel: () => void;
  onOpenMonitorPanel: () => void;
  onOpenChartPanel: () => void;
  onOpenRecorder: () => void;
  onStartRecord: () => void;
  onStopRecord: () => void;
  onOpenPlayback: () => void;
  onOpenUds: () => void;
  onOpenObd: () => void;
  onOpenEcuFlash: () => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  onCloseProject: () => void;
}

const Ribbon: Component<RibbonProps> = (props) => {
  const [activeTab, setActiveTab] = createSignal('analysis');
  const [backstageVisible, setBackstageVisible] = createSignal(false);

  const handleTabClick = (tabId: string) => {
    if (tabId === 'file') {
      setBackstageVisible(!backstageVisible());
    } else {
      setBackstageVisible(false);
      setActiveTab(tabId);
    }
  };

  const handleCloseBackstage = () => {
    setBackstageVisible(false);
  };

  return (
    <div class="ribbon">
      {/* ---- Tab Row ---- */}
      <div class="ribbon__tabs">
        <For each={TABS}>
          {(tab) => (
            <button
              class="ribbon__tab"
              classList={{
                'ribbon__tab--active': tab.id !== 'file' && activeTab() === tab.id,
                'ribbon__tab--file': tab.id === 'file',
              }}
              onClick={() => handleTabClick(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>

      {/* ---- Content Area ---- */}
      <div class="ribbon__content">
        {/* 项目 */}
        {activeTab() === 'project' && (
          <div class="ribbon__groups">
            <RibbonGroup label="项目资源">
              <RibbonButton icon={<IconResource />} label="资源管理器" onClick={props.onOpenResourceManager} />
              <RibbonButton icon={<IconDatabase />} label="数据库" onClick={props.onOpenDatabaseManager} />
            </RibbonGroup>
          </div>
        )}

        {/* 分析 */}
        {activeTab() === 'analysis' && (
          <div class="ribbon__groups">
            <RibbonGroup label="连接/测量">
              <RibbonButton icon={<IconOnline />} label="在线" active={props.online} onClick={props.onToggleOnline} />
              <RibbonButton icon={<IconPlay />} label="启动" onClick={props.onStart} disabled={props.playbackState === 'playing'} />
              <RibbonButton icon={<IconStop />} label="停止" onClick={props.onStop} disabled={props.playbackState === 'stopped'} />
              <RibbonButton icon={<IconChannel />} label="通道" onClick={props.onOpenChannelConfig} dropdown />
            </RibbonGroup>

            <RibbonGroup label="报文">
              <RibbonButton icon={<IconSend />} label="报文发送" onClick={props.onOpenSendPanel} />
              <RibbonButton icon={<IconMonitor />} label="报文监控" onClick={props.onOpenMonitorPanel} />
              <RibbonButton icon={<IconChart />} label="曲线" onClick={props.onOpenChartPanel} />
            </RibbonGroup>

            <RibbonGroup label="记录与回放">
              <RibbonButton icon={<IconRecord />} label="记录器" onClick={props.onOpenRecorder} />
              <RibbonButton icon={<IconRecord />} label="开始记录" onClick={props.onStartRecord} />
              <RibbonButton icon={<IconStop />} label="停止记录" onClick={props.onStopRecord} />
              <RibbonButton icon={<IconPlayback />} label="数据回放" onClick={props.onOpenPlayback} />
            </RibbonGroup>
          </div>
        )}

        {/* 诊断 */}
        {activeTab() === 'diagnosis' && (
          <div class="ribbon__groups">
            <RibbonGroup label="诊断">
              <RibbonButton icon={<IconUds />} label="UDS 诊断" onClick={props.onOpenUds} />
              <RibbonButton icon={<IconObd />} label="OBD 诊断" onClick={props.onOpenObd} />
              <RibbonButton icon={<IconEcu />} label="ECU 刷写" onClick={props.onOpenEcuFlash} />
            </RibbonGroup>
          </div>
        )}

        {/* 占位页签 */}
        <For each={['calibration', 'simulation', 'acquisition', 'tools', 'help']}>
          {(tabId) => (
            <div style={{ display: activeTab() === tabId ? 'flex' : 'none' }} class="ribbon__placeholder">
              {TABS.find(t => t.id === tabId)?.label} — 功能开发中
            </div>
          )}
        </For>

        {/* 视图页签 */}
        {activeTab() === 'view' && (
          <div class="ribbon__groups">
            <RibbonGroup label="布局预设">
              <RibbonButton icon={<IconMonitor />} label="默认布局" onClick={() => {}} />
              <RibbonButton icon={<IconChart />} label="分析布局" onClick={() => {}} />
              <RibbonButton icon={<IconSend />} label="调试布局" onClick={() => {}} />
            </RibbonGroup>
            <RibbonGroup label="布局管理">
              <RibbonButton icon={<IconImport />} label="保存布局" onClick={() => {}} />
              <RibbonButton icon={<IconImport />} label="管理布局" onClick={() => {}} />
            </RibbonGroup>
          </div>
        )}
      </div>

      {/* ---- Backstage Overlay ---- */}
      <Backstage
        visible={backstageVisible()}
        onClose={handleCloseBackstage}
        onNewProject={props.onNewProject}
        onOpenProject={props.onOpenProject}
        onSaveProject={props.onSaveProject}
        onSaveProjectAs={props.onSaveProjectAs}
        onCloseProject={props.onCloseProject}
        projectLoaded={props.projectLoaded}
      />
    </div>
  );
};

export default Ribbon;
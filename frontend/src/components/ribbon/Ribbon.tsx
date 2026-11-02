import { Component, createSignal, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Database, FilePlay, FolderOpen, ChartLine } from 'lucide-solid';
import RibbonGroup from './RibbonGroup';
import RibbonButton from './RibbonButton';
import Backstage from './Backstage';
import type { NewProjectTemplate } from '../../types';
import './Ribbon.css';

/* ============================================
   Inline SVG Icons
   ============================================ */
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

const IconOnline: Component = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="22" y2="12" />
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

const IconSend: Component = () => (
  <svg viewBox="0 0 24 24">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IconRecord: Component = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconMonitor: Component = () => (
  <svg viewBox="0 0 24 24">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
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
  playbackState: 'playing' | 'paused' | 'stopped';
  sourceLoaded: boolean;
  projectLoaded: boolean;
  online: boolean;
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
  onNewProject: (template: NewProjectTemplate) => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  onCloseProject: () => void;
  onOpenRecent: (path: string) => void;
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

  const updateScrollMasks = (el: HTMLElement) => {
    const atStart = el.scrollLeft <= 2;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    el.classList.toggle('ribbon__groups--mask-left', !atStart);
    el.classList.toggle('ribbon__groups--mask-right', !atEnd);
  };

  const handleGroupsScroll = (e: Event) => {
    updateScrollMasks(e.currentTarget as HTMLElement);
  };

  const groupsRef = (el: HTMLElement) => {
    if (el) updateScrollMasks(el);
  };

  return (
    <div class="ribbon">
      {/* ---- Tab Row ---- */}
      <div class="ribbon__tabs">
        <For each={TABS.filter((tab) => props.projectLoaded || tab.id === 'file')}>
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
      {props.projectLoaded && <div class="ribbon__content">
        {/* 项目 */}
        {activeTab() === 'project' && (
          <div class="ribbon__groups" onScroll={handleGroupsScroll} ref={groupsRef}>
            <RibbonGroup label="项目资源">
              <RibbonButton icon={<FolderOpen size={16} />} label="资源管理器" onClick={props.onOpenResourceManager} />
              <RibbonButton icon={<Database size={16} />} label="数据库" onClick={props.onOpenDatabaseManager} />
            </RibbonGroup>
          </div>
        )}

        {/* 分析 */}
        {activeTab() === 'analysis' && (
          <div class="ribbon__groups" onScroll={handleGroupsScroll} ref={groupsRef}>
            <RibbonGroup label="连接/测量">
              <RibbonButton icon={<IconOnline />} label="在线" active={props.online} onClick={props.onToggleOnline} />
              <RibbonButton icon={<IconPlay />} label="启动" onClick={props.onStart} disabled={!props.sourceLoaded || props.playbackState === 'playing'} />
              <RibbonButton icon={<IconStop />} label="停止" onClick={props.onStop} disabled={props.playbackState === 'stopped'} />
              <RibbonButton icon={<IconChannel />} label="通道" onClick={props.onOpenChannelConfig} dropdown />
            </RibbonGroup>

            <RibbonGroup label="报文">
              <RibbonButton icon={<IconSend />} label="报文发送" onClick={props.onOpenSendPanel} />
              <RibbonButton icon={<IconMonitor />} label="报文监控" onClick={props.onOpenMonitorPanel} />
              <RibbonButton icon={<ChartLine size={16} />} label="曲线" onClick={props.onOpenChartPanel} />
            </RibbonGroup>

            <RibbonGroup label="记录与回放">
              <RibbonButton icon={<IconRecord />} label="记录器" onClick={props.onOpenRecorder} />
              <RibbonButton icon={<IconRecord />} label="开始记录" onClick={props.onStartRecord} />
              <RibbonButton icon={<IconStop />} label="停止记录" onClick={props.onStopRecord} />
              <RibbonButton icon={<FilePlay size={16} />} label="数据回放" onClick={props.onOpenPlayback} />
            </RibbonGroup>
          </div>
        )}

        <For each={TABS.filter(tab => !['file', 'project', 'analysis'].includes(tab.id))}>
          {(tab) => activeTab() === tab.id && (
            <div class="ribbon__placeholder">
              {tab.label}功能开发中
            </div>
          )}
        </For>

      </div>}

      {/* ---- Backstage Overlay ---- */}
      <Portal>
        <Backstage
          visible={backstageVisible()}
          onClose={handleCloseBackstage}
          onNewProject={props.onNewProject}
          onOpenProject={props.onOpenProject}
          onSaveProject={props.onSaveProject}
          onSaveProjectAs={props.onSaveProjectAs}
          onCloseProject={props.onCloseProject}
          onOpenRecent={props.onOpenRecent}
          projectLoaded={props.projectLoaded}
        />
      </Portal>
    </div>
  );
};

export default Ribbon;
import { createSignal, createEffect, onCleanup, onMount, on, For, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import Ribbon from './components/ribbon/Ribbon';
import SignalTree from './components/SignalTree';
import FrameTable from './components/FrameTable';
import SignalChart from './components/SignalChart';
import StatusBar from './components/StatusBar';
import RuntimeLogPanel from './components/RuntimeLogPanel';
import Notifications from './components/Notifications';
import WelcomeScreen from './components/WelcomeScreen';
import { Radio, FilePlay, ChartLine } from 'lucide-solid';
import NewProjectDialog, { type NewProjectConfig } from './components/NewProjectDialog';
import SettingsPage from './components/SettingsPage';
import ConfirmDialog from './components/ConfirmDialog';
import FloatingWindow from './components/windowing/FloatingWindow';
import WindowTaskbar from './components/windowing/WindowTaskbar';
import { useWindowManager } from './components/windowing/useWindowManager';
import ResourceManager from './components/ResourceManager';
import PlaybackPanel from './components/PlaybackPanel';
import DatabaseManagerDialog from './components/DatabaseManagerDialog';
import type { AppNotification, EventLevel, RuntimeLogEntry } from './runtimeEvents';
import {
  loadRuntimeLogSettings,
  saveRuntimeLogSettings,
  type RuntimeLogSettings,
} from './runtimeLogSettings';
import {
  cacheMemoryLimitBytes,
  estimateFrameMemoryBytes,
  estimateFramesMemoryBytes,
  loadMeasurementSettings,
  saveMeasurementSettings,
  type MeasurementSettings,
} from './measurementSettings';
import type {
  LoopScope,
  PlaybackMode,
  PlaybackState,
  FrameInfo,
  PlaylistInfo,
  FilterConfig,
  DbcTreeInfo,
  ChartSignal,
  ProjectInfo,
  NewProjectTemplate,
  FramePage,
  FrameTableFilter,
} from './types';
import { parseCanId, parseTime } from './types';
import './App.css';

function retainNewestFrames(frames: FrameInfo[], byteLimit: number) {
  let start = frames.length;
  let bytes = 0;
  while (start > 0) {
    const frameBytes = estimateFrameMemoryBytes(frames[start - 1]);
    if (bytes + frameBytes > byteLimit) break;
    bytes += frameBytes;
    start--;
  }
  return { frames: frames.slice(start), bytes, dropped: start };
}

function retainOldestFrames(frames: FrameInfo[], byteLimit: number) {
  let end = 0;
  let bytes = 0;
  while (end < frames.length) {
    const frameBytes = estimateFrameMemoryBytes(frames[end]);
    if (bytes + frameBytes > byteLimit) break;
    bytes += frameBytes;
    end++;
  }
  return { frames: frames.slice(0, end), bytes, dropped: frames.length - end };
}

function App() {
  const [project, setProject] = createSignal<ProjectInfo | null>(null);
  const [metadata, setMetadata] = createSignal<PlaylistInfo | null>(null);
  const [frames, setFrames] = createSignal<FrameInfo[]>([]);
  const [frameOffset, setFrameOffset] = createSignal(0);
  const [frameTotalCount, setFrameTotalCount] = createSignal(0);
  const [frameTimeOrigin, setFrameTimeOrigin] = createSignal(0);
  const [traceMode, setTraceMode] = createSignal(false);
  const [playbackFrameCount, setPlaybackFrameCount] = createSignal(0);
  const [receivedFrameCount, setReceivedFrameCount] = createSignal(0);
  const [transmittedFrameCount, setTransmittedFrameCount] = createSignal(0);
  const [errorFrameCount, setErrorFrameCount] = createSignal(0);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [playbackState, setPlaybackState] = createSignal<PlaybackState>('stopped');
  const [frameMonitorRefreshRate, setFrameMonitorRefreshRate] = createSignal(5);
  const [measurementSettings, setMeasurementSettings] = createSignal(loadMeasurementSettings());
  const [estimatedCacheBytes, setEstimatedCacheBytes] = createSignal(0);
  const [availableMemoryBytes, setAvailableMemoryBytes] = createSignal<number | null>(null);
  const [automaticLimitBytes, setAutomaticLimitBytes] = createSignal<number | null>(null);
  const [memoryInfoError, setMemoryInfoError] = createSignal<string | null>(null);
  const [hiddenTraceFrames, setHiddenTraceFrames] = createSignal(0);
  const [cacheLimitReached, setCacheLimitReached] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [indexProgress, setIndexProgress] = createSignal<{
    path: string;
    status: string;
    processedFrames: number;
    message?: string | null;
  } | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [runtimeLogs, setRuntimeLogs] = createSignal<RuntimeLogEntry[]>([]);
  const [runtimeLogSettings, setRuntimeLogSettings] = createSignal<RuntimeLogSettings>(loadRuntimeLogSettings());
  const [runtimeLogPersistenceError, setRuntimeLogPersistenceError] = createSignal<string | null>(null);
  const [notifications, setNotifications] = createSignal<AppNotification[]>([]);
  const [notificationCenterOpen, setNotificationCenterOpen] = createSignal(false);
  const [logPanelOpen, setLogPanelOpen] = createSignal(false);
  const [filter, setFilter] = createSignal<FilterConfig>({ canId: '', timeStart: '', timeEnd: '' });
  const [dbcTree, setDbcTree] = createSignal<DbcTreeInfo | null>(null);
  const [selectedCanId, setSelectedCanId] = createSignal<number | null>(null);
  const [chartSignals, setChartSignals] = createSignal<ChartSignal[]>([]);
  const [speed, setSpeed] = createSignal(1);
  const [loopEnabled, setLoopEnabled] = createSignal(false);
  const [playbackMode, setPlaybackMode] = createSignal<PlaybackMode>('continuous');
  const [loopScope, setLoopScope] = createSignal<LoopScope>('all');
  const [showNewProjectDialog, setShowNewProjectDialog] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [stagingNewProjectWorkspace, setStagingNewProjectWorkspace] = createSignal(false);
  const [newProjectTemplate, setNewProjectTemplate] = createSignal<NewProjectTemplate>('can-analysis');
  const [showUnsavedDialog, setShowUnsavedDialog] = createSignal(false);
  const [showDatabaseManager, setShowDatabaseManager] = createSignal(false);
  let isWindowClosing = false;
  let nextRuntimeEventId = 1;
  let lastRuntimeLogWriteError: string | null = null;

  const recordRuntimeEvent = (
    level: EventLevel,
    source: string,
    message: string,
    details?: string,
    notify = false,
  ) => {
    const timestamp = Date.now();
    const id = nextRuntimeEventId++;
    const entry: RuntimeLogEntry = { id, timestamp, level, source, message, details };
    let merged = false;
    setRuntimeLogs((previous) => {
      const last = previous[previous.length - 1];
      if (
        last &&
        last.level === level &&
        last.source === source &&
        last.message === message &&
        timestamp - last.timestamp <= 5000
      ) {
        merged = true;
        return [
          ...previous.slice(0, -1),
          { ...last, timestamp, occurrences: (last.occurrences ?? 1) + 1 },
        ];
      }
      return [...previous, entry].slice(-runtimeLogSettings().cacheLimit);
    });
    const logSettings = runtimeLogSettings();
    if (logSettings.saveToFile && logSettings.filePath) {
      void invoke('append_runtime_log_file', { path: logSettings.filePath, entry })
        .then(() => {
          lastRuntimeLogWriteError = null;
          setRuntimeLogPersistenceError(null);
        })
        .catch((writeError) => {
          const message = String(writeError);
          setRuntimeLogPersistenceError(`写入日志文件失败：${message}`);
          console.error('Failed to append runtime log file:', writeError);
          if (lastRuntimeLogWriteError !== message) {
            lastRuntimeLogWriteError = message;
            const notification: AppNotification = {
              id: nextRuntimeEventId++,
              timestamp: Date.now(),
              level: 'error',
              source: '日志文件',
              message: '写入日志文件失败',
              details: message,
              read: false,
            };
            setNotifications((previous) => [notification, ...previous].slice(0, 100));
          }
        });
    }
    if (merged) return;
    if (!notify) return;

    setNotifications((previous) => [{ ...entry, read: false }, ...previous].slice(0, 100));
  };

  const dismissNotification = (id: number) => {
    setNotifications((previous) => previous.filter((item) => item.id !== id));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const toggleNotificationCenter = () => {
    const opening = !notificationCenterOpen();
    setNotificationCenterOpen(opening);
    if (opening) {
      setNotifications((previous) => previous.map((item) => ({ ...item, read: true })));
    }
  };

  const exportRuntimeLogs = () => {
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      ['时间', '等级', '来源', '消息', '重复次数', '详情'],
      ...runtimeLogs().map((entry) => [
        new Date(entry.timestamp).toISOString(),
        entry.level,
        entry.source,
        entry.message,
        String(entry.occurrences ?? 1),
        entry.details ?? '',
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `canscope-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  createEffect(on(error, (message, previous) => {
    if (message && message !== previous) {
      recordRuntimeEvent('error', '应用', message, undefined, true);
    }
  }));

  createEffect(on(availableMemoryBytes, (available, previous) => {
    const threshold = 1024 ** 3;
    if (
      available !== null &&
      available < threshold &&
      (previous === null || previous === undefined || previous >= threshold)
    ) {
      recordRuntimeEvent(
        'warning',
        '系统内存',
        '可用内存低于 1 GB',
        `当前可用内存：${(available / (1024 ** 2)).toFixed(0)} MB`,
        true,
      );
    }
  }));

  createEffect(on(cacheLimitReached, (reached) => {
    if (reached) {
      recordRuntimeEvent(
        'warning',
        '报文缓存',
        '缓存达到上限，回放已暂停',
        '清空监控缓存或调整缓存预算后，可继续回放。',
        true,
      );
    }
  }));

  const resetMonitorCounters = () => {
    setReceivedFrameCount(0);
    setTransmittedFrameCount(0);
    setErrorFrameCount(0);
  };

  const countMonitorFrames = (batch: FrameInfo[]) => {
    let received = 0;
    let transmitted = 0;
    let errors = 0;
    for (const frame of batch) {
      if (frame.is_tx) transmitted++;
      else received++;
      if (frame.is_error) errors++;
    }
    if (received > 0) setReceivedFrameCount((count) => count + received);
    if (transmitted > 0) setTransmittedFrameCount((count) => count + transmitted);
    if (errors > 0) setErrorFrameCount((count) => count + errors);
  };

  const currentCacheLimitBytes = () =>
    cacheMemoryLimitBytes(measurementSettings(), automaticLimitBytes());

  const applyCacheBudget = (limit: number, policy: MeasurementSettings['cacheFullPolicy']) => {
    const currentFrames = frames();
    if (estimatedCacheBytes() <= limit) return;

    if (policy === 'clear-all') {
      setFrames([]);
      setFrameOffset((offset) => offset + currentFrames.length);
      setEstimatedCacheBytes(0);
      setHiddenTraceFrames((count) => count + currentFrames.length);
      setCacheLimitReached(false);
      return;
    }

    const retained = retainNewestFrames(currentFrames, limit);
    if (retained.dropped === 0) return;
    setFrames(retained.frames);
    setFrameOffset((offset) => offset + retained.dropped);
    setEstimatedCacheBytes(retained.bytes);
    setHiddenTraceFrames((count) => count + retained.dropped);

    if (policy === 'stop-measurement' && playbackState() === 'playing') {
      setCacheLimitReached(true);
      pausePlaybackAtCacheLimit();
    }
  };

  const applyAutomaticLimit = (limit: number) => {
    setAutomaticLimitBytes(limit);
    frameQueryId++;
    applyCacheBudget(limit, measurementSettings().cacheFullPolicy);
  };

  const refreshAvailableMemory = async (recalculateLimit = false) => {
    const available = await invoke<number | null>('get_available_memory_bytes');
    setAvailableMemoryBytes(available);
    setMemoryInfoError(null);
    if (
      available !== null &&
      measurementSettings().automaticMemoryLimit &&
      (automaticLimitBytes() === null || recalculateLimit)
    ) {
      applyAutomaticLimit(Math.max(1024 * 1024, Math.floor(available * 0.9)));
    }
  };

  const openSettings = () => {
    setSettingsOpen(true);
    if (measurementSettings().automaticMemoryLimit) {
      void refreshAvailableMemory(true).catch((error) => {
        setMemoryInfoError(String(error));
        console.error('Failed to refresh available system memory:', error);
      });
    }
  };

  const PANEL_DEFS = [
    { id: 'resource-manager', title: '资源管理器', defaultVisible: true, defaultPosition: { x: 0, y: 0, width: 280, height: 600 } },
    { id: 'dbc-tree', title: 'DBC 信号树', defaultVisible: false, defaultPosition: { x: 340, y: 20, width: 300, height: 400 } },
    { id: 'signal-decode', title: '信号解析', defaultVisible: false, defaultPosition: { x: 340, y: 20, width: 300, height: 400 } },
    { id: 'frame-monitor', title: '报文监控', defaultVisible: false, defaultPosition: { x: 300, y: 0, width: 600, height: 400 } },
    { id: 'chart', title: '图形曲线', defaultVisible: false, defaultPosition: { x: 300, y: 360, width: 680, height: 380 } },
    { id: 'message-send', title: '报文发送', defaultVisible: false, defaultPosition: { x: 200, y: 100, width: 400, height: 350 } },
    { id: 'statistics', title: '统计信息', defaultVisible: false, defaultPosition: { x: 250, y: 120, width: 450, height: 380 } },
    { id: 'log', title: '日志', defaultVisible: false, defaultPosition: { x: 150, y: 80, width: 500, height: 300 } },
    { id: 'playback', title: '数据回放', defaultVisible: false, defaultPosition: { x: 300, y: 50, width: 700, height: 500 } },
  ];

  const [workspaceEl, setWorkspaceEl] = createSignal<HTMLElement | null>(null);
  const [workspaceViewportSize, setWorkspaceViewportSize] = createSignal({ width: 0, height: 0 });
  const windowManager = useWindowManager(PANEL_DEFS, workspaceEl);
  const workspaceCanvasSize = () => {
    const viewport = workspaceViewportSize();
    const panels = windowManager.visiblePanels();
    const minX = Math.min(0, ...panels.map((panel) => panel.window.rect.x));
    const minY = Math.min(0, ...panels.map((panel) => panel.window.rect.y));
    const maxX = Math.max(viewport.width, ...panels.map((panel) => panel.window.rect.x + panel.window.rect.width));
    const maxY = Math.max(viewport.height, ...panels.map((panel) => panel.window.rect.y + panel.window.rect.height));
    return {
      originX: minX,
      originY: minY,
      width: maxX - minX,
      height: maxY - minY,
      contentWidth: maxX,
      contentHeight: maxY,
    };
  };
  const restoreWorkspacePanel = (id: string) => {
    windowManager.restorePanel(id);
    requestAnimationFrame(() => {
      const workspace = workspaceEl();
      const panel = windowManager.visiblePanels().find((item) => item.id === id);
      if (!workspace || !panel) return;
      const { rect } = panel.window;
      const originX = Number(workspace.dataset.originX ?? 0);
      const originY = Number(workspace.dataset.originY ?? 0);
      const worldLeft = workspace.scrollLeft + originX;
      const worldTop = workspace.scrollTop + originY;
      const worldRight = worldLeft + workspace.clientWidth;
      const worldBottom = worldTop + workspace.clientHeight;
      const left = rect.x < worldLeft
        ? rect.x - originX
        : rect.x + rect.width > worldRight
          ? rect.x + rect.width - workspace.clientWidth - originX
          : workspace.scrollLeft;
      const top = rect.y < worldTop
        ? rect.y - originY
        : rect.y + rect.height > worldBottom
          ? rect.y + rect.height - workspace.clientHeight - originY
          : workspace.scrollTop;
      workspace.scrollTo({ left: Math.max(0, left), top: Math.max(0, top) });
    });
  };
  let layoutSaveTimeout: number | undefined;
  let projectGeneration = 0;
  let lastLayoutRevision = windowManager.layoutRevision();

  const cancelPendingLayoutSave = () => {
    if (layoutSaveTimeout !== undefined) {
      window.clearTimeout(layoutSaveTimeout);
      layoutSaveTimeout = undefined;
    }
  };

  const persistPanelLayout = async () => {
    const activeProject = project();
    if (!activeProject) return;
    await invoke('update_project_state', {
      uiLayout: {
        ...activeProject.uiLayout,
        panels: windowManager.getPanelLayouts(),
      },
    });
  };

  createEffect(() => {
    const revision = windowManager.layoutRevision();
    const activeProject = project();
    if (revision === lastLayoutRevision) return;
    lastLayoutRevision = revision;
    if (!activeProject || stagingNewProjectWorkspace()) return;

    cancelPendingLayoutSave();
    const generation = projectGeneration;
    layoutSaveTimeout = window.setTimeout(() => {
      layoutSaveTimeout = undefined;
      if (generation !== projectGeneration) return;

      void persistPanelLayout().catch(e => {
        setError(String(e));
        console.error('Failed to save panel layout:', e);
      });
    }, 250);
  });

  onCleanup(cancelPendingLayoutSave);

  createEffect(() => {
    const workspace = workspaceEl();
    if (!workspace) return;
    const resizeObserver = new ResizeObserver(() => {
      setWorkspaceViewportSize({
        width: workspace.clientWidth,
        height: workspace.clientHeight,
      });
      windowManager.syncMaximizedPanelsToWorkspace();
    });
    resizeObserver.observe(workspace);
    onCleanup(() => resizeObserver.disconnect());
  });

  let frameQueryId = 0;
  const [activeFrameTableFilter, setActiveFrameTableFilter] = createSignal<FrameTableFilter | null>(null);
  const fetchFramePage = (
    offset: number,
    limit: number,
    activeFilter: FilterConfig,
    tableFilter: FrameTableFilter | null,
    playbackTime?: number,
  ) => invoke<FramePage>('get_frame_page', {
    offset,
    limit,
    canId: parseCanId(activeFilter.canId),
    timeStart: parseTime(activeFilter.timeStart),
    timeEnd: parseTime(activeFilter.timeEnd),
    tableFilter,
    playbackTime: playbackTime ?? null,
  });

  const requestFramePage = async (
    offset: number,
    limit: number,
    tableFilter?: FrameTableFilter,
  ) => {
    if (tableFilter) setActiveFrameTableFilter(tableFilter);
    const requestId = ++frameQueryId;
    const activeFilter = filter();
    const cacheLimit = currentCacheLimitBytes();
    const page = await fetchFramePage(
      offset,
      Math.min(limit, 512),
      activeFilter,
      tableFilter ?? activeFrameTableFilter(),
    );
    if (requestId !== frameQueryId) return;
    const retained = retainNewestFrames(page.frames, cacheLimit);
    setFrames(retained.frames);
    setFrameOffset(page.offset + retained.dropped);
    setFrameTotalCount(page.totalCount);
    setFrameTimeOrigin(page.timeOrigin);
    setEstimatedCacheBytes(retained.bytes);
  };

  const queryChartData = (
    signals: ChartSignal[],
    timeStart: number,
    timeEnd: number,
    bucketCount: number,
  ) => invoke<{ timestamps: number[]; series: (number | null)[][] }>('get_chart_data', {
    signals: signals.map(({ canId, signalName }) => ({ canId, signalName })),
    timeStart,
    timeEnd,
    bucketCount,
  });

  let playbackTimer: ReturnType<typeof setInterval> | null = null;
  let playbackPollInFlight = false;
  let playbackPollGeneration = 0;
  let lastFrameMonitorRefresh = 0;
  let pendingTraceFrames: FrameInfo[] = [];
  let pendingTraceBytes = 0;
  let previousTraceTimestamp: number | null = null;

  const flushTraceFrames = () => {
    if (pendingTraceFrames.length === 0) return;
    const appended = pendingTraceFrames;
    pendingTraceFrames = [];
    pendingTraceBytes = 0;
    const currentFrames = frames();
    const cacheLimit = currentCacheLimitBytes();
    const currentBytes = estimatedCacheBytes();
    const appendedBytes = estimateFramesMemoryBytes(appended);
    const exceedsLimit = currentBytes + appendedBytes > cacheLimit;

    if (measurementSettings().cacheFullPolicy === 'clear-all' && exceedsLimit) {
      const retained = retainNewestFrames(appended, cacheLimit);
      setFrames(retained.frames);
      setFrameOffset((offset) => offset + currentFrames.length + retained.dropped);
      setEstimatedCacheBytes(retained.bytes);
      setFrameTotalCount((count) => count + appended.length);
      setHiddenTraceFrames((count) => count + currentFrames.length + retained.dropped);
      return;
    }

    if (measurementSettings().cacheFullPolicy === 'stop-measurement' && exceedsLimit) {
      const accepted = retainOldestFrames(appended, Math.max(0, cacheLimit - currentBytes));
      if (accepted.frames.length > 0) {
        setFrames([...currentFrames, ...accepted.frames]);
        setEstimatedCacheBytes(currentBytes + accepted.bytes);
        setFrameTotalCount((count) => count + accepted.frames.length);
      }
      pendingTraceFrames = appended.slice(accepted.frames.length);
      pendingTraceBytes = estimateFramesMemoryBytes(pendingTraceFrames);
      setHiddenTraceFrames((count) => count + accepted.dropped);
      setCacheLimitReached(true);
      pausePlaybackAtCacheLimit();
      return;
    }

    const combined = [...currentFrames, ...appended];
    const retained = retainNewestFrames(combined, cacheLimit);
    setFrames(retained.frames);
    setEstimatedCacheBytes(retained.bytes);
    if (retained.dropped > 0) {
      setFrameOffset((offset) => offset + retained.dropped);
      setHiddenTraceFrames((count) => count + retained.dropped);
    }
    setFrameTotalCount((count) => count + appended.length);
  };

  const pausePlaybackAtCacheLimit = () => {
    stopPolling();
    void invoke<string>('playback_control', { action: 'pause' })
      .then((state) => setPlaybackState(state as PlaybackState))
      .catch((error) => {
        console.error('Failed to pause playback at the cache limit:', error);
        setError(String(error));
      });
  };

  const resetTraceBuffer = () => {
    pendingTraceFrames = [];
    pendingTraceBytes = 0;
    previousTraceTimestamp = null;
    frameQueryId++;
    setFrames([]);
    setFrameOffset(0);
    setFrameTotalCount(0);
    setEstimatedCacheBytes(0);
    lastFrameMonitorRefresh = 0;
    setHiddenTraceFrames(0);
    setCacheLimitReached(false);
  };

  const clearTraceCacheForResume = () => {
    const cachedFrameCount = frames().length;
    setFrameOffset((offset) => offset + cachedFrameCount);
    setFrames([]);
    setEstimatedCacheBytes(0);
    setHiddenTraceFrames(0);
    setCacheLimitReached(false);
  };

  const startPolling = () => {
    if (playbackTimer) return;
    playbackTimer = setInterval(async () => {
      if (playbackPollInFlight) return;
      const generation = playbackPollGeneration;
      playbackPollInFlight = true;
      try {
        const batch: FrameInfo[] = await invoke('get_batch');
        if (generation !== playbackPollGeneration) return;
        if (batch.length > 0) {
          countMonitorFrames(batch);
          if (!traceMode()) {
            resetTraceBuffer();
            setFrameTimeOrigin(batch[0].timestamp);
            setTraceMode(true);
          }
          const framesWithRelativeTime = batch.map((frame) => {
            const relativeTime = previousTraceTimestamp === null
              ? 0
              : frame.timestamp - previousTraceTimestamp;
            previousTraceTimestamp = frame.timestamp;
            return { ...frame, relative_time: relativeTime };
          });
          pendingTraceFrames.push(...framesWithRelativeTime);
          pendingTraceBytes += estimateFramesMemoryBytes(framesWithRelativeTime);
          setPlaybackFrameCount(prev => prev + batch.length);
          setCurrentTime(batch[batch.length - 1].timestamp);
          const now = Date.now();
          if (
            playbackState() !== 'playing' ||
            estimatedCacheBytes() + pendingTraceBytes >= currentCacheLimitBytes() ||
            now - lastFrameMonitorRefresh >= 1000 / frameMonitorRefreshRate()
          ) {
            lastFrameMonitorRefresh = now;
            flushTraceFrames();
          }
        }
      } catch (e) {
        console.error('get_batch failed:', e);
        setError(`读取回放数据失败：${String(e)}`);
      } finally {
        playbackPollInFlight = false;
      }
    }, 33);
  };

  const stopPolling = () => {
    playbackPollGeneration++;
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
        if (layoutSaveTimeout !== undefined) {
          cancelPendingLayoutSave();
          await persistPanelLayout();
        }
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

  const handleNewProject = async (template: NewProjectTemplate = 'can-analysis') => {
    setNewProjectTemplate(template);
    setShowNewProjectDialog(true);
  };

  const handleConfirmNewProject = async (config: NewProjectConfig) => {
    projectGeneration++;
    setError(null);
    cancelPendingLayoutSave();
    const previousPanelLayouts = windowManager.getPanelLayouts();
    const previousPlaybackState = playbackState();
    stopPolling();

    try {
      const sep = config.parentFolder.includes('\\') ? '\\' : '/';
      const basePath = config.parentFolder.endsWith(sep)
        ? config.parentFolder
        : config.parentFolder + sep;

      const projectFilePath = config.createSubfolder
        ? basePath + config.name + sep + config.name + '.canscope'
        : basePath + config.name + '.canscope';

      setStagingNewProjectWorkspace(true);
      if (!workspaceEl()) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }

      windowManager.resetToNewProjectLayout(newProjectTemplate());
      cancelPendingLayoutSave();
      const proj: ProjectInfo = await invoke('create_project_as', {
        name: config.name,
        path: projectFilePath,
        panels: windowManager.getPanelLayouts(),
      });

      setProject(proj);
      recordRuntimeEvent('info', '工程', '已创建新工程');
      setMetadata(null);
      setTraceMode(false);
      resetTraceBuffer();
      resetMonitorCounters();
      setPlaybackFrameCount(0);
      setCurrentTime(0);
      setPlaybackState('stopped');
      setLoopEnabled(false);
      setDbcTree(null);
      setSelectedCanId(null);
      setChartSignals([]);
      setFilter({ canId: '', timeStart: '', timeEnd: '' });
      setIndexProgress(null);
      const loadedMeasurementSettings = loadMeasurementSettings(proj.name);
      setMeasurementSettings(loadedMeasurementSettings);
      saveMeasurementSettings(loadedMeasurementSettings);
      setStagingNewProjectWorkspace(false);
      setShowNewProjectDialog(false);
    } catch (e) {
      console.error('Failed to create project:', e);
      setError(`创建工程失败：${String(e)}`);
      windowManager.restorePanelLayouts(previousPanelLayouts);
      cancelPendingLayoutSave();
      setStagingNewProjectWorkspace(false);
      if (previousPlaybackState === 'playing') startPolling();
      throw e;
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
      setError(`从最近工程列表移除失败：${String(e)}`);
    }
  };

  const openProjectByPath = async (path: string) => {
    projectGeneration++;
    cancelPendingLayoutSave();
    setLoading(true);
    setError(null);
    resetTraceBuffer();
    resetMonitorCounters();
    setTraceMode(false);
    setDbcTree(null);
    setSelectedCanId(null);
    setChartSignals([]);
    stopPolling();

    try {
      const proj: ProjectInfo = await invoke('open_project', { path });
      recordRuntimeEvent('info', '工程', '工程已打开');
      windowManager.restorePanelLayouts(proj.uiLayout.panels);
      const loadedMeasurementSettings = loadMeasurementSettings(proj.name);
      setMeasurementSettings(loadedMeasurementSettings);
      saveMeasurementSettings(loadedMeasurementSettings);
      setProject(proj);
      setMetadata(null);
      setPlaybackFrameCount(0);
      setCurrentTime(proj.lastPosition);
      setPlaybackState('stopped');
      setLoopEnabled(false);

      if (proj.canLogPath) {
        const info: PlaylistInfo | null = await invoke('playlist_get_files');
        if (info) {
          setMetadata(info);
        }
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
          proj.chartSignals.map(s => ({ canId: s.canId, signalName: s.signalName, unit: s.unit, min: s.min ?? null, max: s.max ?? null, visible: s.visible ?? true }))
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
            recordRuntimeEvent('warning', 'DBC', '绑定的 DBC 文件无法加载');
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
        cancelPendingLayoutSave();
        await persistPanelLayout();
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
    cancelPendingLayoutSave();
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
        min: s.min,
        max: s.max,
        visible: s.visible,
      })),
      uiLayout: {
        ...project()?.uiLayout,
        panels: windowManager.getPanelLayouts(),
      },
      lastPosition: currentTime(),
    });

    await invoke('save_project_as', { path });

    setProject(prev => prev ? { ...prev, projectPath: path } : null);
  };

  const handleCloseProject = async () => {
    try {
      if (layoutSaveTimeout !== undefined) {
        cancelPendingLayoutSave();
        await persistPanelLayout();
      }
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
    projectGeneration++;
    cancelPendingLayoutSave();
    stopPolling();
    await invoke('close_project');
    recordRuntimeEvent('info', '工程', '已关闭工程');
    setProject(null);
    setMetadata(null);
    setTraceMode(false);
    resetTraceBuffer();
    resetMonitorCounters();
    setPlaybackFrameCount(0);
    setCurrentTime(0);
    setPlaybackState('stopped');
    setDbcTree(null);
    setSelectedCanId(null);
    setChartSignals([]);
    setError(null);
    setFilter({ canId: '', timeStart: '', timeEnd: '' });
  };

  const handleOpenDatabaseManager = () => {
    setShowDatabaseManager(true);
  };

  const handleDatabaseManagerConfirm = async (entries: Array<{ id: string; name: string; path: string; type: string; busIds: number[] }>) => {
    setShowDatabaseManager(false);

    // 将多通道条目展开为扁平的 {busId, path} 列表
    const bindings: { busId: number; path: string }[] = [];
    for (const entry of entries) {
      for (const busId of entry.busIds) {
        bindings.push({ busId, path: entry.path });
      }
    }
    try {
      await invoke('reload_all_dbc', { bindings });
      const tree: DbcTreeInfo | null = await invoke('get_dbc_info');
      setDbcTree(tree);
    } catch (e) {
      console.error('Failed to reload DBCs:', e);
      setError(String(e));
    }

    // 同步更新工程状态中的 DBC 绑定列表
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
      const stateBeforeSeek = playbackState();
      const wasPlaying = stateBeforeSeek === 'playing';
      if (wasPlaying) stopPolling();
      await invoke('seek_to', { timestamp });
      if (timestamp <= 0) resetMonitorCounters();
      setCurrentTime(timestamp);
      resetTraceBuffer();
      setTraceMode(wasPlaying);
      if (wasPlaying) {
        startPolling();
      } else if (stateBeforeSeek === 'paused') {
        await requestFramePage(0, 512);
      }
    } catch (e) {
      console.error('Seek failed:', e);
      setError(`跳转播放位置失败：${String(e)}`);
    }
  };

  const handleSelectMessage = (canId: number | null) => {
    setTraceMode(false);
    setSelectedCanId(canId);
    if (canId !== null) {
      setFilter({ canId: '0x' + canId.toString(16).toUpperCase(), timeStart: '', timeEnd: '' });
    } else {
      setFilter({ canId: '', timeStart: '', timeEnd: '' });
    }
    void requestFramePage(0, 512).catch(e => {
      setError(String(e));
      console.error('Failed to query filtered frames:', e);
    });
  };

  const handleAddSignal = (s: ChartSignal) => {
    setChartSignals(prev => [...prev, s]);
  };

  const handleAddSignals = (signals: ChartSignal[]) => {
    const existingSet = new Set(
      chartSignals().map((s) => `${s.canId}:${s.signalName}`)
    );
    const newSignals = signals.filter(
      (s) => !existingSet.has(`${s.canId}:${s.signalName}`)
    );
    if (newSignals.length > 0) {
      setChartSignals((prev) => [...prev, ...newSignals]);
    }
  };

  const handleRemoveSignal = (s: ChartSignal) => {
    setChartSignals(prev => prev.filter(x => !(x.canId === s.canId && x.signalName === s.signalName)));
  };

  const handleSetPlaybackOptions = async (
    mode: PlaybackMode,
    scope: LoopScope,
  ): Promise<boolean> => {
    try {
      await invoke('set_playback_options', { playbackMode: mode, loopScope: scope });
      setPlaybackMode(mode);
      setLoopScope(scope);
      return true;
    } catch (e) {
      console.error('set_playback_options failed:', e);
      setError(`设置回放模式失败：${String(e)}`);
      return false;
    }
  };

  const handlePlaybackControl = async (action: string) => {
    const prevState = playbackState();
    try {
      if (action === 'play') {
        await invoke('set_playback_options', {
          playbackMode: playbackMode(),
          loopScope: loopScope(),
        });
      }
      const state: string = await invoke('playback_control', { action });
      setPlaybackState(state as PlaybackState);

      if (state === 'playing') {
        if (prevState === 'stopped') {
          setPlaybackFrameCount(0);
          resetMonitorCounters();
          resetTraceBuffer();
          setTraceMode(true);
        }
        if (
          prevState !== 'stopped' &&
          measurementSettings().cacheFullPolicy === 'stop-measurement' &&
          cacheLimitReached()
        ) {
          clearTraceCacheForResume();
          flushTraceFrames();
          if (cacheLimitReached()) return;
        }
        if (!traceMode()) {
          resetTraceBuffer();
          setTraceMode(true);
        }
        startPolling();
      } else {
        flushTraceFrames();
        stopPolling();
      }
      const actualState = playbackState();
      if (actualState !== prevState) {
        const labels: Record<PlaybackState, string> = {
          stopped: '回放已停止',
          playing: '开始回放',
          paused: '回放已暂停',
        };
        recordRuntimeEvent('info', '数据回放', labels[actualState]);
      }
    } catch (e) {
      console.error('playback_control failed:', e);
      setError(String(e));
    }
  };

  const handleFrameMonitorRefreshRateChange = (rate: number) => {
    setFrameMonitorRefreshRate(Math.max(1, Math.min(30, rate)));
  };

  const handleMeasurementSettingsChange = (next: MeasurementSettings) => {
    const previousSettings = measurementSettings();
    const updated: MeasurementSettings = {
      automaticMemoryLimit: next.automaticMemoryLimit,
      customMemoryLimitMb: Math.max(1, Math.min(1_048_576, Math.floor(next.customMemoryLimitMb))),
      cacheFullPolicy: next.cacheFullPolicy,
    };
    if (updated.cacheFullPolicy !== previousSettings.cacheFullPolicy) {
      setHiddenTraceFrames(0);
      setCacheLimitReached(false);
    }
    const available = availableMemoryBytes();
    let autoLimit = automaticLimitBytes();
    if (
      updated.automaticMemoryLimit &&
      !measurementSettings().automaticMemoryLimit &&
      available !== null
    ) {
      autoLimit = Math.max(1024 * 1024, Math.floor(available * 0.9));
      setAutomaticLimitBytes(autoLimit);
    }
    frameQueryId++;
    setMeasurementSettings(updated);
    saveMeasurementSettings(updated);
    applyCacheBudget(cacheMemoryLimitBytes(updated, autoLimit), updated.cacheFullPolicy);
  };

  const handleRuntimeLogSettingsChange = (settings: RuntimeLogSettings) => {
    const previousSettings = runtimeLogSettings();
    const updated = {
      ...settings,
      enabledLevels: [...settings.enabledLevels],
      saveToFile: settings.saveToFile && settings.filePath.length > 0,
    };
    setRuntimeLogSettings(updated);
    saveRuntimeLogSettings(updated);
    setRuntimeLogs((previous) => previous.slice(-updated.cacheLimit));
    if (!updated.saveToFile || updated.filePath !== previousSettings.filePath) {
      lastRuntimeLogWriteError = null;
      setRuntimeLogPersistenceError(null);
    }
  };

  const handleClearFrameMonitor = () => {
    pendingTraceFrames = [];
    pendingTraceBytes = 0;
    frameQueryId++;
    setFrames([]);
    setFrameOffset(0);
    setFrameTotalCount(0);
    setEstimatedCacheBytes(0);
    resetMonitorCounters();
    setHiddenTraceFrames(0);
    setCacheLimitReached(false);
  };

  const hasSource = () => metadata() !== null;

  onMount(() => {
    const refreshMemory = () => {
      void refreshAvailableMemory().catch((error) => {
        setMemoryInfoError(String(error));
        console.error('Failed to read available system memory:', error);
      });
    };
    refreshMemory();
    const timer = window.setInterval(refreshMemory, 5000);
    onCleanup(() => window.clearInterval(timer));
  });

  onMount(async () => {
    // 监听后端播放状态变更事件（如播放完毕自动停止）
    const unlisten = await listen<string>('playback-state-changed', (event) => {
      if (event.payload === 'stopped') {
        flushTraceFrames();
        stopPolling();
        setPlaybackState('stopped');
      }
    });
    onCleanup(unlisten);

    const unlistenIndexProgress = await listen<{
      path: string;
      status: string;
      processedFrames: number;
      message?: string | null;
    }>('frame-index-progress', (event) => {
      const progress = event.payload;
      if (progress.status === 'ready') {
        recordRuntimeEvent('info', '文件索引', '文件索引已就绪');
        setIndexProgress(null);
      } else {
        setIndexProgress(progress);
        if (progress.status === 'failed' && progress.message) setError(progress.message);
      }
    });
    onCleanup(unlistenIndexProgress);

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
      if (ws) {
        windowManager.setPanelRect('resource-manager', { height: ws.clientHeight });
        windowManager.syncSnappedPanelsToWorkspace();
        windowManager.syncNewProjectLayoutToWorkspace();
      }
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
      setError(`调整回放速度失败：${String(e)}`);
    }
  };

  const handleSetLoop = async (enabled: boolean) => {
    try {
      const actual: boolean = await invoke('set_loop', { enabled });
      setLoopEnabled(actual);
    } catch (e) {
      console.error('set_loop failed:', e);
      setError(`设置循环回放失败：${String(e)}`);
    }
  };

  const handleStepForward = async (): Promise<number | null> => {
    try {
      const frame: FrameInfo | null = await invoke('step_forward');
      if (frame) {
        setTraceMode(false);
        setCurrentTime(frame.timestamp);
        setPlaybackFrameCount(prev => prev + 1);
        countMonitorFrames([frame]);
        await requestFramePage(Math.max(0, playbackFrameCount()), 512);
        return frame.timestamp;
      }
      return null;
    } catch (e) {
      console.error('step_forward failed:', e);
      setError(`单步前进失败：${String(e)}`);
      return null;
    }
  };

  const handleStepBack = async (): Promise<number | null> => {
    try {
      const frame: FrameInfo | null = await invoke('step_back');
      if (frame) {
        setTraceMode(false);
        setCurrentTime(frame.timestamp);
        setPlaybackFrameCount(prev => Math.max(0, prev - 1));
        await requestFramePage(Math.max(0, playbackFrameCount() - 2), 512);
        return frame.timestamp;
      }
      return null;
    } catch (e) {
      console.error('step_back failed:', e);
      setError(`单步后退失败：${String(e)}`);
      return null;
    }
  };

  const handleRefreshPlaylist = async () => {
    try {
      const info: PlaylistInfo | null = await invoke('playlist_get_files');
      if (info) {
        setMetadata(info);
        if (playbackState() !== 'playing') {
          resetTraceBuffer();
          resetMonitorCounters();
          setTraceMode(false);
          setPlaybackFrameCount(0);
        }
      }
    } catch (e) {
      console.error('playlist_get_files failed:', e);
      setError(`刷新回放列表失败：${String(e)}`);
    }
  };

  const handleClearPlaylist = async (): Promise<boolean> => {
    stopPolling();
    try {
      const info: PlaylistInfo = await invoke('playlist_clear');
      setMetadata(info);
      setPlaybackState('stopped');
      setCurrentTime(0);
      resetTraceBuffer();
      resetMonitorCounters();
      setTraceMode(false);
      setPlaybackFrameCount(0);
      return true;
    } catch (e) {
      console.error('playlist_clear failed:', e);
      setError(`清空回放列表失败：${String(e)}`);
      return false;
    }
  };

  return (
    <div class="app-layout">
      {project() !== null && !loading() && <Ribbon
          projectLoaded={project() !== null}
          sourceLoaded={hasSource()}
          playbackState={playbackState()}
          online={false}
          onToggleOnline={() => {}}
          onStart={() => void handlePlaybackControl('play')}
          onStop={() => void handlePlaybackControl('stop')}
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
          onNewProject={handleNewProject}
          onOpenProject={handleOpenProject}
          onSaveProject={handleSaveProject}
          onSaveProjectAs={handleSaveProjectAs}
          onCloseProject={handleCloseProject}
          onOpenRecent={handleOpenRecent}
      />}
      <main class="main-content">
        {indexProgress() && (
          <div class="loading" role="status">
            {indexProgress()!.status === 'failed'
              ? `索引失败：${indexProgress()!.message ?? ''}`
              : `正在建立文件索引：${indexProgress()!.processedFrames.toLocaleString()} 帧`}
          </div>
        )}
        {loading() ? (
          <div class="loading">Loading project...</div>
        ): (hasSource() || project() !== null || stagingNewProjectWorkspace()) ? (
            <>
            <Show when={project() && error()}>
              <div class="app-inline-error" role="alert">
                <span>{error()}</span>
                <button type="button" onClick={() => setError(null)}>关闭</button>
              </div>
            </Show>
            <div
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
            <div
              ref={setWorkspaceEl}
              class="workspace__viewport"
              data-origin-x={workspaceCanvasSize().originX}
              data-origin-y={workspaceCanvasSize().originY}
              style={{ bottom: `${windowManager.minimizedPanels().length > 0 ? 30 : 0}px` }}
            >
              <div
                class="workspace__canvas"
                style={{
                  width: `${workspaceCanvasSize().width}px`,
                  height: `${workspaceCanvasSize().height}px`,
                }}
              >
                <div
                  class="workspace__canvas-content"
                  style={{
                    top: `${-workspaceCanvasSize().originY}px`,
                    left: `${-workspaceCanvasSize().originX}px`,
                    width: `${workspaceCanvasSize().contentWidth}px`,
                    height: `${workspaceCanvasSize().contentHeight}px`,
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
                  <For each={windowManager.visiblePanels()}>
              {(panel) => {
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
                        frames={frames()}
                        frameOffset={frameOffset()}
                        onRequestPage={requestFramePage}
                        totalFrameCount={frameTotalCount()}
                        traceMode={traceMode()}
                        hiddenTraceFrames={hiddenTraceFrames()}
                        estimatedCacheBytes={estimatedCacheBytes()}
                        receivedFrameCount={receivedFrameCount()}
                        transmittedFrameCount={transmittedFrameCount()}
                        errorFrameCount={errorFrameCount()}
                        cacheFullPolicy={measurementSettings().cacheFullPolicy}
                        cacheLimitReached={cacheLimitReached()}
                        onMonitorRefreshRateChange={handleFrameMonitorRefreshRateChange}
                        hasDbc={dbcTree() !== null}
                        projectName={project()?.name ?? '未命名'}
                        busType={metadata()?.files?.[0]?.busType}
                        startTime={metadata()?.files?.find((file) => file.enabled)?.startTime}
                        playbackFiles={metadata()?.files}
                        timeOrigin={frameTimeOrigin()}
                        onClear={handleClearFrameMonitor}
                        onSelectMessage={handleSelectMessage}
                        onFilterByCanId={handleSelectMessage}
                      />
                    );
                  case 'chart':
                    return (
                      <SignalChart
                        signals={chartSignals()}
                        duration={metadata()?.totalDuration ?? 0}
                        onQueryChartData={queryChartData}
                        dbcBindings={project()?.dbcBindings ?? []}
                        onRemoveSignal={handleRemoveSignal}
                        onAddSignals={handleAddSignals}
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
                        isActive={windowManager.visiblePanels().every(
                          (visiblePanel) =>
                            visiblePanel.id === panel.id || visiblePanel.zIndex < panel.zIndex,
                        )}
                        playbackMode={playbackMode()}
                        loopScope={loopScope()}
                        speed={speed()}
                        loopEnabled={loopEnabled()}
                        onPlaybackControl={handlePlaybackControl}
                        onSetPlaybackOptions={handleSetPlaybackOptions}
                        onSetSpeed={handleSetSpeed}
                        onSetLoop={handleSetLoop}
                        onStepForward={handleStepForward}
                        onStepBack={handleStepBack}
                        onSeek={handleSeek}
                        onClearPlaylist={handleClearPlaylist}
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
                    panel.id === 'chart' ? <ChartLine size={14} /> :
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
            }}
                  </For>
                </div>
              </div>
            </div>
            {/* Minimized windows taskbar */}
            <WindowTaskbar
              panels={windowManager.minimizedPanels()}
              onRestore={restoreWorkspacePanel}
            />
          </div>
          </>
        ) : (
          <WelcomeScreen
            onNewProject={handleNewProject}
            onOpenProject={handleOpenProject}
            onOpenRecent={handleOpenRecent}
            onRemoveRecent={handleRemoveRecent}
            onOpenSettings={openSettings}
            error={error()}
            onDismissError={() => setError(null)}
          />
        )}
      </main>
      {project() !== null && !loading() && logPanelOpen() && (
        <RuntimeLogPanel
          entries={runtimeLogs()}
          maxEntries={runtimeLogSettings().cacheLimit}
          displayLimit={runtimeLogSettings().displayLimit}
          timeFormat={runtimeLogSettings().timeFormat}
          enabledLevels={runtimeLogSettings().enabledLevels}
          onClose={() => setLogPanelOpen(false)}
          onClear={() => setRuntimeLogs([])}
          onExport={exportRuntimeLogs}
        />
      )}
      {settingsOpen() && (
        <SettingsPage
          settings={measurementSettings()}
          runtimeLogSettings={runtimeLogSettings()}
          runtimeLogPersistenceError={runtimeLogPersistenceError()}
          cachedFrameCount={frames().length}
          estimatedCacheBytes={estimatedCacheBytes()}
          availableMemoryBytes={availableMemoryBytes()}
          automaticLimitBytes={automaticLimitBytes()}
          memoryInfoError={memoryInfoError()}
          onChange={handleMeasurementSettingsChange}
          onRuntimeLogSettingsChange={handleRuntimeLogSettingsChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {showNewProjectDialog() && (
        <NewProjectDialog
          templateName={{
            'can-analysis': 'CAN 分析',
            'dbc-signal-analysis': 'DBC 信号分析',
            'blank-workspace': '空白工作区',
          }[newProjectTemplate()]}
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
      {project() !== null && !loading() && (
        <Notifications
          entries={notifications()}
          open={notificationCenterOpen()}
          onClose={() => setNotificationCenterOpen(false)}
          onDismiss={dismissNotification}
          onClear={clearNotifications}
        />
      )}
      {project() !== null && !loading() && (
        <StatusBar
          projectLoaded={project() !== null}
          sourceLoaded={hasSource()}
          playbackState={playbackState()}
          estimatedCacheBytes={estimatedCacheBytes()}
          cacheLimitBytes={currentCacheLimitBytes()}
          availableMemoryBytes={availableMemoryBytes()}
          logPanelOpen={logPanelOpen()}
          notificationCenterOpen={notificationCenterOpen()}
          unreadNotificationCount={notifications().filter((item) => !item.read).length}
          onOpenSettings={openSettings}
          onToggleLogPanel={() => setLogPanelOpen((open) => !open)}
          onToggleNotificationCenter={toggleNotificationCenter}
        />
      )}
    </div>
  );
}

export default App;
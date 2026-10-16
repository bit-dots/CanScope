export interface FrameTableSettings {
  visibleColumns: string[];
  timeFormat: 'absolute' | 'relative-to-start' | 'relative-to-prev';
  dataFormat: 'hex';
  canIdFormat: 'no-prefix' | '0x-prefix';
  autoScroll: boolean;
  maxFrames: number;
  highlightChanges: boolean;
}

const STORAGE_PREFIX = 'canscope.frame-monitor.settings';

const DEFAULT_SETTINGS: FrameTableSettings = {
  visibleColumns: ['time', 'channel', 'canid', 'type', 'direction', 'dlc', 'data'],
  timeFormat: 'absolute',
  dataFormat: 'hex',
  canIdFormat: 'no-prefix',
  autoScroll: true,
  maxFrames: 10000,
  highlightChanges: true,
};

export function loadSettings(projectName: string): FrameTableSettings {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}.${projectName}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // corrupted storage, fall through to default
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(projectName: string, settings: FrameTableSettings): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}.${projectName}`, JSON.stringify(settings));
  } catch {
    // storage full or unavailable – silently ignore
  }
}

export function getDefaultSettings(): FrameTableSettings {
  return { ...DEFAULT_SETTINGS };
}
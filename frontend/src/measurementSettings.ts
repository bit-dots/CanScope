export type CacheFullPolicy = 'evict-oldest' | 'clear-all' | 'stop-measurement';

export interface MeasurementSettings {
  automaticMemoryLimit: boolean;
  customMemoryLimitMb: number;
  cacheFullPolicy: CacheFullPolicy;
}

const STORAGE_KEY = 'canscope.measurement.settings';
const DEFAULT_SETTINGS: MeasurementSettings = {
  automaticMemoryLimit: true,
  customMemoryLimitMb: 2000,
  cacheFullPolicy: 'evict-oldest',
};

export function loadMeasurementSettings(projectName?: string): MeasurementSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? (
      projectName
        ? localStorage.getItem(`canscope.frame-monitor.settings.${projectName}`)
        : null
    );
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<MeasurementSettings>;
    const policies: CacheFullPolicy[] = ['evict-oldest', 'clear-all', 'stop-measurement'];
    return {
      automaticMemoryLimit: typeof parsed.automaticMemoryLimit === 'boolean'
        ? parsed.automaticMemoryLimit
        : DEFAULT_SETTINGS.automaticMemoryLimit,
      customMemoryLimitMb: Number.isFinite(parsed.customMemoryLimitMb)
        ? Math.max(1, Math.min(1_048_576, Math.floor(parsed.customMemoryLimitMb!)))
        : DEFAULT_SETTINGS.customMemoryLimitMb,
      cacheFullPolicy: policies.includes(parsed.cacheFullPolicy as CacheFullPolicy)
        ? parsed.cacheFullPolicy as CacheFullPolicy
        : DEFAULT_SETTINGS.cacheFullPolicy,
    };
  } catch (error) {
    console.error('Failed to load measurement settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveMeasurementSettings(settings: MeasurementSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save measurement settings:', error);
  }
}

export function cacheMemoryLimitBytes(
  settings: MeasurementSettings,
  automaticLimitBytes: number | null,
): number {
  const megabyte = 1024 * 1024;
  return settings.automaticMemoryLimit && automaticLimitBytes !== null
    ? Math.max(megabyte, automaticLimitBytes)
    : settings.customMemoryLimitMb * megabyte;
}

export function estimateFrameMemoryBytes(frame: {
  data: number[];
  signals: Array<{ name: string; unit: string; label: string | null }> | null;
}): number {
  const signalBytes = (frame.signals ?? []).reduce(
    (total, signal) =>
      total + 128 + (signal.name.length + signal.unit.length + (signal.label?.length ?? 0)) * 2,
    0,
  );
  return 256 + frame.data.length * 8 + signalBytes;
}

export function estimateFramesMemoryBytes(
  frames: Array<{
    data: number[];
    signals: Array<{ name: string; unit: string; label: string | null }> | null;
  }>,
): number {
  return frames.reduce((total, frame) => total + estimateFrameMemoryBytes(frame), 0);
}

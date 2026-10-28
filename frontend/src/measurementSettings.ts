export type CacheFullPolicy = 'evict-oldest' | 'clear-all' | 'stop-measurement';

export interface MeasurementSettings {
  maxCachedFrames: number;
  cacheFullPolicy: CacheFullPolicy;
}

const STORAGE_KEY = 'canscope.measurement.settings';
const DEFAULT_SETTINGS: MeasurementSettings = {
  maxCachedFrames: 10000,
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
    const parsed: Partial<MeasurementSettings> = JSON.parse(raw);
    const policies: CacheFullPolicy[] = ['evict-oldest', 'clear-all', 'stop-measurement'];
    return {
      maxCachedFrames: Math.max(
        100,
        Math.min(
          1000000,
          Number('maxCachedFrames' in parsed ? parsed.maxCachedFrames : (parsed as { maxFrames?: number }).maxFrames) ||
            DEFAULT_SETTINGS.maxCachedFrames,
        ),
      ),
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

import type { EventLevel } from './runtimeEvents';

export const RUNTIME_LOG_DISPLAY_LIMITS = [100, 500, 1000, 5000] as const;
export const RUNTIME_LOG_CACHE_LIMITS = [1000, 5000, 10000] as const;
export const RUNTIME_LOG_LEVELS: EventLevel[] = [
  'debug',
  'info',
  'warning',
  'error',
  'critical',
];
export const RUNTIME_LOG_TIME_FORMATS = ['date-time', 'time', 'iso'] as const;

export type RuntimeLogDisplayLimit = (typeof RUNTIME_LOG_DISPLAY_LIMITS)[number];
export type RuntimeLogCacheLimit = (typeof RUNTIME_LOG_CACHE_LIMITS)[number];
export type RuntimeLogTimeFormat = (typeof RUNTIME_LOG_TIME_FORMATS)[number];

export interface RuntimeLogSettings {
  displayLimit: RuntimeLogDisplayLimit;
  cacheLimit: RuntimeLogCacheLimit;
  timeFormat: RuntimeLogTimeFormat;
  enabledLevels: EventLevel[];
  saveToFile: boolean;
  filePath: string;
}

const STORAGE_KEY = 'canscope.runtime-log.settings';
const LEGACY_LIMIT_KEY = 'canscope.runtime-log.limit';

export const DEFAULT_RUNTIME_LOG_SETTINGS: RuntimeLogSettings = {
  displayLimit: 1000,
  cacheLimit: 5000,
  timeFormat: 'date-time',
  enabledLevels: [...RUNTIME_LOG_LEVELS],
  saveToFile: false,
  filePath: '',
};

export function formatRuntimeLogTimestamp(
  timestamp: number,
  format: RuntimeLogTimeFormat,
): string {
  const date = new Date(timestamp);
  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  const timePart = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join(':');

  if (format === 'iso') return date.toISOString();
  if (format === 'time') return timePart;
  return `${datePart} ${timePart}`;
}

function isIncluded<T extends readonly number[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return typeof value === 'number' && values.includes(value);
}

function sanitizeSettings(value: unknown): RuntimeLogSettings {
  if (!value || typeof value !== 'object') return DEFAULT_RUNTIME_LOG_SETTINGS;
  const saved = value as Partial<RuntimeLogSettings>;
  const enabledLevels = Array.isArray(saved.enabledLevels)
    ? RUNTIME_LOG_LEVELS.filter((level) => saved.enabledLevels?.includes(level))
    : [...RUNTIME_LOG_LEVELS];
  const filePath = typeof saved.filePath === 'string' ? saved.filePath : '';

  return {
    displayLimit: isIncluded(RUNTIME_LOG_DISPLAY_LIMITS, saved.displayLimit)
      ? saved.displayLimit
      : DEFAULT_RUNTIME_LOG_SETTINGS.displayLimit,
    cacheLimit: isIncluded(RUNTIME_LOG_CACHE_LIMITS, saved.cacheLimit)
      ? saved.cacheLimit
      : DEFAULT_RUNTIME_LOG_SETTINGS.cacheLimit,
    timeFormat: RUNTIME_LOG_TIME_FORMATS.includes(saved.timeFormat as RuntimeLogTimeFormat)
      ? saved.timeFormat as RuntimeLogTimeFormat
      : DEFAULT_RUNTIME_LOG_SETTINGS.timeFormat,
    enabledLevels,
    saveToFile: saved.saveToFile === true && filePath.length > 0,
    filePath,
  };
}

export function loadRuntimeLogSettings(): RuntimeLogSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return sanitizeSettings(JSON.parse(stored));

    const legacyLimit = Number(localStorage.getItem(LEGACY_LIMIT_KEY));
    return {
      ...DEFAULT_RUNTIME_LOG_SETTINGS,
      cacheLimit: isIncluded(RUNTIME_LOG_CACHE_LIMITS, legacyLimit)
        ? legacyLimit
        : DEFAULT_RUNTIME_LOG_SETTINGS.cacheLimit,
    };
  } catch (error) {
    console.error('Failed to load runtime log settings:', error);
    return DEFAULT_RUNTIME_LOG_SETTINGS;
  }
}

export function saveRuntimeLogSettings(settings: RuntimeLogSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
  } catch (error) {
    console.error('Failed to save runtime log settings:', error);
  }
}

export const RUNTIME_LOG_LIMITS = [1000, 5000, 10000] as const;
export type RuntimeLogLimit = (typeof RUNTIME_LOG_LIMITS)[number];

const STORAGE_KEY = 'canscope.runtime-log.limit';
const DEFAULT_LIMIT: RuntimeLogLimit = 5000;

export function loadRuntimeLogLimit(): RuntimeLogLimit {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return RUNTIME_LOG_LIMITS.includes(stored as RuntimeLogLimit)
      ? stored as RuntimeLogLimit
      : DEFAULT_LIMIT;
  } catch (error) {
    console.error('Failed to load runtime log settings:', error);
    return DEFAULT_LIMIT;
  }
}

export function saveRuntimeLogLimit(limit: RuntimeLogLimit): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(limit));
  } catch (error) {
    console.error('Failed to save runtime log settings:', error);
  }
}

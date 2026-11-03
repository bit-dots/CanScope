export type EventLevel = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface RuntimeLogEntry {
  id: number;
  timestamp: number;
  level: EventLevel;
  source: string;
  message: string;
  details?: string;
  occurrences?: number;
}

export interface AppNotification extends RuntimeLogEntry {
  read: boolean;
}

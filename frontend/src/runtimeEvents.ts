export type EventLevel = 'error' | 'warning' | 'info';

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

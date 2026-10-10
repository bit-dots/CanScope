export interface FileMetadata {
  fileName: string;
  totalFrames: number;
  duration: number | null;
  busCount: number;
  startTime: string | null;
}

export interface FrameInfo {
  timestamp: number;
  bus_id: number;
  can_id: number;
  is_extended: boolean;
  is_fd: boolean;
  dlc: number;
  data: number[];
  signal_count: number;
}

export interface OpenResult {
  metadata: FileMetadata;
  frames: FrameInfo[];
}

export type PlaybackState = 'stopped' | 'playing' | 'paused';

export function formatHex(value: number, digits: number): string {
  return value.toString(16).toUpperCase().padStart(digits, '0');
}

export function formatDataHex(data: number[], dlc: number): string {
  const bytes = data.slice(0, dlc);
  return bytes.map(b => formatHex(b, 2)).join(' ');
}
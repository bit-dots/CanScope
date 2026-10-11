export interface FileMetadata {
  fileName: string;
  totalFrames: number;
  duration: number | null;
  busCount: number;
  startTime: string | null;
}

export interface DecodedSignalInfo {
  name: string;
  physical_value: number;
  unit: string;
  label: string | null;
}

export interface FrameInfo {
  timestamp: number;
  bus_id: number;
  can_id: number;
  is_extended: boolean;
  is_fd: boolean;
  dlc: number;
  data: number[];
  signals: DecodedSignalInfo[] | null;
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

export function formatSignal(signal: DecodedSignalInfo): string {
  const display = signal.label ?? signal.physical_value.toFixed(2);
  const unit = signal.unit ? ` ${signal.unit}` : '';
  return `${signal.name}=${display}${unit}`;
}
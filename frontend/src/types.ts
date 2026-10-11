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

export interface FilterConfig {
  canId: string;
  timeStart: string;
  timeEnd: string;
}

export interface DbcSignalInfo {
  name: string;
  startBit: number;
  bitLength: number;
  byteOrder: string;
  unit: string;
  min: number | null;
  max: number | null;
  multiplexer: string;
}

export interface DbcMessageInfo {
  canId: number;
  name: string;
  dlc: number;
  sender: string;
  signals: DbcSignalInfo[];
  signalCount: number;
}

export interface DbcTreeInfo {
  messages: DbcMessageInfo[];
  messageCount: number;
  signalCount: number;
}

export function parseCanId(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const num = s.startsWith('0x') || s.startsWith('0X')
    ? parseInt(s, 16)
    : parseInt(s, 10);
  return Number.isNaN(num) ? null : num;
}

export function parseTime(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const num = parseFloat(s);
  return Number.isNaN(num) ? null : num;
}

export function matchesFilter(frame: FrameInfo, filter: FilterConfig): boolean {
  if (filter.canId) {
    const target = parseCanId(filter.canId);
    if (target !== null && frame.can_id !== target) return false;
  }
  if (filter.timeStart) {
    const t = parseTime(filter.timeStart);
    if (t !== null && frame.timestamp < t) return false;
  }
  if (filter.timeEnd) {
    const t = parseTime(filter.timeEnd);
    if (t !== null && frame.timestamp > t) return false;
  }
  return true;
}

export function formatSignal(signal: DecodedSignalInfo): string {
  const display = signal.label ?? signal.physical_value.toFixed(2);
  const unit = signal.unit ? ` ${signal.unit}` : '';
  return `${signal.name}=${display}${unit}`;
}
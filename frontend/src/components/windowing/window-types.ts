export type SnapState =
  | 'floating'
  | 'snapped-left'
  | 'snapped-right'
  | 'snapped-top'
  | 'snapped-bottom'
  | 'snapped-top-left'
  | 'snapped-top-right'
  | 'snapped-bottom-left'
  | 'snapped-bottom-right'
  | 'maximized';

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  rect: WindowRect;
  snapState: SnapState;
  minimized: boolean;
  preMaximize: { rect: WindowRect; snapState: SnapState } | null;
  preSnap: WindowRect | null;
}

export interface PanelWindowState {
  id: string;
  title: string;
  visible: boolean;
  window: WindowState;
  zIndex: number;
  defaultPosition: { x: number; y: number; width: number; height: number };
}

export interface WindowManagerState {
  panels: Record<string, PanelWindowState>;
  nextZIndex: number;
}

export const MIN_WINDOW_WIDTH = 280;
export const MIN_WINDOW_HEIGHT = 180;
export const SNAP_THRESHOLD_TOP = 5;
export const SNAP_THRESHOLD_BOTTOM = 5;
export const SNAP_THRESHOLD_LEFT = 10;
export const SNAP_THRESHOLD_RIGHT = 10;
export const UNSNAP_DISTANCE = 100;
export const RESIZE_HANDLE_SIZE = 6;

export function createDefaultWindowState(
  defaultPosition?: Partial<WindowRect>
): WindowState {
  return {
    rect: {
      x: defaultPosition?.x ?? 0,
      y: defaultPosition?.y ?? 0,
      width: defaultPosition?.width ?? 400,
      height: defaultPosition?.height ?? 300,
    },
    snapState: 'floating',
    minimized: false,
    preMaximize: null,
    preSnap: null,
  };
}
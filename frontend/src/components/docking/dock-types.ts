export type DockPosition = 'left' | 'right' | 'top' | 'bottom' | 'center';

export interface PanelDefinition {
  id: string;
  title: string;
  defaultPosition: DockPosition;
  defaultVisible: boolean;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
}

export interface PanelInstanceState {
  id: string;
  visible: boolean;
  position: DockPosition;
  size: number;
}

export interface DockLayoutState {
  panels: Record<string, PanelInstanceState>;
  zoneOrder: Record<string, string[]>;
  zoneActivePanel: Record<string, string | null>;
  zoneSizes: Record<string, number>;
}

export const ZONE_DEFAULTS: Record<string, number> = {
  left: 260,
  right: 260,
  top: 200,
  bottom: 220,
};

export const ZONE_MIN_SIZES: Record<string, number> = {
  left: 180,
  right: 180,
  top: 80,
  bottom: 80,
};

export function createInitialLayout(panelDefs: PanelDefinition[]): DockLayoutState {
  const state: DockLayoutState = {
    panels: {},
    zoneOrder: { left: [], right: [], top: [], bottom: [], center: [] },
    zoneActivePanel: { left: null, right: null, top: null, bottom: null, center: null },
    zoneSizes: { ...ZONE_DEFAULTS },
  };

  for (const def of panelDefs) {
    const size = def.defaultSize ?? ZONE_DEFAULTS[def.defaultPosition] ?? 260;
    state.panels[def.id] = {
      id: def.id,
      visible: def.defaultVisible,
      position: def.defaultPosition,
      size,
    };
    if (def.defaultVisible) {
      const pos = def.defaultPosition;
      if (state.zoneOrder[pos]) {
        state.zoneOrder[pos].push(def.id);
      }
      if (!state.zoneActivePanel[pos]) {
        state.zoneActivePanel[pos] = def.id;
      }
    }
  }

  return state;
}
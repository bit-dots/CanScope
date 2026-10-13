import { createStore, produce } from 'solid-js/store';
import type { DockLayoutState, DockPosition, PanelDefinition } from './dock-types';
import { createInitialLayout } from './dock-types';

export function useDockManager(panelDefs: PanelDefinition[]) {
  const [layout, setLayout] = createStore<DockLayoutState>(createInitialLayout(panelDefs));

  const togglePanel = (panelId: string) => {
    const panel = layout.panels[panelId];
    if (!panel) return;
    if (panel.visible) {
      closePanel(panelId);
    } else {
      openPanel(panelId);
    }
  };

  const openPanel = (panelId: string) => {
    setLayout(produce((s) => {
      const panel = s.panels[panelId];
      if (!panel) return;
      panel.visible = true;
      const zone = panel.position;
      if (s.zoneOrder[zone] && !s.zoneOrder[zone].includes(panelId)) {
        s.zoneOrder[zone].push(panelId);
      }
      if (s.zoneActivePanel[zone] !== undefined) {
        s.zoneActivePanel[zone] = panelId;
      }
    }));
  };

  const closePanel = (panelId: string) => {
    setLayout(produce((s) => {
      const panel = s.panels[panelId];
      if (!panel) return;
      panel.visible = false;
      for (const zone of Object.keys(s.zoneOrder)) {
        s.zoneOrder[zone] = s.zoneOrder[zone].filter(id => id !== panelId);
        if (s.zoneActivePanel[zone] === panelId) {
          s.zoneActivePanel[zone] = s.zoneOrder[zone].length > 0 ? s.zoneOrder[zone][0] : null;
        }
      }
    }));
  };

  const setActivePanel = (zone: string, panelId: string) => {
    setLayout(produce((s) => {
      if (s.zoneActivePanel[zone] !== undefined) {
        s.zoneActivePanel[zone] = panelId;
      }
    }));
  };

  const movePanel = (panelId: string, targetZone: DockPosition) => {
    setLayout(produce((s) => {
      const panel = s.panels[panelId];
      if (!panel) return;
      const oldZone = panel.position;
      if (oldZone === targetZone) return;

      panel.position = targetZone;

      if (s.zoneOrder[oldZone]) {
        s.zoneOrder[oldZone] = s.zoneOrder[oldZone].filter(id => id !== panelId);
        if (s.zoneActivePanel[oldZone] === panelId) {
          s.zoneActivePanel[oldZone] = s.zoneOrder[oldZone].length > 0 ? s.zoneOrder[oldZone][0] : null;
        }
      }

      if (s.zoneOrder[targetZone] && !s.zoneOrder[targetZone].includes(panelId)) {
        s.zoneOrder[targetZone].push(panelId);
      }
      if (s.zoneActivePanel[targetZone] !== undefined) {
        s.zoneActivePanel[targetZone] = panelId;
      }
    }));
  };

  const resizeZone = (zone: string, size: number) => {
    setLayout(produce((s) => {
      s.zoneSizes[zone] = Math.max(60, size);
    }));
  };

  const getZonePanelIds = (zone: string): string[] => {
    return layout.zoneOrder[zone]?.filter(id => layout.panels[id]?.visible) ?? [];
  };

  const getActivePanelId = (zone: string): string | null => {
    return layout.zoneActivePanel[zone] ?? null;
  };

  const getZoneSize = (zone: string): number => {
    return layout.zoneSizes[zone] ?? 260;
  };

  const isPanelVisible = (panelId: string): boolean => {
    return layout.panels[panelId]?.visible ?? false;
  };

  const resetLayout = () => {
    setLayout(createInitialLayout(panelDefs));
  };

  return {
    layout,
    togglePanel,
    openPanel,
    closePanel,
    setActivePanel,
    movePanel,
    resizeZone,
    getZonePanelIds,
    getActivePanelId,
    getZoneSize,
    isPanelVisible,
    resetLayout,
  };
}
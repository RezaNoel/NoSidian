import type {
  FocusProfile,
  MainSurface,
  RightTab,
  VaultWorkspaceProfile,
  ViewMode,
  WorkspacePanelVisibility,
  WorkspacePresetId,
  WorkspaceUiPrefs
} from './types';

export const WORKSPACE_PRESETS: Record<WorkspacePresetId, WorkspaceUiPrefs> = {
  focused: {
    showFormattingBar: false,
    showPropertiesBlock: false,
    showStatusBar: true,
    pinStudyNoteBtn: false,
    pinDirectionBtn: false,
    pinExtraViewModes: false,
    pinExportBtn: false,
    pinZenBtn: false,
    pinGraphBtn: true,
    pinMindmapBtn: false,
    pinKanbanBtn: false,
    pinFlashcardsBtn: true,
    pinSlidesBtn: false,
    pinDailyNoteBtn: false,
    pinCommandPaletteBtn: false,
    pinAppearanceBtn: true,
    pinAdvancedFormatting: false
  },
  writing: {
    showFormattingBar: true,
    showPropertiesBlock: true,
    showStatusBar: true,
    pinStudyNoteBtn: false,
    pinDirectionBtn: true,
    pinExtraViewModes: false,
    pinExportBtn: true,
    pinZenBtn: true,
    pinGraphBtn: false,
    pinMindmapBtn: false,
    pinKanbanBtn: false,
    pinFlashcardsBtn: false,
    pinSlidesBtn: false,
    pinDailyNoteBtn: true,
    pinCommandPaletteBtn: false,
    pinAppearanceBtn: false,
    pinAdvancedFormatting: false
  },
  review: {
    showFormattingBar: false,
    showPropertiesBlock: false,
    showStatusBar: false,
    pinStudyNoteBtn: true,
    pinDirectionBtn: false,
    pinExtraViewModes: false,
    pinExportBtn: false,
    pinZenBtn: false,
    pinGraphBtn: false,
    pinMindmapBtn: false,
    pinKanbanBtn: false,
    pinFlashcardsBtn: true,
    pinSlidesBtn: false,
    pinDailyNoteBtn: false,
    pinCommandPaletteBtn: false,
    pinAppearanceBtn: false,
    pinAdvancedFormatting: false
  },
  studio: {
    showFormattingBar: true,
    showPropertiesBlock: true,
    showStatusBar: true,
    pinStudyNoteBtn: true,
    pinDirectionBtn: true,
    pinExtraViewModes: true,
    pinExportBtn: true,
    pinZenBtn: true,
    pinGraphBtn: true,
    pinMindmapBtn: true,
    pinKanbanBtn: true,
    pinFlashcardsBtn: true,
    pinSlidesBtn: true,
    pinDailyNoteBtn: true,
    pinCommandPaletteBtn: true,
    pinAppearanceBtn: true,
    pinAdvancedFormatting: true
  }
};

export const DEFAULT_WORKSPACE_PREFS: WorkspaceUiPrefs = WORKSPACE_PRESETS.focused;

export const BUILT_IN_FOCUS_PROFILES: FocusProfile[] = [
  {
    id: 'focused',
    name: 'Clean Minimal',
    builtIn: true,
    layoutPreset: 'split',
    panels: {
      editor: true,
      leftSidebar: true,
      rightSidebar: false,
      ribbon: true,
      statusBar: false
    },
    uiPrefs: {
      ...WORKSPACE_PRESETS.focused,
      showStatusBar: false
    }
  },
  {
    id: 'writing',
    name: 'Deep Writing',
    builtIn: true,
    layoutPreset: 'editor',
    panels: {
      editor: true,
      leftSidebar: false,
      rightSidebar: false,
      ribbon: false,
      statusBar: false
    },
    uiPrefs: {
      ...WORKSPACE_PRESETS.writing,
      showStatusBar: false
    }
  },
  {
    id: 'review',
    name: 'Review & Quiz',
    builtIn: true,
    layoutPreset: 'preview',
    rightTab: 'srs',
    panels: {
      editor: false,
      leftSidebar: false,
      rightSidebar: true,
      ribbon: true,
      statusBar: false
    },
    uiPrefs: WORKSPACE_PRESETS.review
  },
  {
    id: 'studio',
    name: 'Full Studio',
    builtIn: true,
    layoutPreset: 'split',
    panels: {
      editor: true,
      leftSidebar: true,
      rightSidebar: true,
      ribbon: true,
      statusBar: true
    },
    uiPrefs: WORKSPACE_PRESETS.studio
  }
];

export function applyWorkspacePreset(preset: WorkspacePresetId): WorkspaceUiPrefs {
  return { ...WORKSPACE_PRESETS[preset] };
}

export function detectWorkspacePreset(prefs: WorkspaceUiPrefs): WorkspacePresetId | 'custom' {
  const keys = Object.keys(DEFAULT_WORKSPACE_PREFS) as Array<keyof WorkspaceUiPrefs>;
  for (const presetId of ['focused', 'writing', 'review', 'studio'] as const) {
    const target = WORKSPACE_PRESETS[presetId];
    if (keys.every(k => prefs[k] === target[k])) {
      return presetId;
    }
  }
  return 'custom';
}

export function countVisibleControls(prefs: WorkspaceUiPrefs): {
  ribbonPinned: number;
  headerPinned: number;
  barsEnabled: number;
} {
  const ribbonPinned = [
    prefs.pinGraphBtn,
    prefs.pinMindmapBtn,
    prefs.pinKanbanBtn,
    prefs.pinFlashcardsBtn,
    prefs.pinSlidesBtn,
    prefs.pinDailyNoteBtn,
    prefs.pinCommandPaletteBtn,
    prefs.pinAppearanceBtn
  ].filter(Boolean).length;

  const headerPinned = [
    prefs.pinStudyNoteBtn,
    prefs.pinDirectionBtn,
    prefs.pinExtraViewModes,
    prefs.pinExportBtn,
    prefs.pinZenBtn
  ].filter(Boolean).length;

  const barsEnabled = [
    prefs.showFormattingBar,
    prefs.showPropertiesBlock,
    prefs.showStatusBar
  ].filter(Boolean).length;

  return { ribbonPinned, headerPinned, barsEnabled };
}

export function createFocusProfileSnapshot(
  name: string,
  state: {
    layoutPreset: ViewMode;
    rightTab?: RightTab;
    panels: WorkspacePanelVisibility;
    uiPrefs: WorkspaceUiPrefs;
  },
  id?: string
): FocusProfile {
  const trimmed = name.trim() || 'Custom Profile';
  return {
    id: id || `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: trimmed,
    builtIn: false,
    layoutPreset: state.layoutPreset,
    rightTab: state.rightTab,
    panels: { ...state.panels },
    uiPrefs: {
      ...state.uiPrefs,
      showStatusBar: state.panels.statusBar
    }
  };
}

export function isMatchingFocusProfile(
  profile: FocusProfile,
  state: {
    layoutPreset: ViewMode;
    panels: WorkspacePanelVisibility;
    uiPrefs: WorkspaceUiPrefs;
  }
): boolean {
  if (profile.layoutPreset !== state.layoutPreset) return false;
  const panelKeys: Array<keyof WorkspacePanelVisibility> = [
    'editor',
    'leftSidebar',
    'rightSidebar',
    'ribbon',
    'statusBar'
  ];
  for (const pk of panelKeys) {
    if (profile.panels[pk] !== state.panels[pk]) return false;
  }
  const prefKeys = Object.keys(DEFAULT_WORKSPACE_PREFS) as Array<keyof WorkspaceUiPrefs>;
  for (const uk of prefKeys) {
    if (uk === 'showStatusBar') continue;
    if (profile.uiPrefs[uk] !== state.uiPrefs[uk]) return false;
  }
  return true;
}

export function findActiveFocusProfileId(
  profiles: FocusProfile[],
  state: {
    layoutPreset: ViewMode;
    panels: WorkspacePanelVisibility;
    uiPrefs: WorkspaceUiPrefs;
  }
): string | null {
  const found = profiles.find(p => isMatchingFocusProfile(p, state));
  return found ? found.id : null;
}

export function countVisiblePanels(panels: WorkspacePanelVisibility): number {
  return [
    panels.editor,
    panels.leftSidebar,
    panels.rightSidebar,
    panels.ribbon,
    panels.statusBar
  ].filter(Boolean).length;
}

export function createDefaultVaultWorkspaceProfile(): VaultWorkspaceProfile {
  return {
    activeProfileId: 'focused',
    viewMode: 'split',
    showEditorPanel: true,
    leftOpen: true,
    rightOpen: false,
    showRibbon: true,
    uiPrefs: {
      ...WORKSPACE_PRESETS.focused,
      showStatusBar: false
    },
    mainSurface: 'workspace',
    rightTab: 'links'
  };
}

export function extractVaultWorkspaceProfile(state: {
  activeProfileId?: string | null;
  viewMode: ViewMode;
  showEditorPanel: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  showRibbon: boolean;
  uiPrefs: WorkspaceUiPrefs;
  mainSurface?: MainSurface;
  rightTab?: RightTab;
}): VaultWorkspaceProfile {
  return {
    activeProfileId: state.activeProfileId ?? null,
    viewMode: state.viewMode,
    showEditorPanel: state.showEditorPanel,
    leftOpen: state.leftOpen,
    rightOpen: state.rightOpen,
    showRibbon: state.showRibbon,
    uiPrefs: { ...state.uiPrefs },
    mainSurface: state.mainSurface || 'workspace',
    rightTab: state.rightTab || 'links'
  };
}


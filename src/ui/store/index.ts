import { create } from 'zustand';
import type { AvatarRecord } from '@shared/avatarRecord';
import type { Mode, Prefs, SelectionInfo } from '@shared/messages';
import { DEFAULT_PREFS } from '@shared/prefs';
import type {
  ColorGroupSettings,
  ComponentGroupSettings,
  ExportData,
  FrameSettings,
  NormalizeData,
} from '@shared/types';
import { sanitizeComponentSettings } from '@shared/settings';
import { postEvent } from '@/lib/bridge';

export type StyleStatus = 'idle' | 'loading' | 'loaded' | 'none' | 'error';
export type StageKind = 'general' | 'license' | 'component' | 'color';
export type ComponentTab = 'settings' | 'weights' | 'tags' | 'normalize';

export type Progress = { message: string; fraction: number | null };

const EMPTY_SELECTION: SelectionInfo = { targets: [], selectedCount: 0, bounds: null, avatars: [] };

/** How long a settings change waits for the next one before it is sent. */
const SETTINGS_DEBOUNCE_MS = 150;

const settingsTimers = new Map<string, ReturnType<typeof setTimeout>>();
const settingsPosts = new Map<string, () => void>();

function schedulePost(key: string, post: () => void): void {
  const timer = settingsTimers.get(key);

  if (timer !== undefined) {
    clearTimeout(timer);
  }

  settingsPosts.set(key, post);

  settingsTimers.set(
    key,
    setTimeout(() => {
      settingsTimers.delete(key);
      settingsPosts.delete(key);
      post();
    }, SETTINGS_DEBOUNCE_MS),
  );
}

/** Sends every settings change still waiting, before the sandbox reads the frame or the window closes. */
export function flushSettingsPosts(): void {
  const pending = [...settingsPosts.entries()];

  for (const [key, post] of pending) {
    const timer = settingsTimers.get(key);

    if (timer !== undefined) {
      clearTimeout(timer);
    }

    settingsTimers.delete(key);
    settingsPosts.delete(key);
    post();
  }
}

export type StyleState = {
  status: StyleStatus;
  message: string;
  data: ExportData | null;
  normalize: Record<string, NormalizeData>;
  normalizeErrors: Record<string, string>;
  stage: { kind: StageKind; name: string };
  componentTab: ComponentTab;
  warnings: { import: string[]; export: string[] };
  /** Why an import is not possible right now, null when it is. */
  importBlocked: string | null;
};

export type AppState = {
  ready: boolean;
  mode: Mode;
  prefs: Prefs;
  selection: SelectionInfo;
  command: string | null;
  /** The avatar a relaunch button was pressed on, until the tab has acted on it. */
  relaunch: AvatarRecord | null;
  progress: Progress | null;
  style: StyleState;
  /** The avatar the Inspect tab shows, as long as it is still selected. */
  inspectActiveId: string | null;

  init(payload: {
    prefs: Prefs;
    selection: SelectionInfo;
    command: string | null;
    relaunch: AvatarRecord | null;
  }): void;
  setMode(mode: Mode): void;
  setPrefs(patch: Partial<Prefs>): void;
  setSelection(selection: SelectionInfo): void;
  setProgress(progress: Progress | null): void;
  clearRelaunch(): void;
  setInspectActive(id: string): void;

  setStyleStatus(status: StyleStatus, message?: string): void;
  setStyleData(data: ExportData): void;
  setStage(kind: StageKind, name?: string): void;
  setComponentTab(tab: ComponentTab): void;
  setNormalize(data: NormalizeData): void;
  setNormalizeError(group: string, message: string): void;
  clearNormalizeError(group: string): void;
  setWarnings(kind: 'import' | 'export', warnings: string[]): void;
  setImportBlocked(reason: string | null): void;
  updateFrameSettings(patch: Partial<FrameSettings>): void;
  updateComponentSettings(group: string, update: (settings: ComponentGroupSettings) => ComponentGroupSettings): void;
  updateColorSettings(group: string, update: (settings: ColorGroupSettings) => ColorGroupSettings): void;
};

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  mode: 'generate',
  prefs: DEFAULT_PREFS,
  selection: EMPTY_SELECTION,
  command: null,
  relaunch: null,
  progress: null,
  style: {
    status: 'idle',
    message: '',
    data: null,
    normalize: {},
    normalizeErrors: {},
    stage: { kind: 'general', name: '' },
    componentTab: 'settings',
    warnings: { import: [], export: [] },
    importBlocked: null,
  },
  inspectActiveId: null,

  // A relaunch button always opens the Generate tab, which acts on its record.
  init: ({ prefs, selection, command, relaunch }) =>
    set({ ready: true, prefs, mode: command ? 'generate' : prefs.mode, selection, command, relaunch }),

  setMode: (mode) => {
    if (get().mode === mode) {
      return;
    }

    set((state) => ({ mode, prefs: { ...state.prefs, mode } }));
    postEvent({ type: 'ui:mode', mode });
  },

  setPrefs: (patch) => {
    set((state) => ({ prefs: { ...state.prefs, ...patch } }));
    postEvent({ type: 'prefs:set', prefs: patch });
  },

  setSelection: (selection) => set({ selection }),

  setProgress: (progress) => set({ progress }),

  clearRelaunch: () => set({ command: null, relaunch: null }),

  setInspectActive: (inspectActiveId) => set({ inspectActiveId }),

  setStyleStatus: (status, message = '') =>
    set((state) => ({ style: { ...state.style, status, message }, progress: null })),

  setStyleData: (data) => {
    for (const group of Object.values(data.components)) {
      sanitizeComponentSettings(group.settings);
    }

    set((state) => ({
      progress: null,
      style: { ...state.style, status: 'loaded', message: '', data, normalize: {}, normalizeErrors: {} },
    }));
  },

  setStage: (kind, name = '') => set((state) => ({ style: { ...state.style, stage: { kind, name } } })),

  setComponentTab: (componentTab) => set((state) => ({ style: { ...state.style, componentTab } })),

  setNormalize: (data) =>
    set((state) => {
      const normalizeErrors = { ...state.style.normalizeErrors };

      delete normalizeErrors[data.groupName];

      return {
        style: { ...state.style, normalize: { ...state.style.normalize, [data.groupName]: data }, normalizeErrors },
      };
    }),

  setNormalizeError: (group, message) =>
    set((state) => ({
      style: { ...state.style, normalizeErrors: { ...state.style.normalizeErrors, [group]: message } },
    })),

  clearNormalizeError: (group) =>
    set((state) => {
      const normalizeErrors = { ...state.style.normalizeErrors };

      delete normalizeErrors[group];

      return { style: { ...state.style, normalizeErrors } };
    }),

  setWarnings: (kind, warnings) =>
    set((state) => ({ style: { ...state.style, warnings: { ...state.style.warnings, [kind]: warnings } } })),

  setImportBlocked: (importBlocked) => set((state) => ({ style: { ...state.style, importBlocked } })),

  updateFrameSettings: (patch) => {
    const data = get().style.data;

    if (!data) {
      return;
    }

    const settings = { ...data.frame.settings, ...patch };

    set((state) => ({
      style: { ...state.style, data: { ...data, frame: { ...data.frame, settings } } },
    }));
    schedulePost('frame', () => postEvent({ type: 'settings:frame:set', frameId: data.frame.id, settings }));
  },

  updateComponentSettings: (group, update) => {
    const data = get().style.data;
    const entry = data?.components[group];

    if (!data || !entry) {
      return;
    }

    const settings = update(entry.settings);

    sanitizeComponentSettings(settings);

    set((state) => ({
      style: {
        ...state.style,
        data: { ...data, components: { ...data.components, [group]: { ...entry, settings } } },
      },
    }));
    schedulePost(`component:${group}`, () =>
      postEvent({ type: 'settings:component:set', frameId: data.frame.id, group, settings }),
    );
  },

  updateColorSettings: (group, update) => {
    const data = get().style.data;
    const entry = data?.colors[group];

    if (!data || !entry) {
      return;
    }

    const settings = update(entry.settings);

    set((state) => ({
      style: { ...state.style, data: { ...data, colors: { ...data.colors, [group]: { ...entry, settings } } } },
    }));
    schedulePost(`color:${group}`, () =>
      postEvent({ type: 'settings:color:set', frameId: data.frame.id, group, settings }),
    );
  },
}));

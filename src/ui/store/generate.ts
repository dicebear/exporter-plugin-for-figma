import { create } from 'zustand';
import { DEFAULT_LAYOUT, type GenerateLayout, type GenerateResult } from '@shared/messages';
import { clamp } from '@shared/settings';
import type { LibraryItem } from '@shared/storage/library';
import { isEmptyOverride, type Overrides } from '@/lib/render/avatarOptions';
import type { JobProgress } from '@/lib/render/jobRunner';
import type { StyleKey } from '@/lib/render/styleRegistry';
import { freshSeed, randomSalt, type SeedStrategy } from '@/features/generate/lib/seeds';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export type StyleLoad = { status: LoadStatus; error?: string };

export const MAX_INSERT = 100;

const DEFAULT_COUNT = 6;

/** The part of the state that travels with the file. */
export type GenerateSnapshot = {
  v: 1;
  styleKey: StyleKey | null;
  seeds: SeedStrategy;
  count: number;
  overrides: Overrides;
  layout: GenerateLayout;
  modeOverride: 'fill' | 'insert' | null;
};

export function snapshotGenerate(state: GenerateState): GenerateSnapshot {
  return {
    v: 1,
    styleKey: state.styleKey,
    seeds: state.seeds,
    count: state.count,
    overrides: state.overrides,
    layout: state.layout,
    modeOverride: state.modeOverride,
  };
}

/** Reads a stored snapshot back, dropping anything that does not look right. */
export function parseSnapshot(value: unknown): Partial<GenerateSnapshot> | null {
  if (!value || typeof value !== 'object' || (value as GenerateSnapshot).v !== 1) {
    return null;
  }

  const raw = value as Partial<GenerateSnapshot>;
  const next: Partial<GenerateSnapshot> = {};

  if (typeof raw.styleKey === 'string') {
    next.styleKey = raw.styleKey;
  }

  if (raw.seeds && typeof raw.seeds === 'object' && typeof raw.seeds.kind === 'string') {
    next.seeds = raw.seeds;
  }

  if (typeof raw.count === 'number' && Number.isFinite(raw.count)) {
    next.count = clamp(Math.round(raw.count), 1, MAX_INSERT);
  }

  if (raw.overrides && typeof raw.overrides === 'object') {
    next.overrides = raw.overrides;
  }

  if (
    raw.layout &&
    typeof raw.layout === 'object' &&
    typeof raw.layout.size === 'number' &&
    typeof raw.layout.columns === 'number' &&
    typeof raw.layout.gap === 'number'
  ) {
    next.layout = raw.layout;
  }

  if (raw.modeOverride === 'fill' || raw.modeOverride === 'insert' || raw.modeOverride === null) {
    next.modeOverride = raw.modeOverride;
  }

  return next;
}

/** Whether the sidebar is the way the tab opened, so a reset would change nothing. */
export function isDefaultSnapshot(state: GenerateState): boolean {
  return (
    state.seeds.kind === 'random' &&
    state.count === DEFAULT_COUNT &&
    Object.keys(state.overrides).length === 0 &&
    state.layout.size === DEFAULT_LAYOUT.size &&
    state.layout.columns === DEFAULT_LAYOUT.columns &&
    state.layout.gap === DEFAULT_LAYOUT.gap &&
    state.modeOverride === null
  );
}

export type GenerateState = {
  styleKey: StyleKey | null;
  loads: Record<StyleKey, StyleLoad>;
  catalog: { names: string[]; thumbs: Record<string, string>; status: LoadStatus; error?: string };
  library: { items: LibraryItem[]; status: LoadStatus; error?: string };
  seeds: SeedStrategy;
  count: number;
  /** Only the options that differ from the style's own choice. */
  overrides: Overrides;
  layout: GenerateLayout;
  /** The target the user picked by hand, or null while the selection decides. */
  modeOverride: 'fill' | 'insert' | null;
  pickerOpen: boolean;
  job: (JobProgress & { cancel: () => void }) | null;
  lastResult: GenerateResult | null;
  error: string | null;

  selectStyle(key: StyleKey | null): void;
  setLoad(key: StyleKey, load: StyleLoad): void;
  setCatalog(patch: Partial<GenerateState['catalog']>): void;
  addThumbnails(thumbs: Record<string, string>): void;
  setLibrary(patch: Partial<GenerateState['library']>): void;
  setSeeds(seeds: SeedStrategy): void;
  shuffle(): void;
  /** Draws a new seed for one tile, random mode only. */
  rerollSeed(index: number, current: string[]): void;
  setCount(count: number): void;
  /** An empty value takes the option back to the style's own choice. */
  setOverride(name: string, value: unknown): void;
  /** Everything in the sidebar back to the way the tab opened. */
  resetSettings(): void;
  /** Puts a stored snapshot back, without touching what it does not carry. */
  restore(snapshot: Partial<GenerateSnapshot>): void;
  setLayout(patch: Partial<GenerateLayout>): void;
  setModeOverride(mode: 'fill' | 'insert' | null): void;
  setPickerOpen(open: boolean): void;
  setJob(job: GenerateState['job']): void;
  setResult(result: GenerateResult | null): void;
  setError(error: string | null): void;
};

export const useGenerateStore = create<GenerateState>((set) => ({
  styleKey: null,
  loads: {},
  catalog: { names: [], thumbs: {}, status: 'idle' },
  library: { items: [], status: 'idle' },
  seeds: { kind: 'random', salt: randomSalt() },
  count: DEFAULT_COUNT,
  overrides: {},
  layout: DEFAULT_LAYOUT,
  modeOverride: null,
  pickerOpen: false,
  job: null,
  lastResult: null,
  error: null,

  selectStyle: (styleKey) => set({ styleKey, overrides: {}, error: null }),
  setLoad: (key, load) => set((state) => ({ loads: { ...state.loads, [key]: load } })),
  setCatalog: (patch) => set((state) => ({ catalog: { ...state.catalog, ...patch } })),
  addThumbnails: (thumbs) =>
    set((state) => ({ catalog: { ...state.catalog, thumbs: { ...state.catalog.thumbs, ...thumbs } } })),
  setLibrary: (patch) => set((state) => ({ library: { ...state.library, ...patch } })),
  setSeeds: (seeds) => set({ seeds }),
  shuffle: () => set({ seeds: { kind: 'random', salt: randomSalt() } }),
  rerollSeed: (index, current) =>
    set((state) => {
      if (state.seeds.kind !== 'random') {
        return {};
      }

      return { seeds: { ...state.seeds, picks: { ...state.seeds.picks, [index]: freshSeed(current) } } };
    }),
  setCount: (count) => set({ count: clamp(Math.round(count), 1, MAX_INSERT) }),
  setOverride: (name, value) =>
    set((state) => {
      const overrides = { ...state.overrides };

      if (isEmptyOverride(value)) {
        delete overrides[name];
      } else {
        overrides[name] = value;
      }

      return { overrides };
    }),
  resetSettings: () =>
    set({
      seeds: { kind: 'random', salt: randomSalt() },
      count: DEFAULT_COUNT,
      overrides: {},
      layout: DEFAULT_LAYOUT,
      modeOverride: null,
    }),
  restore: (snapshot) => set(snapshot),
  setLayout: (patch) => set((state) => ({ layout: { ...state.layout, ...patch } })),
  setModeOverride: (modeOverride) => set({ modeOverride }),
  setPickerOpen: (pickerOpen) => set({ pickerOpen }),
  setJob: (job) => set({ job }),
  setResult: (lastResult) => set({ lastResult, job: null }),
  setError: (error) => set({ error }),
}));

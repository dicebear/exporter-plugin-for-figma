import type { Mode } from '@shared/messages';
import type { AvatarRecord } from '@shared/avatarRecord';
import { clampWindow, DEFAULT_PREFS } from '@shared/prefs';
import { installBridge, onEvent, onRequest, postEvent } from './bridge';
import { readPrefs, writePrefs } from './prefs';
import { describeSelection } from './selection/describeSelection';
import { collectAvatarRecords, type RecordCandidate } from './selection/collectAvatarRecords';
import {
  onSelectionChange,
  selectionEventsSuppressed,
  suppressSelectionEvents,
  withoutSelectionEvents,
} from './selection/suppress';
import { getFrameSelection } from './utils/getFrameSelection';
import { invalidateExportCache } from './export/exportCache';
import { describeImportBlock, importDefinition } from './import/importDefinition';
import { DefinitionFile } from './types';
import { refreshStyle } from './utils/processTask';
import { setComponentGroupSettings } from './settings/setComponentGroupSettings';
import { setFrameSettings } from './settings/setFrameSettings';
import { getFrameSettings } from './settings/getFrameSettings';
import { createExport } from './export/createExport';
import { setColorGroupSettings } from './settings/setColorGroupSettings';
import { prepareNormalize } from './normalize/prepareNormalize';
import { applyNormalize } from './normalize/applyNormalize';
import { acknowledgeProgress } from './utils/postProgress';
import { beginJob, endJob, runChunk } from './generate/batches';

/** How long a burst of selection changes settles before the window hears of it. */
const SELECTION_DEBOUNCE_MS = 50;

/** Where the Generate settings of this document live. */
const FILE_SETTINGS_KEY = 'generate';

let prefs = DEFAULT_PREFS;
let mode: Mode = prefs.mode;
let selectionTimer: ReturnType<typeof setTimeout> | null = null;

figma.skipInvisibleInstanceChildren = true;

// The window opens right away at the default size and takes the remembered
// one as soon as the store answers.
figma.showUI(__html__, { themeColors: true, ...DEFAULT_PREFS.window });

const prefsLoaded = readPrefs().then((stored) => {
  prefs = stored;
  mode = stored.mode;
  figma.ui.resize(stored.window.width, stored.window.height);
});

function reportSelection(): void {
  postEvent({ type: 'selection:changed', selection: describeSelection(mode) });

  if (mode === 'style') {
    refreshStyle();
  }
}

function scheduleReport(): void {
  if (selectionTimer !== null) {
    clearTimeout(selectionTimer);
  }

  selectionTimer = setTimeout(() => {
    selectionTimer = null;
    reportSelection();
  }, SELECTION_DEBOUNCE_MS);
}

// A release and the real event that trails it share the debounce, so they
// arrive as one report.
onSelectionChange(scheduleReport);

figma.on('selectionchange', () => {
  if (selectionEventsSuppressed()) {
    return;
  }

  scheduleReport();
});

function getNormalizePrecision(): number {
  return getFrameSettings(getFrameSelection(), []).precision;
}

function findOwnerPage(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;

  while (current && current.type !== 'PAGE') {
    current = current.parent;
  }

  return current as PageNode | null;
}

/** The first avatar record in the selection, for a relaunch button. */
function findRelaunchRecord(): AvatarRecord | null {
  const selection = figma.currentPage.selection as unknown as readonly RecordCandidate[];

  return collectAvatarRecords(selection)[0]?.record ?? null;
}

async function savePrefs(patch: Partial<typeof prefs>): Promise<void> {
  prefs = { ...prefs, ...patch };
  await writePrefs(prefs);
}

function readFileSettings(): unknown {
  try {
    const raw = figma.root.getPluginData(FILE_SETTINGS_KEY);

    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

onEvent('ui:ready', async () => {
  // The window opens on the remembered tab, so the selection is described
  // for that tab, not for the default one.
  await prefsLoaded;

  // A relaunch button belongs to the Generate tab, whatever tab was open last.
  if (figma.command) {
    mode = 'generate';
  }

  postEvent({
    type: 'plugin:init',
    prefs: { ...prefs, mode },
    selection: describeSelection(mode),
    command: figma.command || null,
    relaunch: figma.command ? findRelaunchRecord() : null,
    fileSettings: readFileSettings(),
  });

  if (mode === 'style') {
    refreshStyle();
  }
});

onEvent('ui:mode', (event) => {
  mode = event.mode;
  void savePrefs({ mode });
  reportSelection();
});

onEvent('ui:resize', (event) => {
  const size = clampWindow(event);

  figma.ui.resize(size.width, size.height);
  void savePrefs({ window: size });
});

onEvent('prefs:set', (event) => {
  void savePrefs(event.prefs);
});

onEvent('file-settings:set', (event) => {
  figma.root.setPluginData(FILE_SETTINGS_KEY, JSON.stringify(event.settings));
});

onEvent('progress:painted', (event) => {
  acknowledgeProgress(event.step);
});

onEvent('style:refresh', () => {
  refreshStyle();
});

/** The frame a settings change names, null when it is gone or no longer a style frame. */
async function resolveSettingsFrame(frameId: string): Promise<FrameNode | null> {
  const node = await figma.getNodeByIdAsync(frameId);

  if (!node || node.type !== 'FRAME' || node.removed || node.width !== node.height) {
    console.warn(`Dropped a settings change for frame ${frameId}, which is gone or not a square frame.`);

    return null;
  }

  return node;
}

onEvent('settings:frame:set', async (event) => {
  const frame = await resolveSettingsFrame(event.frameId);

  if (!frame) {
    return;
  }

  setFrameSettings(frame, event.settings);
  invalidateExportCache();
});

onEvent('settings:component:set', async (event) => {
  const frame = await resolveSettingsFrame(event.frameId);

  if (!frame) {
    return;
  }

  setComponentGroupSettings(frame, event.group, event.settings);
  invalidateExportCache();
});

onEvent('settings:color:set', async (event) => {
  const frame = await resolveSettingsFrame(event.frameId);

  if (!frame) {
    return;
  }

  setColorGroupSettings(frame, event.group, event.settings);
  invalidateExportCache();
});

onRequest('export:run', async () => createExport());

onRequest('import:run', async ({ definition, name, picksBySeed }) =>
  withoutSelectionEvents(async () => {
    const warnings = await importDefinition(definition as DefinitionFile, name, picksBySeed);

    invalidateExportCache();

    return { warnings };
  }),
);

onRequest('import:check', async () => ({ blocked: await describeImportBlock() }));

onRequest('normalize:prepare', async ({ group }) => prepareNormalize(group, getNormalizePrecision()));

onRequest('normalize:apply', async ({ group }) => {
  const precision = getNormalizePrecision();

  await applyNormalize(group, precision);

  return prepareNormalize(group, precision);
});

onRequest('canvas:reveal', async ({ ids, select = false }) => {
  const resolved = await Promise.all(ids.map((id) => figma.getNodeByIdAsync(id)));
  const nodes = resolved.filter((n): n is SceneNode => !!n && n.type !== 'PAGE' && n.type !== 'DOCUMENT');
  const targetPage = nodes.length > 0 ? findOwnerPage(nodes[0]) : null;

  if (!targetPage) {
    return {};
  }

  if (figma.currentPage !== targetPage) {
    await figma.setCurrentPageAsync(targetPage);
  }

  const onPage = nodes.filter((n) => findOwnerPage(n) === targetPage);

  if (select) {
    figma.currentPage.selection = onPage;
  }

  figma.viewport.scrollAndZoomIntoView(onPage);

  return {};
});

onRequest('storage:get', async ({ key }) => ({ value: await figma.clientStorage.getAsync(key) }));

onRequest('storage:set', async ({ key, value }) => {
  await figma.clientStorage.setAsync(key, value);

  return {};
});

onRequest('storage:delete', async ({ key }) => {
  await figma.clientStorage.deleteAsync(key);

  return {};
});

onRequest('storage:keys', async () => ({ keys: await figma.clientStorage.keysAsync() }));

// A job holds selection events from `begin` to `end`, across its chunks.
let releaseJob: (() => void) | null = null;

onRequest('generate:begin', async (params) => {
  releaseJob?.();
  releaseJob = suppressSelectionEvents();
  beginJob(params);

  return {};
});

onRequest('generate:chunk', async (params) => runChunk(params));

onRequest('generate:end', async (params) => {
  try {
    return endJob(params);
  } finally {
    // The job selected what it made, which the release reports.
    releaseJob?.();
    releaseJob = null;
  }
});

installBridge();

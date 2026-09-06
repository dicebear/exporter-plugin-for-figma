import type { GenerateFillItem, GenerateInsertItem, GenerateLayout, GenerateSkip, RequestMap } from '@shared/messages';
import { DEFAULT_LAYOUT } from '@shared/messages';
import { AVATAR_DATA_KEY, encodeAvatarRecord, type AvatarRecord } from '@shared/avatarRecord';
import { cleanSvg } from '@shared/cleanSvg';
import { errorMessage } from '@shared/errors';
import { tick } from '@shared/tick';
import { postProgress } from '../utils/postProgress';
import { gridPoint } from './layoutGrid';
import { resolvePlacement, type Placement } from './placement';
import { unionBounds } from '../selection/describeSelection';

type BeginParams = RequestMap['generate:begin']['params'];
type ChunkParams = RequestMap['generate:chunk']['params'];
type EndParams = RequestMap['generate:end']['params'];
type Result = RequestMap['generate:end']['result'];

/**
 * One generate job: a `begin`, any number of chunks, an `end`. Everything in
 * between is one undo step.
 */
type Job = {
  id: number;
  mode: 'fill' | 'insert';
  total: number;
  styleTitle: string;
  layout: GenerateLayout;
  placement: Placement | null;
  done: number;
  applied: string[];
  skipped: GenerateSkip[];
  created: SceneNode[];
};

let current: Job | null = null;

/** How many nodes the loop handles before it lets the window paint. */
const YIELD_EVERY = 8;

function stamp(node: SceneNode, record: AvatarRecord): void {
  node.setPluginData(AVATAR_DATA_KEY, encodeAvatarRecord(record));
  node.setRelaunchData({ regenerate: 'New seeds, same style', restyle: 'Pick another style' });
}

export function beginJob(params: BeginParams): void {
  const layout = params.layout ?? DEFAULT_LAYOUT;

  figma.commitUndo();

  current = {
    id: params.jobId,
    mode: params.mode,
    total: params.total,
    styleTitle: params.styleTitle,
    layout,
    placement:
      params.mode === 'insert'
        ? resolvePlacement(params.total, layout, params.anchor ?? 'viewport', unionBounds(figma.currentPage.selection))
        : null,
    done: 0,
    applied: [],
    skipped: [],
    created: [],
  };
}

function requireJob(jobId: number): Job {
  if (!current || current.id !== jobId) {
    throw new Error('This generate job is no longer running.');
  }

  return current;
}

function fillOne(job: Job, item: GenerateFillItem, node: BaseNode | null): void {
  const skip = (name: string, message: string): void => {
    job.skipped.push({ name, message });
  };

  if (!node || node.removed || node.type === 'PAGE' || node.type === 'DOCUMENT') {
    return skip('A layer', 'The layer no longer exists.');
  }

  const scene = node as SceneNode;

  if (scene.locked) {
    return skip(scene.name, 'The layer is locked.');
  }

  if (!('fills' in scene)) {
    return skip(scene.name, 'The layer takes no fill.');
  }

  try {
    const image = figma.createImage(item.png);

    scene.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
  } catch (e) {
    return skip(scene.name, errorMessage(e));
  }

  stamp(scene, item.record);
  job.applied.push(item.nodeId);
}

function insertOne(job: Job, item: GenerateInsertItem, index: number): void {
  const placement = job.placement!;
  const size = job.layout.size;
  let frame: FrameNode;

  try {
    frame = figma.createNodeFromSvg(cleanSvg(item.svg));
  } catch (e) {
    job.skipped.push({ name: item.name, message: errorMessage(e) });

    return;
  }

  frame.name = item.name;
  frame.clipsContent = true;

  if (frame.width !== size || frame.height !== size) {
    frame.resize(size, size);
  }

  const point = gridPoint(index, job.layout, placement.origin);

  placement.parent.appendChild(frame);
  frame.x = point.x;
  frame.y = point.y;
  stamp(frame, item.record);
  job.applied.push(frame.id);
  job.created.push(frame);
}

export async function runChunk(params: ChunkParams): Promise<{ done: number }> {
  const job = requireJob(params.jobId);
  const fills = params.fills ?? [];
  // The lookups are independent, so they go out together.
  const nodes = await Promise.all(fills.map((item) => figma.getNodeByIdAsync(item.nodeId)));
  let handled = 0;

  for (let index = 0; index < fills.length; index++) {
    fillOne(job, fills[index], nodes[index]);
    job.done++;

    if (++handled % YIELD_EVERY === 0) {
      await tick();
    }
  }

  for (const item of params.inserts ?? []) {
    insertOne(job, item, job.done);
    job.done++;

    if (++handled % YIELD_EVERY === 0) {
      await tick();
    }
  }

  const verb = job.mode === 'fill' ? 'Filling' : 'Inserting';

  await postProgress(`${verb} ${job.done} of ${job.total}`, job.done / job.total);

  return { done: job.done };
}

function onCurrentPage(node: SceneNode): boolean {
  let ancestor: BaseNode | null = node.parent;

  while (ancestor && ancestor.type !== 'PAGE') {
    ancestor = ancestor.parent;
  }

  return ancestor === figma.currentPage;
}

export function endJob(params: EndParams): Result {
  const job = requireJob(params.jobId);

  current = null;
  figma.commitUndo();

  const alive = job.created.filter((node) => !node.removed && node.parent !== null && onCurrentPage(node));

  if (alive.length > 0) {
    figma.currentPage.selection = alive;
    figma.viewport.scrollAndZoomIntoView(alive);
  }

  const count = job.applied.length;
  const noun = job.mode === 'fill' ? `layer${count === 1 ? '' : 's'}` : `avatar${count === 1 ? '' : 's'}`;
  const verb = job.mode === 'fill' ? 'Filled' : 'Inserted';
  let message = `${verb} ${count} ${noun} with ${job.styleTitle}`;

  if (job.skipped.length > 0) {
    message += `, ${job.skipped.length} skipped`;
  }

  if (params.cancelled) {
    message += ' (cancelled)';
  }

  figma.notify(message, {
    timeout: 4000,
    button: count > 0 ? { text: 'Undo', action: () => figma.triggerUndo() } : undefined,
  });

  return { applied: job.applied, skipped: job.skipped };
}

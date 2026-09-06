import { errorMessage } from '@shared/errors';
import { runFillJob, runInsertJob } from '@/lib/render/jobRunner';
import type { StyleEntry } from '@/lib/render/styleRegistry';
import { useAppStore } from '@/store';
import { useGenerateStore } from '@/store/generate';
import { usableTargets } from './targets';

/** Starts the job the footer button describes and keeps the store informed. */
export async function runGenerate(entry: StyleEntry, mode: 'fill' | 'insert', seeds: string[]): Promise<void> {
  const generate = useGenerateStore.getState();
  const controller = new AbortController();
  const targets = usableTargets(useAppStore.getState().selection.targets);
  const common = {
    entry,
    overrides: generate.overrides,
    seeds,
    signal: controller.signal,
    onProgress: (progress: { phase: 'rendering' | 'applying'; done: number; total: number }) =>
      useGenerateStore.getState().setJob({ ...progress, cancel: () => controller.abort() }),
  };

  generate.setError(null);
  generate.setJob({
    phase: 'rendering',
    done: 0,
    total: mode === 'fill' ? targets.length : seeds.length,
    cancel: () => controller.abort(),
  });

  try {
    const result =
      mode === 'fill'
        ? await runFillJob({ ...common, targets })
        : await runInsertJob({
            ...common,
            layout: generate.layout,
            anchor: useAppStore.getState().selection.bounds ? 'selection' : 'viewport',
          });

    useGenerateStore.getState().setResult(result);
  } catch (error) {
    useGenerateStore.getState().setJob(null);
    useGenerateStore.getState().setError(errorMessage(error));
  }
}

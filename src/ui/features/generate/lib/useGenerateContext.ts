import { useMemo } from 'react';
import { useStyleEntryFor, type StyleEntryState } from '@/hooks/useStyleEntry';
import { useAppStore } from '@/store';
import { useGenerateStore } from '@/store/generate';
import { resolveSeeds } from './seeds';
import { usableTargets } from './targets';

/** The style the Generate tab works with. */
export function useStyleEntry(): StyleEntryState {
  return useStyleEntryFor(useGenerateStore((state) => state.styleKey));
}

/** Fill when something fillable is selected, insert otherwise, unless the user said so. */
export function useTargetMode(): 'fill' | 'insert' {
  const targets = useAppStore((state) => state.selection.targets);
  const override = useGenerateStore((state) => state.modeOverride);

  return override ?? (targets.length > 0 ? 'fill' : 'insert');
}

/** The seeds the current settings produce, in the order the job uses them. */
export function useSeeds(mode: 'fill' | 'insert'): string[] {
  const targets = useAppStore((state) => state.selection.targets);
  const strategy = useGenerateStore((state) => state.seeds);
  const count = useGenerateStore((state) => state.count);

  // Only the names of the usable layers matter here, so a selection event
  // that changes nothing else keeps the seeds, and with them the previews.
  const layerNames = useMemo(() => usableTargets(targets).map((target) => target.name), [targets]);
  const namesKey = layerNames.join('\n');

  return useMemo(
    () => resolveSeeds(strategy, { count: mode === 'fill' ? layerNames.length : count, layerNames, mode }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [strategy, count, mode, namesKey],
  );
}

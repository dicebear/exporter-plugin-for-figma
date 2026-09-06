import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { DisabledButton } from '@/components/DisabledButton';
import type { StyleEntry } from '@/lib/render/styleRegistry';
import { useAppStore } from '@/store';
import { useGenerateStore } from '@/store/generate';
import { runGenerate } from './lib/runGenerate';
import { usableTargets } from './lib/targets';

type Props = {
  entry: StyleEntry | null;
  mode: 'fill' | 'insert';
  seeds: string[];
};

export function GenerateFooter({ entry, mode, seeds }: Props) {
  const targets = useAppStore((state) => state.selection.targets);
  const job = useGenerateStore((state) => state.job);
  const lastResult = useGenerateStore((state) => state.lastResult);
  const usable = usableTargets(targets);
  const count = mode === 'fill' ? usable.length : seeds.length;

  let reason: string | null = null;

  if (!entry) {
    reason = 'Pick a style first.';
  } else if (mode === 'fill' && usable.length === 0) {
    reason = 'Select layers to fill, or insert new avatars.';
  } else if (seeds.length === 0) {
    reason = 'Add at least one seed.';
  }

  const label =
    mode === 'fill'
      ? `Fill ${count} layer${count === 1 ? '' : 's'}`
      : `Insert ${count} avatar${count === 1 ? '' : 's'}`;
  const status = job
    ? `${job.phase === 'rendering' ? 'Rendering' : 'Placing'} ${job.done} of ${job.total}`
    : lastResult
      ? `Done, ${lastResult.applied.length} placed${lastResult.skipped.length > 0 ? `, ${lastResult.skipped.length} skipped` : ''}`
      : entry
        ? `${count} avatar${count === 1 ? '' : 's'} in ${entry.title}`
        : '';

  return (
    <>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{status}</span>
      {job ? (
        <>
          <Progress className="h-1 w-32 [&>div]:transition-none" value={(job.done / Math.max(1, job.total)) * 100} />
          <Button variant="outline" size="sm" onClick={job.cancel}>
            Cancel
          </Button>
        </>
      ) : (
        <DisabledButton size="sm" reason={reason} onClick={() => entry && runGenerate(entry, mode, seeds)}>
          {label}
        </DisabledButton>
      )}
    </>
  );
}

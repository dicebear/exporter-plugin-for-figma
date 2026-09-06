import { useAppStore } from '@/store';
import { useGenerateStore } from '@/store/generate';
import { Section } from '@/components/Section';
import { Segmented } from '@/components/Segmented';
import { usableTargets } from '../lib/targets';

/** Fill the selection or insert new avatars, with the selection spelled out. */
export function TargetSection({ mode }: { mode: 'fill' | 'insert' }) {
  const selection = useAppStore((state) => state.selection);
  const setModeOverride = useGenerateStore((state) => state.setModeOverride);
  const usable = usableTargets(selection.targets);
  const locked = selection.targets.length - usable.length;
  const skipped = selection.selectedCount - selection.targets.length;

  let hint: string;

  if (mode === 'insert') {
    hint = selection.bounds
      ? 'New avatars are placed below the selection as vector frames.'
      : 'New avatars are placed in the middle of the view as vector frames.';
  } else if (selection.selectedCount === 0) {
    hint = 'Select rectangles, ellipses or frames on the canvas. Each gets an avatar as its fill.';
  } else if (usable.length === 0) {
    hint = 'Nothing in the selection can take a fill. Select shapes or frames, or insert new avatars instead.';
  } else {
    const notes: string[] = [];

    if (locked > 0) {
      notes.push(`${locked} locked`);
    }

    if (skipped > 0) {
      notes.push(`${skipped} without a fill`);
    }

    hint = `Each selected layer keeps its shape and gets an avatar as its fill.${notes.length > 0 ? ` Skipped: ${notes.join(', ')}.` : ''}`;
  }

  return (
    <Section title="Target">
      <Segmented
        value={mode}
        onChange={setModeOverride}
        options={[
          { value: 'fill', label: usable.length > 0 ? `Fill ${usable.length} selected` : 'Fill selection' },
          { value: 'insert', label: 'Insert new' },
        ]}
      />
      <p className="text-muted-foreground">{hint}</p>
    </Section>
  );
}

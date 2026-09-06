import { useEffect, useState, type ComponentProps } from 'react';
import { clamp } from '@shared/settings';
import { Input } from '@/components/ui/input';

type Base = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  min?: number;
  max?: number;
};

type Props = Base &
  (
    | { nullable?: false; value: number; onCommit: (value: number) => void }
    | { nullable: true; value: number | null; onCommit: (value: number | null) => void }
  );

/**
 * A number field that reports on blur or Enter, not on every keystroke, so a
 * half-typed value never reaches the sandbox. The value is kept within
 * `min` and `max`; a nullable field treats an empty box as "no value".
 */
export function NumberInput({ value, onCommit, min, max, nullable, ...props }: Props) {
  const text = value === null ? '' : String(value);
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    setDraft(text);
  }, [text]);

  const commit = () => {
    if (draft.trim() === '') {
      if (nullable && value !== null) {
        onCommit(null);
      } else if (!nullable) {
        setDraft(text);
      }

      return;
    }

    const parsed = Number(draft);

    if (!Number.isFinite(parsed)) {
      setDraft(text);

      return;
    }

    const next = clamp(parsed, min ?? -Infinity, max ?? Infinity);

    if (next !== value) {
      (onCommit as (value: number) => void)(next);
    } else {
      setDraft(text);
    }
  };

  return (
    <Input
      type="number"
      min={min}
      max={max}
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          (event.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

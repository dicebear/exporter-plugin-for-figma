import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, toggleInList } from '@/lib/utils';

type Props = {
  palette: string[];
  selected: string[];
  allowTransparent?: boolean;
  onChange: (selected: string[]) => void;
};

/**
 * Picks the colors a palette may draw from: the style's own swatches plus any
 * color the user adds with the color picker. Nothing selected means the
 * style chooses freely.
 */
const HEX = /^[0-9a-f]{6}$/i;

/** A transparent background, as the hex with alpha the renderer accepts. */
const TRANSPARENT = '00000000';

export function ColorListField({ palette, selected, allowTransparent, onChange }: Props) {
  const custom = selected.filter((value) => !palette.includes(value) && value !== TRANSPARENT);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('4f46e5');
  const valid = HEX.test(draft);

  const toggle = (value: string) => onChange(toggleInList(selected, value));

  const add = () => {
    const value = draft.toLowerCase();

    if (valid && !selected.includes(value)) {
      onChange([...selected, value]);
    }

    setOpen(false);
  };

  // Shadows only, so a selection never moves the row.
  const ring = 'ring-2 ring-ring inset-ring-2 inset-ring-background';

  return (
    <div className="flex flex-wrap items-center gap-1">
      {allowTransparent && (
        <button
          type="button"
          title="transparent"
          className={cn(
            'size-5 rounded-md border bg-[linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%),linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%)] bg-[length:6px_6px] bg-[position:0_0,3px_3px]',
            selected.includes(TRANSPARENT) && ring,
          )}
          onClick={() => toggle(TRANSPARENT)}
        />
      )}
      {[...palette, ...custom].map((value) => (
        <button
          key={value}
          type="button"
          title={`#${value}`}
          className={cn('size-5 rounded-md border', selected.includes(value) && ring)}
          style={{ backgroundColor: `#${value}` }}
          onClick={() => toggle(value)}
        />
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Add a color"
            className="flex size-5 items-center justify-center rounded-md border border-dashed text-icon-secondary hover:text-foreground"
          >
            <Plus className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" collisionPadding={8} className="flex w-56 items-center gap-2 p-2">
          {/* The picker itself has no confirm step, so the choice lands here first. */}
          <input
            type="color"
            aria-label="Pick a color"
            className="size-7 shrink-0 cursor-pointer rounded-md border bg-transparent p-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0.5"
            value={valid ? `#${draft}` : '#000000'}
            onChange={(event) => setDraft(event.target.value.slice(1))}
          />
          <Input
            className="h-7 flex-1 font-mono"
            value={draft}
            onChange={(event) => setDraft(event.target.value.replace(/^#/, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                add();
              }
            }}
          />
          <Button size="sm" onClick={add} disabled={!valid}>
            Add
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

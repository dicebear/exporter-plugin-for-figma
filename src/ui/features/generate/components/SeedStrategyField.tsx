import { Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NumberInput } from '@/components/fields/NumberInput';
import { SimpleSelect } from '@/components/fields/SimpleSelect';
import { MAX_INSERT, useGenerateStore } from '@/store/generate';
import { listSeeds, randomSalt, type SeedStrategy } from '../lib/seeds';
import { Section } from '@/components/Section';

const KINDS: { value: SeedStrategy['kind']; label: string }[] = [
  { value: 'random', label: 'Random' },
  { value: 'layerNames', label: 'Layer names' },
  { value: 'list', label: 'From a list' },
  { value: 'numbered', label: 'Numbered' },
];

export function SeedStrategyField({ mode }: { mode: 'fill' | 'insert' }) {
  const seeds = useGenerateStore((state) => state.seeds);
  const setSeeds = useGenerateStore((state) => state.setSeeds);
  const shuffle = useGenerateStore((state) => state.shuffle);
  const count = useGenerateStore((state) => state.count);
  const setCount = useGenerateStore((state) => state.setCount);

  const setKind = (kind: string) => {
    switch (kind as SeedStrategy['kind']) {
      case 'random':
        setSeeds({ kind: 'random', salt: randomSalt() });
        break;
      case 'layerNames':
        setSeeds({ kind: 'layerNames' });
        break;
      case 'list':
        setSeeds({ kind: 'list', text: seeds.kind === 'list' ? seeds.text : '' });
        break;
      case 'numbered':
        setSeeds({ kind: 'numbered', prefix: 'user-', start: 1 });
        break;
    }
  };

  const options = KINDS.filter((kind) => mode === 'fill' || kind.value !== 'layerNames');
  // Inserting has no layers to name, so a stored layer-name strategy shows and acts as random.
  const shownKind = mode === 'insert' && seeds.kind === 'layerNames' ? 'random' : seeds.kind;
  const listCount = seeds.kind === 'list' ? listSeeds(seeds.text).length : 0;

  return (
    <Section
      title={mode === 'insert' ? 'Avatars' : 'Seeds'}
      aside={
        seeds.kind === 'random' && (
          <Button variant="ghost" size="xs" onClick={shuffle}>
            <Shuffle /> Shuffle
          </Button>
        )
      }
    >
      {mode === 'insert' && (
        <label className="flex items-center gap-2">
          <span className="flex-1">How many</span>
          <NumberInput
            size="sm"
            className="w-20 text-right"
            value={count}
            min={1}
            max={MAX_INSERT}
            onCommit={setCount}
          />
        </label>
      )}
      <label className="flex items-center gap-2">
        <span className="flex-1">Seeds</span>
        <SimpleSelect className="w-[136px]" value={shownKind} options={options} onChange={(kind) => setKind(kind!)} />
      </label>
      {shownKind === 'random' && <p className="text-muted-foreground">Every avatar gets a seed of its own.</p>}
      {shownKind === 'layerNames' && (
        <p className="text-muted-foreground">Each layer is drawn from its name. Rename the layer to change the face.</p>
      )}
      {seeds.kind === 'list' && (
        <>
          <Textarea
            rows={4}
            placeholder={'One seed per line\nAlice\nBob'}
            value={seeds.text}
            onChange={(event) => setSeeds({ kind: 'list', text: event.target.value })}
          />
          <p className="text-muted-foreground">
            {listCount} seed{listCount === 1 ? '' : 's'}. The list repeats when there are more avatars than lines.
          </p>
        </>
      )}
      {seeds.kind === 'numbered' && (
        <div className="flex items-center gap-2">
          <Input
            size="sm"
            className="flex-1"
            placeholder="Prefix"
            value={seeds.prefix}
            onChange={(event) => setSeeds({ ...seeds, prefix: event.target.value })}
          />
          <NumberInput
            size="sm"
            className="w-20 text-right"
            value={seeds.start}
            onCommit={(value) => setSeeds({ ...seeds, start: Math.round(value) })}
          />
        </div>
      )}
    </Section>
  );
}

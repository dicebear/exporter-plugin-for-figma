import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FieldReset } from '@/components/fields/FieldReset';
import { FieldRow } from '@/components/fields/FieldRow';
import { RangeField } from '@/components/fields/RangeField';
import { Spinner } from '@/components/Spinner';
import { request } from '@/lib/bridge';
import { flushSettingsPosts, useAppStore, type ComponentTab } from '@/store';
import { AliasBanner, Banner } from './AliasBanner';
import { TagsTable } from './TagsTable';
import { VariantTable } from './VariantTable';
import { WeightTable } from './WeightTable';

/** The transform ranges of a component group, in the order the form shows them. */
const RANGES: {
  key: 'rotation' | 'translateX' | 'translateY' | 'scale';
  label: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
}[] = [
  { key: 'rotation', label: 'Rotation (in deg)', defaultValue: 0, min: -360, max: 360, step: 1, unit: '°' },
  { key: 'translateX', label: 'Translate X (in %)', defaultValue: 0, min: -1000, max: 1000, step: 1, unit: '%' },
  { key: 'translateY', label: 'Translate Y (in %)', defaultValue: 0, min: -1000, max: 1000, step: 1, unit: '%' },
  { key: 'scale', label: 'Scale', defaultValue: 1, min: 0, max: 10, step: 0.01 },
];

export function ComponentGroupPanel({ group }: { group: string }) {
  const data = useAppStore((state) => state.style.data)!;
  const tab = useAppStore((state) => state.style.componentTab);
  const setTab = useAppStore((state) => state.setComponentTab);
  const update = useAppStore((state) => state.updateComponentSettings);
  const normalizeData = useAppStore((state) => state.style.normalize[group]);
  const normalizeError = useAppStore((state) => state.style.normalizeErrors[group]);
  const setNormalize = useAppStore((state) => state.setNormalize);
  const setNormalizeError = useAppStore((state) => state.setNormalizeError);
  const clearNormalizeError = useAppStore((state) => state.clearNormalizeError);

  const entry = data.components[group];
  const settings = entry.settings;
  const aliases = Object.keys(data.components)
    .filter((name) => data.components[name].extendsGroup === group)
    .sort();

  const fetchNormalize = () => {
    clearNormalizeError(group);
    flushSettingsPosts();
    request('normalize:prepare', { group })
      .then(setNormalize)
      .catch((error: Error) => setNormalizeError(group, error.message));
  };

  // Always re-read when entering the tab: Figma may have been edited since,
  // and a stale preview would mislead.
  useEffect(() => {
    if (tab === 'normalize' && !entry.extendsGroup) {
      fetchNormalize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, group]);

  if (entry.extendsGroup) {
    return (
      <AliasBanner
        group={group}
        source={entry.extendsGroup}
        instanceIds={entry.aliasInstanceIds ?? []}
        onReveal={() =>
          request('canvas:reveal', { ids: entry.aliasInstanceIds ?? [], select: true }).catch(() => undefined)
        }
      />
    );
  }

  const probability = typeof settings.probability === 'number' ? settings.probability : 100;
  const hasCustomWeights = Object.values(settings.weights).some((weight) => weight !== 1);

  return (
    <>
      {aliases.length > 0 && (
        <Banner>
          Used by{' '}
          {aliases.map((name, index) => (
            <span key={name}>
              <strong>{name}</strong>
              {index < aliases.length - 1 ? ', ' : ''}
            </span>
          ))}
          . Changes propagate to those aliases.
        </Banner>
      )}

      <Tabs value={tab} onValueChange={(value) => setTab(value as ComponentTab)} className="mb-3">
        <TabsList variant="line" className="h-8 w-full justify-start border-b">
          <TabsTrigger value="settings" className="flex-none px-2.5">
            Settings
          </TabsTrigger>
          <TabsTrigger value="weights" className="flex-none px-2.5">
            Weights
          </TabsTrigger>
          <TabsTrigger value="tags" className="flex-none px-2.5">
            Tags
          </TabsTrigger>
          <TabsTrigger value="normalize" className="flex-none px-2.5">
            Normalize
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'settings' && (
        <>
          <FieldRow
            label="Probability (in percent)"
            action={
              settings.probability !== null && (
                <FieldReset onClick={() => update(group, (s) => ({ ...s, probability: null }))} />
              )
            }
            value={`${probability}%`}
          >
            <Slider
              value={[probability]}
              min={0}
              max={100}
              step={1}
              onValueChange={([value]) => update(group, (s) => ({ ...s, probability: value }))}
            />
          </FieldRow>
          {RANGES.map((range) => (
            <RangeField
              key={range.key}
              label={range.label}
              value={settings[range.key]}
              defaultValue={range.defaultValue}
              min={range.min}
              max={range.max}
              step={range.step}
              unit={range.unit}
              onChange={(value) => update(group, (s) => ({ ...s, [range.key]: value }))}
            />
          ))}
        </>
      )}

      {tab === 'weights' && (
        <>
          <p className="mb-3 leading-relaxed text-muted-foreground [&_strong]:text-foreground">
            Higher values make a variant more likely to be picked. The default is <strong>1</strong>, and{' '}
            <strong>0</strong> means never picked unless every variant is 0. Range 0 to 1,000,000.
          </p>
          <FieldRow
            label="Weights"
            action={
              hasCustomWeights && (
                <FieldReset
                  onClick={() =>
                    update(group, (s) => ({
                      ...s,
                      weights: Object.fromEntries(Object.keys(s.weights).map((key) => [key, 1])),
                    }))
                  }
                />
              )
            }
          >
            <WeightTable
              weights={settings.weights}
              onChange={(name, weight) => update(group, (s) => ({ ...s, weights: { ...s.weights, [name]: weight } }))}
            />
          </FieldRow>
        </>
      )}

      {tab === 'tags' && (
        <>
          <p className="mb-3 leading-relaxed text-muted-foreground [&_strong]:text-foreground">
            Tags describe variants so they can be filtered at render time, for example <strong>mood:positive</strong> or{' '}
            <strong>hairLength:long</strong>. Each tag is <strong>category</strong> or <strong>category:value</strong>{' '}
            in camelCase. Press Enter or comma to add one.
          </p>
          <FieldRow label="Tags">
            <TagsTable
              tags={settings.tags}
              onChange={(name, tags) => update(group, (s) => ({ ...s, tags: { ...s.tags, [name]: tags } }))}
            />
          </FieldRow>
        </>
      )}

      {tab === 'normalize' &&
        (normalizeError ? (
          <div className="flex items-center gap-3 rounded-md border border-danger-border bg-danger px-3 py-2.5 text-danger-foreground">
            <p className="flex-1">{normalizeError}</p>
            <Button variant="outline" size="xs" onClick={fetchNormalize}>
              Retry
            </Button>
          </div>
        ) : !normalizeData ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <Spinner /> Reading variants
          </div>
        ) : (
          <VariantTable data={normalizeData} precision={data.frame.settings.precision} />
        ))}
    </>
  );
}

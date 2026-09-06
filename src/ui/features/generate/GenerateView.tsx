import { useEffect, useState } from 'react';
import type { GenerateResult } from '@shared/messages';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WarningsPanel } from '@/components/WarningsPanel';
import { Workspace } from '@/components/Workspace';
import { styleKeyOf } from '@/lib/render/styleRegistry';
import { useAppStore } from '@/store';
import { useGenerateStore } from '@/store/generate';
import { GenerateFooter } from './GenerateFooter';
import { LayoutSection } from './components/LayoutSection';
import { OptionsPanel } from './components/OptionsPanel';
import { PreviewGrid } from './components/PreviewGrid';
import { SeedStrategyField } from './components/SeedStrategyField';
import { StyleBar } from './components/StyleBar';
import { StyleGallery } from './components/StyleGallery';
import { SidebarHeader } from './components/SidebarHeader';
import { TargetSection } from './components/TargetSection';
import { loadCatalog } from './lib/catalogLoader';
import { runGenerate } from './lib/runGenerate';
import { randomSeeds } from './lib/seeds';
import { usableTargets } from './lib/targets';
import { ensureStyle } from '@/lib/styleSources';
import { useSeeds, useStyleEntry, useTargetMode } from './lib/useGenerateContext';

/** Picks the remembered style once the sandbox has said hello. */
function useRestoreStyle() {
  const ready = useAppStore((state) => state.ready);
  const lastStyleKey = useAppStore((state) => state.prefs.lastStyleKey);
  const command = useAppStore((state) => state.command);
  const relaunch = useAppStore((state) => state.relaunch);
  const clearRelaunch = useAppStore((state) => state.clearRelaunch);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const generate = useGenerateStore.getState();

    if (command && relaunch) {
      // A relaunch button: the record says which style and options to use,
      // "regenerate" runs straight away with fresh seeds.
      const key = styleKeyOf(relaunch.source);

      generate.selectStyle(key);
      useGenerateStore.setState({ overrides: relaunch.overrides });
      generate.setModeOverride('fill');
      clearRelaunch();

      if (command === 'regenerate') {
        ensureStyle(key)
          .then((entry) => {
            const targets = usableTargets(useAppStore.getState().selection.targets);

            useGenerateStore.getState().shuffle();

            const strategy = useGenerateStore.getState().seeds;
            const seeds = strategy.kind === 'random' ? randomSeeds(strategy.salt, targets.length) : [];

            return runGenerate(entry, 'fill', seeds);
          })
          .catch(() => undefined);
      } else {
        generate.setPickerOpen(true);
      }

      return;
    }

    // A style stored on the file comes back through the init event first;
    // the remembered one only fills in when the file carries none.
    if (!generate.styleKey && lastStyleKey) {
      generate.selectStyle(lastStyleKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}

export function GenerateView() {
  const mode = useTargetMode();
  const seeds = useSeeds(mode);
  const { entry, status, error } = useStyleEntry();
  const styleKey = useGenerateStore((state) => state.styleKey);
  const browsing = useGenerateStore((state) => state.pickerOpen);
  const lastResult = useGenerateStore((state) => state.lastResult);
  const jobError = useGenerateStore((state) => state.error);

  // The skipped layers of the last job, until the user waves them away.
  const [dismissed, setDismissed] = useState<GenerateResult | null>(null);
  const skipped =
    lastResult && lastResult !== dismissed
      ? lastResult.skipped.map((skip) => `${skip.name || 'A layer'} was skipped: ${skip.message}`)
      : [];

  useRestoreStyle();

  // The catalog previews also serve the style bar, so they load either way.
  useEffect(() => {
    loadCatalog();
  }, []);

  if (!styleKey || browsing) {
    return <StyleGallery />;
  }

  return (
    <Workspace
      sidebar={
        <ScrollArea className="h-full">
          <StyleBar entry={entry} status={status} error={error} />
          <SidebarHeader />
          <TargetSection mode={mode} />
          <SeedStrategyField mode={mode} />
          {mode === 'insert' && <LayoutSection />}
          {entry && <OptionsPanel entry={entry} seed={seeds[0] ?? 'preview'} />}
        </ScrollArea>
      }
      notices={
        <WarningsPanel sections={[{ title: 'Skipped', items: skipped, onDismiss: () => setDismissed(lastResult) }]} />
      }
      footer={<GenerateFooter entry={entry} mode={mode} seeds={seeds} />}
    >
      <ScrollArea className="h-full">
        <div className="p-4">
          <PreviewGrid entry={entry} seeds={seeds} loading={status === 'loading'} />
          {jobError && <p className="mt-3 rounded-md bg-danger px-3 py-2 text-danger-foreground">{jobError}</p>}
        </div>
      </ScrollArea>
    </Workspace>
  );
}

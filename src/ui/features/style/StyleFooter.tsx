import { errorMessage } from '@shared/errors';
import { hasPendingChanges } from '@shared/normalize';
import { Button } from '@/components/ui/button';
import { request } from '@/lib/bridge';
import { flushSettingsPosts, useAppStore } from '@/store';
import { exportDefinition } from './lib/exportDownload';

export function StyleFooter() {
  const status = useAppStore((state) => state.style.status);
  const stage = useAppStore((state) => state.style.stage);
  const componentTab = useAppStore((state) => state.style.componentTab);
  const data = useAppStore((state) => state.style.data);
  const normalize = useAppStore((state) => state.style.normalize);
  const setNormalize = useAppStore((state) => state.setNormalize);
  const setNormalizeError = useAppStore((state) => state.setNormalizeError);

  const normalizeGroup =
    status === 'loaded' && stage.kind === 'component' && componentTab === 'normalize' && data?.components[stage.name]
      ? data.components[stage.name].extendsGroup
        ? null
        : stage.name
      : null;
  const normalizeData = normalizeGroup ? normalize[normalizeGroup] : undefined;
  const canNormalize = normalizeData ? hasPendingChanges(normalizeData) : false;

  const onNormalize = async () => {
    if (!normalizeGroup) {
      return;
    }

    flushSettingsPosts();

    try {
      setNormalize(await request('normalize:apply', { group: normalizeGroup }));
    } catch (error) {
      setNormalizeError(normalizeGroup, errorMessage(error));
    }
  };

  let statusText = '';

  if (status === 'loaded' && data) {
    const components = Object.values(data.components).filter((group) => !group.extendsGroup).length;
    const palettes = Object.values(data.colors).filter((group) => group.isUsedByComponents).length;

    statusText = `${components} component${components === 1 ? '' : 's'}, ${palettes} palette${palettes === 1 ? '' : 's'}`;
  }

  return (
    <>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{statusText}</span>
      {normalizeGroup && (
        <Button variant="outline" size="sm" disabled={!canNormalize} onClick={onNormalize}>
          Normalize variants
        </Button>
      )}
      <Button size="sm" disabled={status !== 'loaded'} onClick={exportDefinition}>
        Export definition
      </Button>
    </>
  );
}

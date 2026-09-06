import { errorMessage } from '@shared/errors';
import { request } from '@/lib/bridge';
import { downloadText } from '@/lib/download';
import { flushSettingsPosts, useAppStore } from '@/store';

/** Exports the selected style as a definition file and hands it to the browser. */
export async function exportDefinition(): Promise<void> {
  flushSettingsPosts();

  const store = useAppStore.getState();
  const before = store.style.data;

  store.setWarnings('export', []);
  store.setStyleStatus('loading');

  try {
    const { name, content, warnings } = await request('export:run', {});

    downloadText(`${name}.json`, content);
    useAppStore.getState().setWarnings('export', warnings);
  } catch (error) {
    useAppStore.getState().setStyleStatus('error', errorMessage(error));

    return;
  }

  // The workspace comes back as it was, unless the sandbox changed the style meanwhile.
  const { style } = useAppStore.getState();

  if (style.status === 'loading' && style.data === before) {
    useAppStore.getState().setStyleStatus('loaded');
  }
}

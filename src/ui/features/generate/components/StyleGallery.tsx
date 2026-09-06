import { useEffect, useState } from 'react';
import { MoreHorizontal, RefreshCw, Upload } from 'lucide-react';
import { errorMessage } from '@shared/errors';
import { styleTitleFromName } from '@shared/styleTitle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/Spinner';
import { useFileInput } from '@/hooks/useFileInput';
import { library } from '@/lib/library';
import { collectionKey, forgetStyle, libraryKey } from '@/lib/render/styleRegistry';
import { useAppStore } from '@/store';
import { useGenerateStore } from '@/store/generate';
import { loadCatalog, loadLibrary } from '../lib/catalogLoader';
import { addLibraryFile } from '@/lib/styleSources';
import { StyleCard } from './StyleCard';

type SourceTab = 'collection' | 'library';

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-1';

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">{children}</div>;
}

function Collection({ onPick }: { onPick: (key: string) => void }) {
  const catalog = useGenerateStore((state) => state.catalog);
  const styleKey = useGenerateStore((state) => state.styleKey);
  const names = catalog.names;

  if (catalog.status === 'error') {
    return (
      <Notice>
        <p>{catalog.error}</p>
        <Button variant="outline" size="sm" onClick={() => loadCatalog(true)}>
          <RefreshCw /> Try again
        </Button>
      </Notice>
    );
  }

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-3">
          {catalog.status === 'loading' && catalog.names.length === 0 ? (
            <Notice>
              <Spinner /> Loading the collection
            </Notice>
          ) : (
            <div className={GRID}>
              {names.map((name) => (
                <StyleCard
                  key={name}
                  title={styleTitleFromName(name)}
                  preview={catalog.thumbs[name]}
                  active={styleKey === collectionKey(name)}
                  onClick={() => onPick(collectionKey(name))}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}

function Library({ onPick }: { onPick: (key: string) => void }) {
  const lib = useGenerateStore((state) => state.library);
  const setLibrary = useGenerateStore((state) => state.setLibrary);
  const styleKey = useGenerateStore((state) => state.styleKey);
  const selectStyle = useGenerateStore((state) => state.selectStyle);
  const [error, setError] = useState<string | null>(null);
  const file = useFileInput(async (picked) => {
    setError(null);

    try {
      const item = await addLibraryFile(picked);

      onPick(libraryKey(item.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  // The plugin iframe allows no prompt(), so renaming happens in a dialog.
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  const rename = async () => {
    if (!renaming) {
      return;
    }

    const title = renaming.title.trim();
    const current = lib.items.find((item) => item.id === renaming.id)?.title;

    setRenaming(null);
    setError(null);

    if (title && title !== current) {
      try {
        setLibrary({ items: await library.rename(renaming.id, title) });
        forgetStyle(libraryKey(renaming.id));
      } catch (e) {
        setError(errorMessage(e));
      }
    }
  };

  const remove = async (id: string) => {
    setError(null);

    try {
      setLibrary({ items: await library.remove(id) });
      forgetStyle(libraryKey(id));

      if (styleKey === libraryKey(id)) {
        selectStyle(null);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 px-3 pb-2">
        <p className="flex-1 text-muted-foreground">Definition files you uploaded. They stay with you across files.</p>
        <input ref={file.ref} type="file" accept=".json,application/json" className="hidden" onChange={file.onChange} />
        <Button variant="outline" size="sm" onClick={file.open}>
          <Upload /> Upload definition
        </Button>
      </div>
      {error && <p className="mx-3 mb-2 rounded-md bg-danger px-3 py-2 text-danger-foreground">{error}</p>}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-3">
          {lib.items.length === 0 ? (
            <Notice>
              <p>No uploaded styles yet.</p>
            </Notice>
          ) : (
            <div className={GRID}>
              {lib.items.map((item) => (
                <div key={item.id} className="relative">
                  <StyleCard
                    title={item.title}
                    subtitle={item.licenseName || undefined}
                    preview={item.preview}
                    active={styleKey === libraryKey(item.id)}
                    onClick={() => onPick(libraryKey(item.id))}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-xs" className="absolute top-1 right-1" aria-label="More">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setRenaming({ id: item.id, title: item.title })}>
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => remove(item.id)}>
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="w-72 gap-3 p-4">
          <DialogHeader>
            <DialogTitle>Rename style</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renaming?.title ?? ''}
            onChange={(event) => setRenaming((state) => (state ? { ...state, title: event.target.value } : state))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                rename();
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={rename} disabled={!renaming?.title.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The gallery that fills the tab while no style is chosen. */
export function StyleGallery() {
  const selectStyle = useGenerateStore((state) => state.selectStyle);
  const setPickerOpen = useGenerateStore((state) => state.setPickerOpen);
  const setPrefs = useAppStore((state) => state.setPrefs);
  const [tab, setTab] = useState<SourceTab>('collection');

  useEffect(() => {
    loadCatalog();
    loadLibrary();
  }, []);

  const pick = (key: string) => {
    selectStyle(key);
    setPrefs({ lastStyleKey: key });
    setPickerOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
        <h1 className="text-xl font-semibold">Choose a style</h1>
        <span className="flex-1" />
        <Tabs value={tab} onValueChange={(value) => setTab(value as SourceTab)}>
          <TabsList className="h-7">
            <TabsTrigger value="collection" className="px-3">
              Collection
            </TabsTrigger>
            <TabsTrigger value="library" className="px-3">
              Library
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {tab === 'collection' && <Collection onPick={pick} />}
      {tab === 'library' && <Library onPick={pick} />}
    </div>
  );
}

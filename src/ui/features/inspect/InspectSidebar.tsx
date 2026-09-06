import { memo } from 'react';
import type { InspectItem } from '@shared/messages';
import { AvatarPreview } from '@/components/AvatarPreview';
import { Section } from '@/components/Section';
import { SidebarItem } from '@/components/SidebarItem';
import { useStyleEntryFor } from '@/hooks/useStyleEntry';
import { renderDataUri } from '@/lib/render/renderAvatar';
import { styleKeyOf } from '@/lib/render/styleRegistry';
import { useAppStore } from '@/store';

/** Rows and stage render at one size, so the stage finds the row's render in the memo. */
export const INSPECT_PREVIEW_SIZE = 64;

const Row = memo(function Row({ item, active }: { item: InspectItem; active: boolean }) {
  const setActive = useAppStore((state) => state.setInspectActive);
  const { entry } = useStyleEntryFor(styleKeyOf(item.record.source));
  let src: string | null = null;

  if (entry) {
    try {
      src = renderDataUri(entry, item.record.seed, INSPECT_PREVIEW_SIZE, item.record.overrides);
    } catch {
      src = null;
    }
  }

  return (
    <SidebarItem active={active} className="h-9 gap-2 px-1.5" onClick={() => setActive(item.id)}>
      {src ? (
        <AvatarPreview src={src} className="size-6 shrink-0" />
      ) : (
        <span className="size-6 shrink-0 rounded-md bg-muted" />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{item.name}</span>
        <span className="truncate text-muted-foreground">{item.record.seed}</span>
      </span>
    </SidebarItem>
  );
});

export function InspectSidebar({ items, activeId }: { items: InspectItem[]; activeId: string | null }) {
  return (
    <Section title="Avatars" gap="tight" aside={<span className="text-muted-foreground">{items.length}</span>}>
      {items.map((item) => (
        <Row key={item.id} item={item} active={item.id === activeId} />
      ))}
    </Section>
  );
}

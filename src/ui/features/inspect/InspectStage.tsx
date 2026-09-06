import { useMemo, useState } from 'react';
import { sourceTitle } from '@shared/avatarRecord';
import type { InspectItem } from '@shared/messages';
import { AvatarPreview } from '@/components/AvatarPreview';
import { CopyButton } from '@/components/CopyButton';
import { Section } from '@/components/Section';
import { Segmented } from '@/components/Segmented';
import { Spinner } from '@/components/Spinner';
import { StyleCredit } from '@/components/StyleCredit';
import { useStyleEntryFor } from '@/hooks/useStyleEntry';
import { API_FORMATS, apiUrl, codeSnippet, stylesVersion, type ApiFormat } from '@/lib/handoff';
import { renderDataUri } from '@/lib/render/renderAvatar';
import { styleKeyOf } from '@/lib/render/styleRegistry';
import { INSPECT_PREVIEW_SIZE } from './InspectSidebar';

function Code({ children }: { children: string }) {
  return (
    <pre className="rounded-md bg-muted px-3 py-2 font-mono text-xs leading-4 break-all whitespace-pre-wrap">
      {children}
    </pre>
  );
}

/** Everything one generated avatar carries, ready to copy. */
export function InspectStage({ item }: { item: InspectItem }) {
  const { record } = item;
  const { entry, status, error } = useStyleEntryFor(styleKeyOf(record.source));
  const [format, setFormat] = useState<ApiFormat>('svg');
  const url = apiUrl(record, format);
  const snippet = useMemo(() => codeSnippet(record), [record]);
  const version = stylesVersion(record.source);
  const overrides = Object.entries(record.overrides);
  let src: string | null = null;

  if (entry) {
    try {
      src = renderDataUri(entry, record.seed, INSPECT_PREVIEW_SIZE, record.overrides);
    } catch {
      src = null;
    }
  }

  return (
    <div className="p-4">
      <div className="mb-5 flex items-start gap-3">
        {src ? (
          <AvatarPreview src={src} className="size-16 shrink-0 rounded-xl" />
        ) : (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted">
            {status === 'loading' && <Spinner />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{entry?.title ?? sourceTitle(record.source)}</h1>
          <p className="text-muted-foreground">
            {record.source.kind === 'collection'
              ? `DiceBear collection${version ? `, @dicebear/styles ${version}` : ''}`
              : 'From your library'}
          </p>
          <p className="mt-1 text-muted-foreground [text-wrap:pretty]">
            {entry ? <StyleCredit entry={entry} /> : status === 'error' ? error : null}
          </p>
        </div>
      </div>

      <Section variant="stage" title="Seed" aside={<CopyButton text={record.seed} />}>
        <Code>{record.seed}</Code>
      </Section>

      <Section variant="stage" title="Options">
        {overrides.length === 0 ? (
          <p className="text-muted-foreground">The style's own defaults, nothing was changed.</p>
        ) : (
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {overrides.map(([name, value]) => (
              <div key={name} className="contents">
                <span className="font-mono text-xs leading-5">{name}</span>
                <span
                  className="truncate font-mono text-xs leading-5 text-muted-foreground"
                  title={JSON.stringify(value)}
                >
                  {Array.isArray(value) ? value.join(', ') : JSON.stringify(value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        variant="stage"
        title="API URL"
        aside={
          url && (
            <>
              <Segmented
                className="h-6 w-48"
                value={format}
                options={API_FORMATS.map((value) => ({ value, label: value }))}
                onChange={setFormat}
              />
              <a href={url} target="_blank" rel="noopener" className="text-brand-foreground hover:underline">
                Open
              </a>
              <CopyButton text={url} />
            </>
          )
        }
      >
        {url ? (
          <Code>{url}</Code>
        ) : (
          <p className="text-muted-foreground [text-wrap:pretty]">
            The API only hosts the DiceBear collection. Render this style with one of the libraries and the definition
            file, as in the code below.
          </p>
        )}
      </Section>

      <Section variant="stage" title="JavaScript" aside={<CopyButton text={snippet} />}>
        <Code>{snippet}</Code>
      </Section>
    </div>
  );
}

import { useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DiceBearMark } from './DiceBearMark';
import notices from '@/generated/third-party-notices.json';
import pluginLicense from '../../../LICENSE?raw';

const LINKS = [
  { label: 'Documentation', href: 'https://www.dicebear.com/integrations/figma/' },
  { label: 'Source code and issues', href: 'https://github.com/dicebear/studio' },
  { label: 'Privacy policy', href: 'https://www.iubenda.com/privacy-policy/57216581/full-legal' },
  { label: 'Legal notice', href: 'https://www.dicebear.com/legal/legal-notice/' },
];

type Notice = { name: string; version: string; license: string; author: string | null; text: number | null };

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="flex items-center gap-1 text-brand-foreground hover:underline"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

/** License files wrap their lines by hand, which reads badly in a narrow column, so paragraphs flow. */
function unwrap(text: string): string {
  return text.replace(/(\S)\n(?=\S)/g, '$1 ');
}

function LicenseText({ text }: { text: string }) {
  return (
    <pre className="mt-2 rounded-md bg-muted px-3 py-2 font-sans text-xs leading-4 whitespace-pre-wrap">
      {unwrap(text)}
    </pre>
  );
}

/**
 * Who made the plugin, where to find help, and the licenses of everything
 * it ships. The bundles carry no license comments, so the notices the MIT
 * and BSD licenses ask for live here.
 */
export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [showLicenses, setShowLicenses] = useState(false);
  const packages = notices.packages as Notice[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-48px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[440px]">
        <DialogHeader className="border-b p-4">
          <div className="flex items-center gap-3">
            <DiceBearMark className="size-8 text-foreground" />
            <div>
              <DialogTitle>DiceBear Studio</DialogTitle>
              <DialogDescription>A plugin for Figma by DiceBear.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 p-4">
            <p className="text-muted-foreground [text-wrap:pretty]">
              The style collection and its previews come from api.dicebear.com, the only host the plugin talks to.
              Avatars are rendered inside the plugin, so seeds and layer names never leave Figma.
            </p>
            <ul className="flex flex-col gap-1.5">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
            <section>
              <h2 className="font-semibold">License</h2>
              <p className="mt-1 text-muted-foreground">
                The plugin is free software under the MIT License. The avatar styles have licenses of their own, shown
                next to each style.
              </p>
              <LicenseText text={pluginLicense.trim()} />
            </section>
            <section>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">Third-party software</h2>
                <span className="flex-1" />
                <button
                  type="button"
                  className="text-brand-foreground hover:underline"
                  onClick={() => setShowLicenses((value) => !value)}
                >
                  {showLicenses ? 'Hide licenses' : 'Show licenses'}
                </button>
              </div>
              <p className="mt-1 text-muted-foreground">
                The plugin ships {packages.length} open source packages. Their license notices follow.
              </p>
              {showLicenses && (
                <ul className="mt-3 flex flex-col gap-3">
                  {packages.map((item) => (
                    <li key={`${item.name}@${item.version}`}>
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground">
                          {item.version}, {item.license}
                        </span>
                      </div>
                      {item.text !== null ? (
                        <LicenseText text={notices.texts[item.text]} />
                      ) : (
                        <p className="mt-1 text-muted-foreground">
                          Licensed under {item.license}
                          {item.author ? ` by ${item.author}` : ''}. The package ships no license file.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

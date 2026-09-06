import { useState } from 'react';
import { BookOpen, Code, Info, PenTool, Sparkles } from 'lucide-react';
import type { Mode } from '@shared/messages';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import { AboutDialog } from './AboutDialog';

const ITEMS: { mode: Mode; label: string; icon: typeof Sparkles }[] = [
  { mode: 'generate', label: 'Generate', icon: Sparkles },
  { mode: 'inspect', label: 'Inspect', icon: Code },
  { mode: 'style', label: 'Style', icon: PenTool },
];

const RAIL_ACTION =
  'flex size-10 items-center justify-center rounded-lg text-icon-secondary hover:bg-accent hover:text-foreground';

/** The workspace switch, laid out like Figma's own rail: icon above label. */
export function Rail() {
  const mode = useAppStore((state) => state.mode);
  const setMode = useAppStore((state) => state.setMode);
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center border-r py-3">
      <div className="flex flex-col items-center gap-3">
        {ITEMS.map((item) => {
          const active = mode === item.mode;

          return (
            <button
              key={item.mode}
              type="button"
              aria-pressed={active}
              className="group flex flex-col items-center gap-1 outline-none"
              onClick={() => setMode(item.mode)}
            >
              <span
                className={cn(
                  'flex size-10 items-center justify-center rounded-lg transition-colors',
                  active
                    ? 'bg-selected text-foreground'
                    : 'text-icon-secondary group-hover:bg-accent group-hover:text-foreground',
                )}
              >
                <item.icon className="size-5" strokeWidth={1.75} />
              </span>
              <span className={cn('leading-none', active ? 'text-foreground' : 'text-muted-foreground')}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      <span className="flex-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href="https://www.dicebear.com/integrations/figma/"
            target="_blank"
            rel="noopener"
            aria-label="Open the guide"
            className={cn(RAIL_ACTION, 'cursor-default')}
          >
            <BookOpen className="size-5" strokeWidth={1.75} />
          </a>
        </TooltipTrigger>
        <TooltipContent side="right">Open the guide</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="About this plugin"
            className={RAIL_ACTION}
            onClick={() => setAboutOpen(true)}
          >
            <Info className="size-5" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">About, licenses and privacy</TooltipContent>
      </Tooltip>
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </nav>
  );
}

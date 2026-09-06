import { Button } from '@/components/ui/button';

type Props = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function ErrorState({ message, actionLabel, onAction }: Props) {
  return (
    <div className="m-auto max-w-[420px] p-10 text-center">
      <div className="mb-4 rounded-md border border-danger-border bg-danger px-5 py-4 text-danger-foreground">
        {message}
      </div>
      <div className="flex items-center justify-center gap-3">
        {actionLabel && onAction && (
          <Button size="sm" variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
        <a
          className="text-brand-foreground hover:underline"
          href="https://www.dicebear.com/integrations/figma/"
          target="_blank"
          rel="noopener"
        >
          Read the guide
        </a>
      </div>
    </div>
  );
}

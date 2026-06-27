import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export interface DetailField {
  label: string;
  value: React.ReactNode;
}

interface EntityDetailSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  fields?: DetailField[];
  /** When provided, a "Copy link" button shares this deep link to the record */
  shareUrl?: string;
  /** Render as a full smartphone-height screen on mobile devices */
  fullScreenOnMobile?: boolean;
  /** Extra content (e.g. contact CTAs, tenant lists) shown below the fields */
  children?: React.ReactNode;
}

export function EntityDetailSheet({
  open,
  onClose,
  title,
  subtitle,
  icon,
  fields = [],
  shareUrl,
  fullScreenOnMobile = false,
  children,
}: EntityDetailSheetProps) {
  const [copied, setCopied] = useState(false);
  const isMobile = useIsMobile();
  const fullScreen = fullScreenOnMobile && isMobile;

  const handleShare = async () => {
    if (!shareUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title, url: shareUrl });
        return;
      }
    } catch {
      /* user cancelled native share — fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="bottom"
        className={cn(
          'overflow-y-auto',
          fullScreen
            ? 'h-[100dvh] max-h-[100dvh] rounded-none'
            : 'max-h-[90vh] rounded-t-2xl',
        )}
      >
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            {icon}
            <span className="truncate">{title}</span>
          </SheetTitle>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </SheetHeader>

        {shareUrl && (
          <button
            onClick={handleShare}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted active:scale-[0.99] touch-manipulation"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy share link'}
          </button>
        )}

        {fields.length > 0 && (
          <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
            {fields.map((f, i) => (
              <div key={i} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <dt className="text-xs font-medium text-muted-foreground shrink-0">{f.label}</dt>
                <dd className="text-xs font-semibold text-foreground text-right break-words min-w-0">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {children && <div className="mt-4 space-y-3">{children}</div>}
      </SheetContent>
    </Sheet>
  );
}

export default EntityDetailSheet;
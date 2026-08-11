import { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/**
 * Ops scaffolding section — same collapsible language already used by
 * SupervisionSections (rounded card header, chevron, right-aligned count
 * pill), extended with an icon and a one-line collapsed summary so an
 * operator can scan what a section holds before opening it.
 *
 * Heavy bodies pass `scrollBody` so an expanded section grows inside its own
 * scroll area instead of stretching the whole dashboard.
 */
export interface OpsScaffoldSectionProps {
  title: string;
  /** One-line collapsed summary — keep it short so it fits a phone width. */
  summary?: string;
  icon?: React.ElementType;
  /** Right-aligned pill: e.g. "12 pending". */
  badge?: string;
  /** Highlights the header when the badge means "needs attention". */
  alert?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scrollBody?: boolean;
  children: ReactNode;
}

export function OpsScaffoldSection({
  title,
  summary,
  icon: Icon,
  badge,
  alert = false,
  open,
  onOpenChange,
  scrollBody = false,
  children,
}: OpsScaffoldSectionProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="w-full text-left">
        <div
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-3 min-h-[56px] transition-colors hover:bg-muted/40',
            alert && 'border-l-4 border-l-destructive',
            open && 'rounded-b-none border-b-0',
          )}
        >
          {Icon && (
            <span className="shrink-0 rounded-lg bg-muted p-1.5">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
            {summary && (
              <span className="mt-0.5 block truncate text-[11px] leading-snug text-muted-foreground">{summary}</span>
            )}
          </span>
          {badge && (
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap',
                alert ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
              )}
            >
              {badge}
            </span>
          )}
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          className={cn(
            'rounded-b-xl border border-t-0 border-border bg-background px-2 py-3 sm:px-3',
            scrollBody && 'max-h-[70vh] overflow-y-auto overscroll-contain',
          )}
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default OpsScaffoldSection;
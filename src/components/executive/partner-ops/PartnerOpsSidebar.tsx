import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  PARTNER_OPS_NAV,
  groupKeyForView,
  type PartnerOpsViewKey,
} from './partnerOpsNav';

interface Props {
  active: PartnerOpsViewKey;
  onSelect: (view: PartnerOpsViewKey) => void;
  badges?: Partial<Record<PartnerOpsViewKey, number>>;
  className?: string;
}

export function PartnerOpsSidebar({ active, onSelect, badges = {}, className }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const g = groupKeyForView(active);
    return g ? { [g]: true } : {};
  });

  // keep the group containing the active view expanded
  useEffect(() => {
    const g = groupKeyForView(active);
    if (g) setOpen((prev) => (prev[g] ? prev : { ...prev, [g]: true }));
  }, [active]);

  const Badge = ({ n }: { n?: number }) =>
    n && n > 0 ? (
      <span className="ml-auto rounded-full bg-destructive/15 px-1.5 py-0.5 text-[9px] font-bold leading-none text-destructive">
        {n}
      </span>
    ) : null;

  return (
    <nav className={cn('flex h-full flex-col', className)} aria-label="Partner Ops sections">
      <ScrollArea className="flex-1">
        <ul className="space-y-0.5 p-2">
          {PARTNER_OPS_NAV.map((item) => {
            const Icon = item.icon;
            const key = String(item.key);

            if (!item.children?.length) {
              const view = (item.view || key) as PartnerOpsViewKey;
              const isActive = active === view;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => onSelect(view)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    <Badge n={badges[view]} />
                  </button>
                </li>
              );
            }

            const expanded = !!open[key];
            const groupActive = item.children.some((c) => c.key === active);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setOpen((prev) => ({ ...prev, [key]: !prev[key] }))}
                  aria-expanded={expanded}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors',
                    groupActive ? 'text-foreground' : 'text-muted-foreground',
                    'hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  <ChevronDown
                    className={cn('ml-auto h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
                  />
                </button>
                {expanded && (
                  <ul className="mt-0.5 space-y-0.5 border-l border-border/60 pl-2 ml-4">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      const isActive = active === child.key;
                      return (
                        <li key={child.key}>
                          <button
                            type="button"
                            onClick={() => onSelect(child.key)}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
                              isActive
                                ? 'bg-primary/10 font-semibold text-primary'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                          >
                            <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{child.label}</span>
                            <Badge n={badges[child.key]} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </nav>
  );
}
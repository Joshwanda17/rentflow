import { useMemo, useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ServiceCenterState } from '@/hooks/useAgentServiceCenter';

const PAGE = 10;

export type SortKey = 'newest' | 'oldest' | 'name' | 'amount';

const STATE_LABEL: Record<ServiceCenterState, string> = {
  verified: 'Verified',
  pending: 'Pending',
  rejected: 'Rejected',
};

const STATE_CLASS: Record<ServiceCenterState, string> = {
  verified: 'bg-success/15 text-success border-success/25',
  pending: 'bg-warning/15 text-warning border-warning/25',
  rejected: 'bg-destructive/15 text-destructive border-destructive/25',
};

export function StateBadge({ state }: { state: ServiceCenterState }) {
  return (
    <Badge variant="outline" className={cn('shrink-0 text-[10px]', STATE_CLASS[state])}>
      {STATE_LABEL[state]}
    </Badge>
  );
}

export interface EntityRow {
  id: string;
  state: ServiceCenterState;
  primary: string;
  secondary?: string | null;
  amountLabel?: string | null;
  amountValue?: number | null;
  createdAt?: string | null;
  details: { label: string; value: string }[];
}

/**
 * Mobile-first list with status filters, sorting, 10-per-page "load more" and an
 * inline detail drawer that opens directly below the tapped row.
 * All data is already in memory — no extra round trips.
 */
export function SubAgentEntityList({
  heading,
  emptyLabel,
  rows,
  showAmountSort = true,
  resetKey,
  renderRowAction,
}: {
  heading: string;
  emptyLabel: string;
  rows: EntityRow[];
  showAmountSort?: boolean;
  resetKey?: string;
  renderRowAction?: (row: EntityRow) => React.ReactNode;
}) {
  const [filter, setFilter] = useState<'all' | ServiceCenterState>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [visible, setVisible] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    setFilter('all');
    setSort('newest');
    setVisible(PAGE);
    setOpenId(null);
  }, [resetKey]);

  const counts = useMemo(() => ({
    all: rows.length,
    verified: rows.filter((r) => r.state === 'verified').length,
    pending: rows.filter((r) => r.state === 'pending').length,
    rejected: rows.filter((r) => r.state === 'rejected').length,
  }), [rows]);

  const sorted = useMemo(() => {
    const list = filter === 'all' ? [...rows] : rows.filter((r) => r.state === filter);
    const time = (v?: string | null) => (v ? new Date(v).getTime() || 0 : 0);
    switch (sort) {
      case 'oldest': return list.sort((a, b) => time(a.createdAt) - time(b.createdAt));
      case 'name': return list.sort((a, b) => a.primary.localeCompare(b.primary));
      case 'amount': return list.sort((a, b) => (b.amountValue ?? 0) - (a.amountValue ?? 0));
      default: return list.sort((a, b) => time(b.createdAt) - time(a.createdAt));
    }
  }, [rows, filter, sort]);

  useEffect(() => { setVisible(PAGE); setOpenId(null); }, [filter, sort]);

  const chips: ('all' | ServiceCenterState)[] = ['all', 'verified', 'pending', 'rejected'];
  const sorts: { key: SortKey; label: string }[] = [
    { key: 'newest', label: 'Newest' },
    { key: 'oldest', label: 'Oldest' },
    { key: 'name', label: 'A–Z' },
    ...(showAmountSort ? [{ key: 'amount' as SortKey, label: 'Highest' }] : []),
  ];

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {heading} ({rows.length})
      </h3>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(c)}
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  filter === c
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground',
                )}
              >
                {c === 'all' ? 'All' : STATE_LABEL[c]} · {counts[c]}
              </button>
            ))}
          </div>

          <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1">
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">Sort</span>
            {sorts.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                className={cn(
                  'shrink-0 rounded-md border px-2 py-0.5 text-[11px] transition-colors',
                  sort === s.key
                    ? 'border-foreground/30 bg-accent font-semibold text-accent-foreground'
                    : 'border-border bg-background text-muted-foreground',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {sorted.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Nothing in this status.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
              {sorted.slice(0, visible).map((r) => {
                const isOpen = openId === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : r.id)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-accent/60"
                      aria-expanded={isOpen}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{r.primary}</div>
                        {r.secondary && (
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">{r.secondary}</div>
                        )}
                      </div>
                      {r.amountLabel && (
                        <span className="shrink-0 text-xs font-semibold text-foreground">{r.amountLabel}</span>
                      )}
                      <StateBadge state={r.state} />
                      <ChevronDown
                        className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
                      />
                    </button>

                    {isOpen && (
                      <div className="space-y-2 border-t border-border/60 bg-muted/40 px-3 py-3">
                        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                          {r.details.map((d) => (
                            <div key={d.label} className="min-w-0">
                              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{d.label}</dt>
                              <dd className="break-words text-xs font-medium text-foreground">{d.value}</dd>
                            </div>
                          ))}
                        </dl>
                        {renderRowAction?.(r)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {sorted.length > visible && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setVisible((n) => n + PAGE)}>
              Load more ({sorted.length - visible} left)
            </Button>
          )}
        </>
      )}
    </section>
  );
}
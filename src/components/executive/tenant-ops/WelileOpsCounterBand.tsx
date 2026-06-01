import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { UserDrilldownDrawer } from '@/components/ops/UserDrilldownDrawer';
import {
  useOpsCounterBreakdown, useOpsCounterItems, counterLevel,
  type CounterPath, type CounterWindow, type CounterKind, type CounterBreakdownRow,
} from '@/hooks/useWelileOpsCounters';
import {
  FileText, Home, UserCheck, Handshake, Globe, MapPin, ChevronRight,
  ChevronLeft, RefreshCw, User, ChevronDown, ChevronUp, Phone,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const KINDS: { kind: CounterKind; label: string; short: string; icon: React.ElementType; field: keyof CounterBreakdownRow; tone: string }[] = [
  { kind: 'rent', label: 'New rent requests', short: 'Rent', icon: FileText, field: 'rent_count', tone: 'text-emerald-600 bg-emerald-500/10' },
  { kind: 'landlord', label: 'Landlords by agents', short: 'Landlords', icon: Home, field: 'landlord_count', tone: 'text-[#9234EA] bg-[#9234EA]/10' },
  { kind: 'agent', label: 'Agents by agents', short: 'Agents', icon: UserCheck, field: 'agent_count', tone: 'text-blue-600 bg-blue-500/10' },
  { kind: 'promissory', label: 'Promissory notes', short: 'Notes', icon: Handshake, field: 'promissory_count', tone: 'text-amber-600 bg-amber-500/10' },
];

const WINDOWS: { id: CounterWindow; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
];

const LEVEL_LABEL: Record<string, string> = {
  continent: 'continent', country: 'country', city: 'city / town', agent: 'agent',
};
const LEVEL_ICON: Record<string, React.ElementType> = {
  continent: Globe, country: MapPin, city: MapPin, agent: User,
};

export function WelileOpsCounterBand() {
  const [win, setWin] = useState<CounterWindow>('7d');
  const [path, setPath] = useState<CounterPath>({});
  const [collapsed, setCollapsed] = useState(false);
  const [items, setItems] = useState<{ agentId: string; agentName: string; kind: CounterKind } | null>(null);
  const [drawer, setDrawer] = useState<{ tenantId?: string | null; agentId?: string | null; landlordId?: string | null; tab: 'tenant' | 'agent' | 'landlord' } | null>(null);

  const level = counterLevel(path);
  const { data: rows, isLoading, isFetching, refetch } = useOpsCounterBreakdown(path, win) as any;
  const list: CounterBreakdownRow[] = rows ?? [];

  const totals = useMemo(() => {
    return list.reduce(
      (acc, r) => {
        acc.rent += r.rent_count; acc.landlord += r.landlord_count;
        acc.agent += r.agent_count; acc.promissory += r.promissory_count;
        return acc;
      },
      { rent: 0, landlord: 0, agent: 0, promissory: 0 },
    );
  }, [list]);

  const crumbs: { label: string; onClick: () => void }[] = [
    { label: 'All', onClick: () => setPath({}) },
  ];
  if (path.continent) crumbs.push({ label: path.continent, onClick: () => setPath({ continent: path.continent }) });
  if (path.country) crumbs.push({ label: path.country, onClick: () => setPath({ continent: path.continent, country: path.country }) });
  if (path.city) crumbs.push({ label: path.city, onClick: () => setPath({ ...path }) });

  const drillInto = (row: CounterBreakdownRow) => {
    if (level === 'continent') setPath({ continent: row.bucket_key });
    else if (level === 'country') setPath({ ...path, country: row.bucket_key });
    else if (level === 'city') setPath({ ...path, city: row.bucket_key });
  };

  const goBack = () => {
    if (path.city) setPath({ continent: path.continent, country: path.country });
    else if (path.country) setPath({ continent: path.continent });
    else if (path.continent) setPath({});
  };

  const totalAll = totals.rent + totals.landlord + totals.agent + totals.promissory;

  return (
    <Card className="p-3 sm:p-4 border-border">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold leading-tight flex items-center gap-1.5">
            <Globe className="h-4 w-4 text-primary" /> Operations Counter
          </h3>
          <p className="text-[11px] text-muted-foreground">
            New activity across every continent, country, city &amp; agent — drill to the source &amp; profile.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                onClick={() => setWin(w.id)}
                className={cn(
                  'px-2.5 py-1 text-[11px] font-semibold transition',
                  win === w.id ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/40',
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        {KINDS.map((k) => {
          const Icon = k.icon;
          const val = k.kind === 'rent' ? totals.rent : k.kind === 'landlord' ? totals.landlord : k.kind === 'agent' ? totals.agent : totals.promissory;
          return (
            <div key={k.kind} className="rounded-xl border border-border bg-card p-2.5 flex items-center gap-2">
              <div className={cn('p-1.5 rounded-lg shrink-0', k.tone)}><Icon className="h-4 w-4" /></div>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-none">{isLoading ? '—' : val.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground truncate">{k.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {!collapsed && (
        <>
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 mt-3 flex-wrap text-xs">
            {(path.continent) && (
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={goBack}>
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </Button>
            )}
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                <button
                  onClick={c.onClick}
                  className={cn('px-1.5 py-0.5 rounded hover:bg-muted/50', i === crumbs.length - 1 ? 'font-bold' : 'text-muted-foreground')}
                >
                  {c.label}
                </button>
              </span>
            ))}
            <Badge variant="outline" className="ml-1 text-[10px]">
              by {LEVEL_LABEL[level]}
            </Badge>
          </div>

          {/* Tiles */}
          <div className="mt-2 space-y-1.5">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : list.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No activity in this window.</p>
            ) : (
              list.map((row) => {
                const RowIcon = LEVEL_ICON[level];
                const isAgent = level === 'agent';
                return (
                  <div
                    key={row.bucket_key}
                    className={cn(
                      'rounded-xl border border-border bg-card p-2.5',
                      !isAgent && 'hover:bg-muted/40 cursor-pointer transition',
                    )}
                    onClick={!isAgent ? () => drillInto(row) : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <RowIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-semibold text-sm truncate flex-1">{row.bucket_label}</span>
                      <Badge className="shrink-0">{row.total_count.toLocaleString()}</Badge>
                      {!isAgent && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {KINDS.map((k) => {
                        const v = (row[k.field] as number) ?? 0;
                        const clickable = isAgent && v > 0 && !!row.agent_id;
                        return (
                          <button
                            key={k.kind}
                            disabled={!clickable}
                            onClick={clickable ? (e) => {
                              e.stopPropagation();
                              setItems({ agentId: row.agent_id!, agentName: row.bucket_label, kind: k.kind });
                            } : undefined}
                            className={cn(
                              'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium border border-border',
                              v === 0 ? 'opacity-40' : k.tone,
                              clickable && 'hover:ring-1 hover:ring-primary cursor-pointer',
                            )}
                          >
                            <k.icon className="h-3 w-3" />
                            {k.short}: {v.toLocaleString()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {level === 'agent' && list.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">Tap a counter chip above to open its source list and profiles.</p>
          )}
        </>
      )}

      <ItemsDialog
        target={items}
        win={win}
        onClose={() => setItems(null)}
        onOpenProfile={(row) => {
          if (row.drawer_tab === 'landlord') setDrawer({ landlordId: row.profile_id, tab: 'landlord' });
          else if (row.drawer_tab === 'agent') setDrawer({ agentId: row.profile_id, tab: 'agent' });
          else setDrawer({ tenantId: row.profile_id, tab: 'tenant' });
        }}
      />

      <UserDrilldownDrawer
        open={!!drawer}
        onOpenChange={(v) => { if (!v) setDrawer(null); }}
        tenantId={drawer?.tenantId ?? null}
        agentId={drawer?.agentId ?? null}
        landlordId={drawer?.landlordId ?? null}
        defaultTab={drawer?.tab ?? 'tenant'}
      />
    </Card>
  );
}

function ItemsDialog({
  target, win, onClose, onOpenProfile,
}: {
  target: { agentId: string; agentName: string; kind: CounterKind } | null;
  win: CounterWindow;
  onClose: () => void;
  onOpenProfile: (row: import('@/hooks/useWelileOpsCounters').CounterItemRow) => void;
}) {
  const meta = KINDS.find((k) => k.kind === target?.kind);
  const { data, isLoading } = useOpsCounterItems(target?.agentId ?? null, target?.kind ?? null, win);

  return (
    <Dialog open={!!target} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-base flex items-center gap-2">
            {meta && <meta.icon className="h-4 w-4" />}
            {meta?.label} · {target?.agentName}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] px-4 pb-4">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No records found.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.map((row) => (
                <li
                  key={row.item_id}
                  onClick={() => row.profile_id && onOpenProfile(row)}
                  className={cn(
                    'rounded-lg border border-border bg-card p-3 flex items-center gap-2',
                    row.profile_id ? 'hover:bg-muted/40 cursor-pointer' : 'opacity-70',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{row.title}</p>
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      {row.subtitle?.match(/^\+?\d/) ? <Phone className="h-3 w-3" /> : null}
                      {row.subtitle || '—'}
                    </p>
                  </div>
                  {row.profile_id && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default WelileOpsCounterBand;
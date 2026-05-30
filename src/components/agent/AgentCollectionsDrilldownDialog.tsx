import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, Loader2, Receipt, CalendarClock } from 'lucide-react';

type CollectionRow = {
  id: string;
  tenant_id: string | null;
  amount: number;
  created_at: string;
  payment_method: string | null;
};

type TenantGroup = {
  tenant_id: string | null;
  name: string;
  total: number;
  rows: CollectionRow[];
};

// Africa/Kampala is a fixed UTC+3 (no DST), so date formatting via Intl is stable.
const kampalaDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

const kampalaTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

function groupByTenant(
  rows: CollectionRow[],
  nameById: Map<string, string>,
): TenantGroup[] {
  const map = new Map<string, TenantGroup>();
  for (const r of rows) {
    const key = r.tenant_id || 'unknown';
    let g = map.get(key);
    if (!g) {
      g = {
        tenant_id: r.tenant_id,
        name: (r.tenant_id && nameById.get(r.tenant_id)) || 'Unknown tenant',
        total: 0,
        rows: [],
      };
      map.set(key, g);
    }
    g.total += Number(r.amount) || 0;
    g.rows.push(r);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function CollectionList({ groups }: { groups: TenantGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No collections recorded for this day.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.tenant_id || 'unknown'} className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-3 p-3 border-b border-border">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{g.name}</p>
                <p className="text-xs text-muted-foreground">
                  {g.rows.length} {g.rows.length === 1 ? 'allocation' : 'allocations'}
                </p>
              </div>
            </div>
            <span className="text-sm font-extrabold tabular-nums text-foreground shrink-0">
              {formatUGX(g.total)}
            </span>
          </div>
          <ul className="divide-y divide-border/60">
            {g.rows
              .slice()
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground min-w-0">
                    <Receipt className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {kampalaTime(r.created_at)}
                      {r.payment_method && <> · {r.payment_method.replace(/_/g, ' ')}</>}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-foreground shrink-0">
                    {formatUGX(Number(r.amount) || 0)}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AgentCollectionsDrilldownDialog({
  open,
  onOpenChange,
  agentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-collections-drilldown', agentId],
    enabled: open && !!agentId,
    staleTime: 15_000,
    queryFn: async () => {
      // Fetch the last ~3 days so both Kampala calendar days are fully covered,
      // then bucket precisely by Kampala date to match the eligibility view.
      const sinceISO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data: rows, error } = await supabase
        .from('agent_collections')
        .select('id, tenant_id, amount, created_at, payment_method')
        .eq('agent_id', agentId)
        .gte('created_at', sinceISO)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const now = new Date();
      const todayStr = kampalaDate(now);
      const yesterdayStr = kampalaDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));

      const today: CollectionRow[] = [];
      const yesterday: CollectionRow[] = [];
      (rows || []).forEach((r: any) => {
        const d = kampalaDate(new Date(r.created_at));
        if (d === todayStr) today.push(r);
        else if (d === yesterdayStr) yesterday.push(r);
      });

      const tenantIds = Array.from(
        new Set([...today, ...yesterday].map((r) => r.tenant_id).filter(Boolean)),
      ) as string[];
      const nameById = new Map<string, string>();
      if (tenantIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', tenantIds);
        (profs || []).forEach((p: any) => {
          nameById.set(p.id, p.full_name || p.phone || 'Tenant');
        });
      }

      return {
        today: groupByTenant(today, nameById),
        yesterday: groupByTenant(yesterday, nameById),
        todayTotal: today.reduce((s, r) => s + (Number(r.amount) || 0), 0),
        yesterdayTotal: yesterday.reduce((s, r) => s + (Number(r.amount) || 0), 0),
      };
    },
  });

  const todayTotal = data?.todayTotal ?? 0;
  const yesterdayTotal = data?.yesterdayTotal ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5 text-primary" />
            Collections breakdown
          </DialogTitle>
          <DialogDescription>
            Which tenants and allocations make up your collected total.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading collections…</span>
          </div>
        ) : (
          <Tabs defaultValue="today" className="w-full">
            <div className="px-4 pt-3">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="today">
                  Today · {formatUGX(todayTotal)}
                </TabsTrigger>
                <TabsTrigger value="yesterday">
                  Yesterday · {formatUGX(yesterdayTotal)}
                </TabsTrigger>
              </TabsList>
            </div>
            <ScrollArea className="max-h-[60vh]">
              <div className="p-4">
                <TabsContent value="today" className="mt-0">
                  <CollectionList groups={data?.today ?? []} />
                </TabsContent>
                <TabsContent value="yesterday" className="mt-0">
                  <CollectionList groups={data?.yesterday ?? []} />
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default AgentCollectionsDrilldownDialog;
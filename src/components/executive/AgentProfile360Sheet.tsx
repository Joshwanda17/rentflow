import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AgentAvatar } from './AgentAvatar';
import { formatUGX } from '@/lib/agentAdvanceCalculations';
import { Loader2, Phone, MapPin, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  agentId: string | null;
  onOpenChange: (open: boolean) => void;
}

const dt = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : '—');

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium truncate">{label}</p>
      <p className={cn('font-bold text-sm mt-1 tabular-nums', tone)}>{value}</p>
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <p className="text-xs text-muted-foreground py-4 text-center">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            {head.map(h => <th key={h} className="text-left font-medium py-1.5 pr-3 whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/60">
              {r.map((c, j) => <td key={j} className="py-1.5 pr-3 whitespace-nowrap tabular-nums">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AgentProfile360Sheet({ agentId, onOpenChange }: Props) {
  const [tab, setTab] = useState('overview');

  const { data, isLoading, error } = useQuery({
    queryKey: ['agent-profile-360', agentId],
    enabled: !!agentId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_agent_profile_360' as any, { p_agent_id: agentId });
      if (error) throw error;
      return data as any;
    },
  });

  const bio = data?.bio ?? {};
  const rr = data?.rent_requests ?? {};
  const rep = data?.repayments ?? {};
  const col = data?.collections ?? {};
  const rec = data?.recruitment ?? {};
  const lst = data?.listings ?? {};
  const perf = data?.performance ?? {};
  const wal = data?.wallet ?? {};
  const tenants: any[] = data?.tenants ?? [];

  const behaviour = useMemo(() => {
    const expected = Number(rep.expected_total || 0);
    const repaid = Number(rep.repaid_total || 0);
    const pct = expected > 0 ? Math.round((repaid / expected) * 100) : 0;
    return { pct, label: pct >= 80 ? 'Strong' : pct >= 50 ? 'Fair' : pct > 0 ? 'Weak' : 'No history' };
  }, [rep]);

  return (
    <Sheet open={!!agentId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-4">
        <SheetHeader className="mb-3">
          <SheetTitle className="text-base">Agent profile</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-8 text-center">Failed to load profile. {(error as any)?.message}</p>
        ) : (
          <div className="space-y-4">
            {/* Identity */}
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-background p-3">
              <AgentAvatar src={bio.avatar_url} name={bio.full_name} className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-sm truncate">{bio.full_name || 'Unknown'}</span>
                  {bio.verified && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
                  <Badge variant={bio.agent_kind === 'sub_agent' ? 'secondary' : 'default'} className="text-[10px]">
                    {bio.agent_kind === 'sub_agent' ? 'Sub-Agent' : 'Agent'}
                  </Badge>
                  {bio.is_frozen && <Badge variant="destructive" className="text-[10px]">Frozen</Badge>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                  {bio.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{bio.phone}</span>}
                  {(bio.district || bio.territory) && (
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{bio.district || bio.territory}</span>
                  )}
                  <span>Joined {dt(bio.created_at)}</span>
                </div>
                {bio.parent_agent && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Recruited by <strong className="text-foreground">{bio.parent_agent.full_name}</strong>
                  </p>
                )}
              </div>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full overflow-x-auto justify-start">
                <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                <TabsTrigger value="rent" className="text-xs">Rent</TabsTrigger>
                <TabsTrigger value="collections" className="text-xs">Collections</TabsTrigger>
                <TabsTrigger value="network" className="text-xs">Recruitment</TabsTrigger>
                <TabsTrigger value="listings" className="text-xs">Listings</TabsTrigger>
                <TabsTrigger value="wallet" className="text-xs">Wallet</TabsTrigger>
                <TabsTrigger value="tenants" className="text-xs">Tenants</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-3 mt-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label="Rent requests" value={rr.total ?? 0} />
                  <Stat label="Tenants" value={tenants.length} />
                  <Stat label="Listings" value={lst.total ?? 0} />
                  <Stat label="Sub-agents" value={rec.sub_agents_total ?? 0} />
                  <Stat label="Collected (all time)" value={formatUGX(Number(col.total || 0))} />
                  <Stat label="Outstanding" value={formatUGX(Number(rep.outstanding_total || 0))} tone="text-amber-600" />
                  <Stat label="Daily target" value={formatUGX(Number(rep.daily_target || 0))} />
                  <Stat label="Earnings (all time)" value={formatUGX(Number(perf.earnings_total || 0))} tone="text-emerald-600" />
                </div>
                <div className="rounded-xl border border-border bg-background p-3">
                  <p className="text-xs font-semibold mb-1">Rent behaviour</p>
                  <p className="text-xs text-muted-foreground">
                    {behaviour.label} · {behaviour.pct}% of expected repayment recovered
                    ({formatUGX(Number(rep.repaid_total || 0))} of {formatUGX(Number(rep.expected_total || 0))})
                  </p>
                  <div className="h-2 rounded-full bg-muted mt-2 overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, behaviour.pct)}%` }} />
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background p-3">
                  <p className="text-xs font-semibold mb-2">Performance by earning type</p>
                  <Table
                    head={['Type', 'Count', 'Total']}
                    rows={(perf.by_type ?? []).map((t: any) => [t.earning_type ?? '—', t.count, formatUGX(Number(t.total || 0))])}
                    empty="No earnings recorded"
                  />
                </div>
              </TabsContent>

              <TabsContent value="rent" className="space-y-3 mt-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label="Total" value={rr.total ?? 0} />
                  <Stat label="Active" value={rr.active ?? 0} />
                  <Stat label="Pending" value={rr.pending ?? 0} />
                  <Stat label="Rejected" value={rr.rejected ?? 0} />
                </div>
                <Table
                  head={['Tenant', 'Status', 'Rent', 'Repaid', 'Daily', 'Created']}
                  rows={(rr.recent ?? []).map((r: any) => [
                    r.tenant_name ?? '—', r.status, formatUGX(Number(r.rent_amount || 0)),
                    formatUGX(Number(r.amount_repaid || 0)), formatUGX(Number(r.daily_repayment || 0)), dt(r.created_at),
                  ])}
                  empty="No rent requests"
                />
              </TabsContent>

              <TabsContent value="collections" className="space-y-3 mt-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label="Collections" value={col.count ?? 0} />
                  <Stat label="Today" value={formatUGX(Number(col.today || 0))} />
                  <Stat label="Last 30d" value={formatUGX(Number(col.last_30d || 0))} />
                  <Stat label="All time" value={formatUGX(Number(col.total || 0))} />
                </div>
                <Table
                  head={['Tenant', 'Amount', 'Method', 'When']}
                  rows={(col.recent ?? []).map((c: any) => [
                    c.tenant_name ?? '—', formatUGX(Number(c.amount || 0)), c.payment_method ?? '—', dt(c.created_at),
                  ])}
                  empty="No collections recorded"
                />
              </TabsContent>

              <TabsContent value="network" className="space-y-3 mt-3">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Sub-agents" value={rec.sub_agents_total ?? 0} />
                  <Stat label="Verified" value={rec.sub_agents_verified ?? 0} />
                  <Stat label="Referrals" value={rec.referrals_total ?? 0} />
                </div>
                <Table
                  head={['Name', 'Phone', 'Status', 'Joined']}
                  rows={(rec.sub_agents ?? []).map((s: any) => [s.full_name ?? '—', s.phone ?? '—', s.status ?? '—', dt(s.created_at)])}
                  empty="No sub-agents recruited"
                />
              </TabsContent>

              <TabsContent value="listings" className="space-y-3 mt-3">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Listings" value={lst.total ?? 0} />
                  <Stat label="Verified" value={lst.verified ?? 0} />
                  <Stat label="Occupied" value={lst.occupied ?? 0} />
                </div>
                <Table
                  head={['Title', 'Category', 'Rent', 'District', 'Verified', 'Listed']}
                  rows={(lst.recent ?? []).map((h: any) => [
                    h.title ?? '—', h.house_category ?? '—', formatUGX(Number(h.monthly_rent || 0)),
                    h.district ?? '—', h.verified ? 'Yes' : 'No', dt(h.created_at),
                  ])}
                  empty="No house listings"
                />
              </TabsContent>

              <TabsContent value="wallet" className="space-y-3 mt-3">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Withdrawable" value={formatUGX(Number(wal.withdrawable || 0))} tone="text-emerald-600" />
                  <Stat label="Float" value={formatUGX(Number(wal.float || 0))} />
                  <Stat label="Advance balance" value={formatUGX(Number(wal.advance_balance || 0))} tone="text-amber-600" />
                </div>
                <Table
                  head={['Principal', 'Outstanding', 'Arrears', 'Daily', 'Status', 'Issued']}
                  rows={(wal.advances ?? []).map((a: any) => [
                    formatUGX(Number(a.principal || 0)), formatUGX(Number(a.outstanding_balance || 0)),
                    formatUGX(Number(a.arrears_balance || 0)), formatUGX(Number(a.daily_installment || 0)),
                    a.status, dt(a.issued_at),
                  ])}
                  empty="No open advances"
                />
              </TabsContent>

              <TabsContent value="tenants" className="mt-3">
                <Table
                  head={['Tenant', 'Phone', 'Status', 'Rent', 'Outstanding']}
                  rows={tenants.map((t: any) => [
                    t.full_name ?? '—', t.phone ?? '—', t.agent_payment_status || t.status || '—',
                    formatUGX(Number(t.rent_amount || 0)), formatUGX(Number(t.outstanding || 0)),
                  ])}
                  empty="No tenants linked to this agent"
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

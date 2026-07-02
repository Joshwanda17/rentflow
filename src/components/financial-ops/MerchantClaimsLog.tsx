import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Loader2, Search, HandCoins, Clock, CheckCircle2, User, RefreshCw, ArrowRight, Download, FileText, FileSpreadsheet,
} from 'lucide-react';
import { format } from 'date-fns';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

interface ClaimRow {
  id: string;
  amount: number;
  status: string;
  payout_method: string | null;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  merchantName: string;
  merchantPhone: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  state: 'in_progress' | 'completed';
}

const COMPLETED_STATUSES = ['approved', 'fin_ops_approved', 'completed'];

function StatusPill({ status, tone }: { status: string; tone?: 'muted' | 'active' }) {
  return (
    <span
      className={cn(
        'inline-block px-2 py-0.5 rounded-md text-[11px] font-medium capitalize border',
        tone === 'active'
          ? 'bg-success/15 text-success border-success/30'
          : 'bg-muted text-muted-foreground border-border',
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function ClaimDetailDrawer({ claim, onClose }: { claim: ClaimRow | null; onClose: () => void }) {
  const { data: record, isLoading } = useQuery({
    queryKey: ['merchant-claim-detail', claim?.id],
    enabled: !!claim,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('id', claim!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, any> | null;
    },
  });

  // Build the state-change audit trail from the record's stage timestamps + actor ids.
  const STAGES: { label: string; at: string; by?: string }[] = [
    { label: 'Requested', at: 'created_at', by: 'initiated_by' },
    { label: 'Processing started', at: 'processing_started_at', by: 'processing_started_by' },
    { label: 'Claimed / dispatched', at: 'dispatched_at', by: 'assigned_cashout_agent_id' },
    { label: 'Manager approved', at: 'manager_approved_at', by: 'manager_approved_by' },
    { label: 'COO approved', at: 'coo_approved_at', by: 'coo_approved_by' },
    { label: 'CFO approved', at: 'cfo_approved_at', by: 'cfo_approved_by' },
    { label: 'Fin Ops verified', at: 'fin_ops_verified_at', by: 'fin_ops_verified_by' },
    { label: 'Fin Ops approved', at: 'fin_ops_approved_at', by: 'fin_ops_approved_by' },
    { label: 'Paid out', at: 'processed_at', by: 'processed_by' },
  ];

  const events = record
    ? STAGES
        .filter(s => record[s.at])
        .map(s => ({ label: s.label, ts: record[s.at] as string, actorId: s.by ? (record[s.by] as string | null) : null }))
        .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    : [];

  const actorIds = Array.from(new Set(events.map(e => e.actorId).filter(Boolean))) as string[];
  const { data: actorMap } = useQuery({
    queryKey: ['merchant-claim-actors', claim?.id, actorIds.join(',')],
    enabled: !!claim && actorIds.length > 0,
    queryFn: async () => {
      const map: Record<string, string> = {};
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', actorIds);
      data?.forEach(p => { map[p.id] = p.full_name || 'Unknown user'; });
      return map;
    },
  });

  const beforeStatus = claim?.state === 'completed' ? 'claimed' : 'pending';
  const afterStatus = claim?.status || 'pending';

  const fields = record
    ? Object.entries(record).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object')
    : [];

  return (
    <Sheet open={!!claim} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {claim && (
          <>
            <SheetHeader>
              <SheetTitle>{formatUGX(claim.amount)} claim</SheetTitle>
              <SheetDescription>
                {claim.merchantName} claimed for {claim.customerName}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-5">
              {/* Before / after status */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Status transition
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusPill status={beforeStatus} tone="muted" />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <StatusPill status={afterStatus} tone="active" />
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {claim.claimedAt && (
                    <p>Claimed {format(new Date(claim.claimedAt), 'dd MMM yyyy, HH:mm')}</p>
                  )}
                  {claim.completedAt && (
                    <p className="text-success">Paid {format(new Date(claim.completedAt), 'dd MMM yyyy, HH:mm')}</p>
                  )}
                </div>
              </div>

              {/* Parties */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Merchant agent</p>
                  <p className="text-sm font-medium mt-0.5">{claim.merchantName}</p>
                  {claim.merchantPhone && <p className="text-xs text-muted-foreground">{claim.merchantPhone}</p>}
                </Card>
                <Card className="p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Customer</p>
                  <p className="text-sm font-medium mt-0.5">{claim.customerName}</p>
                  {claim.customerPhone && <p className="text-xs text-muted-foreground">{claim.customerPhone}</p>}
                </Card>
              </div>

              {/* Audit trail — every claim/payout state change */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Audit trail
                </p>
                {isLoading ? (
                  <div className="flex items-center py-4 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading trail…
                  </div>
                ) : events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recorded state changes.</p>
                ) : (
                  <ol className="relative border-l border-border ml-1.5 space-y-4">
                    {events.map((e, i) => (
                      <li key={`${e.label}-${i}`} className="ml-4">
                        <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                        <p className="text-sm font-medium text-foreground">{e.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(e.ts), 'dd MMM yyyy, HH:mm')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {e.actorId ? `By ${actorMap?.[e.actorId] || 'Resolving…'}` : 'System / automated'}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Underlying withdrawal record */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Underlying withdrawal record
                </p>
                {isLoading ? (
                  <div className="flex items-center py-6 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading record…
                  </div>
                ) : !record ? (
                  <p className="text-sm text-muted-foreground">Record not found.</p>
                ) : (
                  <Card className="divide-y">
                    {fields.map(([k, v]) => (
                      <div key={k} className="flex items-start justify-between gap-3 px-3 py-2">
                        <span className="text-xs text-muted-foreground shrink-0">{k.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-foreground text-right break-all">{String(v)}</span>
                      </div>
                    ))}
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function MerchantClaimsLog() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ClaimRow | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['merchant-claims-log'],
    queryFn: async (): Promise<ClaimRow[]> => {
      // 1. All cash-out (merchant) agents — id (cashout_agents.id) + user id.
      const { data: agents, error: agentsErr } = await supabase
        .from('cashout_agents')
        .select('id, agent_id, profiles:agent_id(id, full_name, phone)');
      if (agentsErr) throw agentsErr;

      const byCashoutId = new Map<string, { name: string; phone: string | null }>();
      const byUserId = new Map<string, { name: string; phone: string | null }>();
      const agentUserIds: string[] = [];
      (agents || []).forEach((a: any) => {
        const p = a.profiles;
        const info = { name: p?.full_name || 'Merchant agent', phone: p?.phone || null };
        byCashoutId.set(a.id, info);
        if (a.agent_id) { byUserId.set(a.agent_id, info); agentUserIds.push(a.agent_id); }
      });

      // 2. In-progress claims — currently assigned to a merchant agent.
      const inProgressReq = supabase
        .from('withdrawal_requests')
        .select('id, user_id, amount, status, payout_method, dispatched_at, assigned_cashout_agent_id, created_at')
        .not('assigned_cashout_agent_id', 'is', null)
        .order('dispatched_at', { ascending: false })
        .limit(300);

      // 3. Completed claims — settled by a merchant agent's own MoMo/cash.
      const completedReq = agentUserIds.length
        ? supabase
            .from('withdrawal_requests')
            .select('id, user_id, amount, status, payout_method, dispatched_at, processed_at, processed_by, created_at')
            .in('processed_by', agentUserIds)
            .in('status', COMPLETED_STATUSES)
            .order('processed_at', { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [], error: null } as any);

      const [inProgRes, completedRes] = await Promise.all([inProgressReq, completedReq]);
      if (inProgRes.error) throw inProgRes.error;
      if (completedRes.error) throw completedRes.error;

      const inProg = inProgRes.data || [];
      const completed = completedRes.data || [];

      // 4. Customer (beneficiary) names.
      const custIds = Array.from(new Set(
        [...inProg, ...completed].map((r: any) => r.user_id).filter(Boolean),
      ));
      const custMap = new Map<string, { name: string; phone: string | null }>();
      if (custIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', custIds);
        profs?.forEach(p => custMap.set(p.id, { name: p.full_name || 'Customer', phone: p.phone || null }));
      }

      const rows: ClaimRow[] = [];
      inProg.forEach((r: any) => {
        const m = byCashoutId.get(r.assigned_cashout_agent_id) || { name: 'Merchant agent', phone: null };
        const c = custMap.get(r.user_id) || { name: 'Customer', phone: null };
        rows.push({
          id: r.id, amount: Number(r.amount || 0), status: r.status, payout_method: r.payout_method,
          customerId: r.user_id, customerName: c.name, customerPhone: c.phone,
          merchantName: m.name, merchantPhone: m.phone,
          claimedAt: r.dispatched_at, completedAt: null, state: 'in_progress',
        });
      });
      completed.forEach((r: any) => {
        const m = byUserId.get(r.processed_by) || { name: 'Merchant agent', phone: null };
        const c = custMap.get(r.user_id) || { name: 'Customer', phone: null };
        rows.push({
          id: r.id, amount: Number(r.amount || 0), status: r.status, payout_method: r.payout_method,
          customerId: r.user_id, customerName: c.name, customerPhone: c.phone,
          merchantName: m.name, merchantPhone: m.phone,
          claimedAt: r.dispatched_at, completedAt: r.processed_at, state: 'completed',
        });
      });

      // Newest activity first.
      rows.sort((a, b) => {
        const ta = new Date(a.completedAt || a.claimedAt || 0).getTime();
        const tb = new Date(b.completedAt || b.claimedAt || 0).getTime();
        return tb - ta;
      });
      return rows;
    },
    staleTime: 30_000,
  });

  const rows = data || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.merchantName.toLowerCase().includes(q) ||
      r.customerName.toLowerCase().includes(q) ||
      (r.customerPhone || '').toLowerCase().includes(q) ||
      (r.merchantPhone || '').toLowerCase().includes(q) ||
      String(r.amount).includes(q) ||
      r.id.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const inProgressCount = rows.filter(r => r.state === 'in_progress').length;
  const completedCount = rows.filter(r => r.state === 'completed').length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-primary/10">
            <HandCoins className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Merchant Claims Log</h2>
            <p className="text-sm text-muted-foreground">
              Every withdrawal claimed by a merchant (cash-out) agent — in progress and completed.
            </p>
          </div>
        </div>
        <button onClick={() => refetch()} className="p-2 rounded-lg hover:bg-muted transition-colors" title="Refresh">
          <RefreshCw className={cn('h-4 w-4 text-muted-foreground', isFetching && 'animate-spin')} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-warning">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium text-muted-foreground">In progress</span>
          </div>
          <p className="text-2xl font-bold mt-1">{inProgressCount}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs font-medium text-muted-foreground">Completed</span>
          </div>
          <p className="text-2xl font-bold mt-1">{completedCount}</p>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by merchant, customer, phone, amount or ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading claims…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <HandCoins className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{search ? 'No claims match your search.' : 'No merchant claims recorded yet.'}</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <Card
              key={`${r.state}-${r.id}`}
              className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setSelected(r)}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{formatUGX(r.amount)}</span>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] capitalize',
                        r.state === 'completed'
                          ? 'bg-success/15 text-success border-success/30'
                          : 'bg-warning/15 text-warning border-warning/30')}
                    >
                      {r.state === 'completed' ? 'Completed' : 'In progress'}
                    </Badge>
                    {r.payout_method && (
                      <span className="text-[11px] text-muted-foreground capitalize">{r.payout_method.replace(/_/g, ' ')}</span>
                    )}
                  </div>
                  <p className="text-sm text-foreground mt-1 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium">{r.merchantName}</span>
                    <span className="text-muted-foreground">claimed for</span>
                    <span>{r.customerName}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.merchantPhone ? `Merchant ${r.merchantPhone}` : ''}
                    {r.merchantPhone && r.customerPhone ? ' · ' : ''}
                    {r.customerPhone ? `Customer ${r.customerPhone}` : ''}
                  </p>
                </div>
                <div className="text-right text-[11px] text-muted-foreground shrink-0">
                  {r.claimedAt && <p>Claimed {format(new Date(r.claimedAt), 'dd MMM yyyy, HH:mm')}</p>}
                  {r.completedAt && <p className="text-success">Paid {format(new Date(r.completedAt), 'dd MMM yyyy, HH:mm')}</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ClaimDetailDrawer claim={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

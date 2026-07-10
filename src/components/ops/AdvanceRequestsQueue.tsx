import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/agentAdvanceCalculations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  CheckCircle2, XCircle, Loader2, Clock, User, Sparkles, Info, TrendingUp,
  Users, Network, Wallet, Home, FileText, ChevronRight, Target, AlertTriangle,
  PiggyBank, Coins, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Agent advances now have a single operational approval desk: Agent Ops.
// Once Agent Ops approves, the request goes straight to the CFO for final
// evaluation and disbursement — there are no tenant/landlord/COO stages.
type ApprovalStage = 'agent_ops';

interface AdvanceRequestsQueueProps {
  stage: ApprovalStage;
}

const STAGE_CONFIG: Record<ApprovalStage, { filterStatus: string; nextStatus: string; reviewerCol: string; reviewedAtCol: string; notesCol: string; title: string }> = {
  agent_ops: { filterStatus: 'pending', nextStatus: 'agent_ops_approved', reviewerCol: 'reviewed_by_agent_ops', reviewedAtCol: 'agent_ops_reviewed_at', notesCol: 'agent_ops_notes', title: 'Agent Advance Requests' },
};

const num = (v: any) => Number(v ?? 0);

function scoreColor(score: number) {
  if (score >= 75) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-rose-600';
}
function scoreBg(score: number) {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}
function tierLabel(score: number) {
  if (score >= 75) return 'High potential';
  if (score >= 50) return 'Growing';
  return 'Early stage';
}

export interface PotentialInfo {
  potential_score: number;
  suggested_amount: number;
  current_limit: number;
  direct_subagents: number;
  active_subagents: number;
  grand_subagents: number;
  rent_collected: number;
  collections_count: number;
  house_listings: number;
  rent_requests: number;
  advances_count: number;
  outstanding_total: number;
  repayment_rate: number | null;
  network_score: number;
  collections_score: number;
  repayment_score: number;
  listings_score: number;
  requests_score: number;
}

/** Shared hook: builds a map of agent_id -> potential info from the scoring RPC. */
export function useAgentPotentialMap() {
  return useQuery({
    queryKey: ['agent-potential-map'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_agent_advance_potential', {
        _search: null,
        _limit: 500,
        _offset: 0,
      });
      if (error) throw error;
      const map: Record<string, PotentialInfo> = {};
      for (const r of (data ?? []) as any[]) {
        map[r.agent_id] = {
          potential_score: num(r.potential_score),
          suggested_amount: num(r.suggested_amount),
          current_limit: num(r.current_limit),
          direct_subagents: num(r.direct_subagents),
          active_subagents: num(r.active_subagents),
          grand_subagents: num(r.grand_subagents),
          rent_collected: num(r.rent_collected),
          collections_count: num(r.collections_count),
          house_listings: num(r.house_listings),
          rent_requests: num(r.rent_requests),
          advances_count: num(r.advances_count),
          outstanding_total: num(r.outstanding_total),
          repayment_rate: r.repayment_rate == null ? null : Number(r.repayment_rate),
          network_score: num(r.network_score),
          collections_score: num(r.collections_score),
          repayment_score: num(r.repayment_score),
          listings_score: num(r.listings_score),
          requests_score: num(r.requests_score),
        };
      }
      return map;
    },
  });
}

/** Map a raw scoring RPC row into PotentialInfo. */
function mapPotentialRow(r: any): PotentialInfo {
  return {
    potential_score: num(r.potential_score),
    suggested_amount: num(r.suggested_amount),
    current_limit: num(r.current_limit),
    direct_subagents: num(r.direct_subagents),
    active_subagents: num(r.active_subagents),
    grand_subagents: num(r.grand_subagents),
    rent_collected: num(r.rent_collected),
    collections_count: num(r.collections_count),
    house_listings: num(r.house_listings),
    rent_requests: num(r.rent_requests),
    advances_count: num(r.advances_count),
    outstanding_total: num(r.outstanding_total),
    repayment_rate: r.repayment_rate == null ? null : Number(r.repayment_rate),
    network_score: num(r.network_score),
    collections_score: num(r.collections_score),
    repayment_score: num(r.repayment_score),
    listings_score: num(r.listings_score),
    requests_score: num(r.requests_score),
  };
}

export function AdvanceRequestsQueue({ stage }: AdvanceRequestsQueueProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const config = STAGE_CONFIG[stage];
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<any | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['advance-requests-queue', stage],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_advance_requests_privileged')
        .select('*')
        .eq('status', config.filterStatus)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: potentialMap = {} } = useAgentPotentialMap();

  const approveMutation = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const updateData: any = {};
      if (approve) {
        updateData.status = config.nextStatus;
        updateData[config.reviewerCol] = user.id;
        updateData[config.reviewedAtCol] = new Date().toISOString();
        if (notes[id]) updateData[config.notesCol] = notes[id];
      } else {
        updateData.status = 'rejected';
        updateData.rejection_reason = notes[id] || 'Rejected at ' + stage.replace('_', ' ') + ' stage';
        updateData[config.reviewerCol] = user.id;
        updateData[config.reviewedAtCol] = new Date().toISOString();
      }
      const { data, error } = await supabase
        .from('agent_advance_requests')
        .update(updateData)
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error('Approval blocked — your role may not have permission, or the request has already moved to a later stage.');
      }
    },
    onSuccess: (_, { approve }) => {
      toast.success(approve ? 'Request approved' : 'Request rejected');
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ['advance-requests-queue'] });
      queryClient.invalidateQueries({ queryKey: ['advance-requests-reviewed'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No advance requests pending at this stage</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">{config.title}</h3>
        <Badge variant="secondary" className="text-xs">{requests.length} to review</Badge>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">
        Tap a request to open the full evaluation — suggested vs requested, limit and performance.
      </p>

      {requests.map((req: any) => {
        const p = req.agent_id ? potentialMap[req.agent_id] : undefined;
        const requested = num(req.principal);
        const suggested = p ? p.suggested_amount : 0;
        const limit = p ? p.current_limit : 0;
        const overSuggested = p && requested > suggested;
        const overLimit = p && limit > 0 && requested > limit;
        return (
          <button
            key={req.id}
            onClick={() => setSelected(req)}
            className="w-full text-left"
          >
            <Card className="overflow-hidden hover:border-primary/40 hover:shadow-md active:scale-[0.99] transition-all">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{req.agent_full_name || 'Agent'}</p>
                    <p className="text-[10px] text-muted-foreground">{req.agent_phone || ''} • {format(new Date(req.created_at), 'MMM d, yyyy')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold text-primary">{formatUGX(requested)}</p>
                    <p className="text-[10px] text-muted-foreground">{req.cycle_days} days</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>

                {/* Brief potential summary */}
                <div className="mt-3 rounded-xl bg-muted/40 p-2.5">
                  {p ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Target className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-[11px] font-semibold truncate">
                            Potential {tierLabel(p.potential_score)}
                          </span>
                        </div>
                        <span className={cn('text-[11px] font-bold shrink-0', scoreColor(p.potential_score))}>
                          {p.potential_score.toFixed(0)}/100
                        </span>
                      </div>
                      <Progress value={p.potential_score} className="h-1.5 mt-1.5" />
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-2 text-[10px]">
                        <span className="text-muted-foreground">
                          Suggested <span className="font-bold text-emerald-600">{formatUGX(suggested)}</span>
                        </span>
                        <span className="text-muted-foreground">
                          Limit <span className="font-bold text-foreground">{formatUGX(limit)}</span>
                        </span>
                        <span className="text-muted-foreground inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />{p.direct_subagents}+{p.grand_subagents} network
                        </span>
                      </div>
                      {(overSuggested || overLimit) && (
                        <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-amber-600">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {overLimit
                            ? `Requested exceeds current limit by ${formatUGX(requested - limit)}`
                            : `Requested is ${formatUGX(requested - suggested)} above the suggested amount`}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1.5">
                      <Info className="h-3 w-3" /> No potential score yet — review manually.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </button>
        );
      })}

      <EvaluationDialog
        req={selected}
        potential={selected?.agent_id ? potentialMap[selected.agent_id] : undefined}
        note={selected ? (notes[selected.id] || '') : ''}
        onNoteChange={(v) => selected && setNotes((prev) => ({ ...prev, [selected.id]: v }))}
        onClose={() => setSelected(null)}
        onDecision={(approve) => selected && approveMutation.mutate({ id: selected.id, approve })}
        pending={approveMutation.isPending}
      />
    </div>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="font-medium">{label} <span className="text-muted-foreground">(max {max})</span></span>
        <span className="font-bold">{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', scoreBg(pct))} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function StatBlock({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-base font-bold mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function EvaluationDialog({
  req, potential: p, note, onNoteChange, onClose, onDecision, pending,
}: {
  req: any | null;
  potential?: PotentialInfo;
  note: string;
  onNoteChange: (v: string) => void;
  onClose: () => void;
  onDecision: (approve: boolean) => void;
  pending: boolean;
}) {
  const requested = num(req?.principal);
  const suggested = p ? p.suggested_amount : 0;
  const limit = p ? p.current_limit : 0;
  const repayPct = p?.repayment_rate == null ? null : Math.round((p!.repayment_rate as number) * 100);
  const overSuggested = p && requested > suggested;
  const overLimit = p && limit > 0 && requested > limit;
  const withinAll = p && !overSuggested && !overLimit;

  const agentId: string | undefined = req?.agent_id || undefined;
  const [showEarnings, setShowEarnings] = useState(false);

  // Agent wallet snapshot — helps judge repayment capacity at a glance.
  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['advance-eval-wallet', agentId],
    enabled: !!agentId,
    staleTime: 30_000,
    queryFn: async () => {
      const [walletRes, availRes] = await Promise.all([
        supabase
          .from('wallets')
          .select('withdrawable_balance, float_balance, advance_balance, balance')
          .eq('user_id', agentId as string)
          .maybeSingle(),
        (supabase.rpc as any)('get_user_available_balance', { p_user_id: agentId }),
      ]);
      return {
        withdrawable: num(walletRes.data?.withdrawable_balance),
        float: num(walletRes.data?.float_balance),
        advance: num(walletRes.data?.advance_balance),
        available: num(availRes?.data),
      };
    },
  });

  // Recent earning activity — fetched lazily only when the reviewer expands it.
  const { data: earnings = [], isLoading: earningsLoading } = useQuery({
    queryKey: ['advance-eval-earnings', agentId],
    enabled: !!agentId && showEarnings,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_earnings')
        .select('id, amount, earning_type, description, created_at')
        .eq('agent_id', agentId as string)
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <Dialog open={!!req} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {req && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {req.agent_full_name || 'Agent'} — advance evaluation
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Wallet snapshot + recent earnings — repayment-capacity context */}
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold flex items-center gap-1.5">
                    <PiggyBank className="h-3.5 w-3.5 text-emerald-600" /> Wallet balance
                  </p>
                  {walletLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2.5 text-center">
                    <p className="text-[9px] uppercase tracking-wide text-emerald-700">Withdrawable</p>
                    <p className="text-sm font-extrabold text-emerald-700 leading-tight">{formatUGX(wallet?.available ?? wallet?.withdrawable ?? 0)}</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 border border-border p-2.5 text-center">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Float</p>
                    <p className="text-sm font-extrabold leading-tight">{formatUGX(wallet?.float ?? 0)}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-2.5 text-center">
                    <p className="text-[9px] uppercase tracking-wide text-amber-700">Advance owed</p>
                    <p className="text-sm font-extrabold text-amber-700 leading-tight">{formatUGX(wallet?.advance ?? 0)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEarnings((s) => !s)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/40 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  <Coins className="h-3.5 w-3.5 text-primary" />
                  {showEarnings ? 'Hide recent earnings' : 'See recent earnings activity'}
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showEarnings ? 'rotate-180' : '')} />
                </button>
                {showEarnings && (
                  <div className="rounded-xl bg-muted/30 p-2 space-y-1 max-h-56 overflow-y-auto">
                    {earningsLoading ? (
                      <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                    ) : earnings.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground text-center py-3">No earnings recorded yet.</p>
                    ) : (
                      earnings.map((e: any) => (
                        <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-background/70 px-2.5 py-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold truncate">
                              {e.description || (e.earning_type ? String(e.earning_type).replace(/_/g, ' ') : 'Earning')}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {e.earning_type ? String(e.earning_type).replace(/_/g, ' ') : ''} · {e.created_at ? format(new Date(e.created_at), 'MMM d, yyyy') : ''}
                            </p>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-600 tabular-nums shrink-0">+{formatUGX(num(e.amount))}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Requested vs suggested vs limit */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Requested</p>
                  <p className="text-lg font-extrabold text-primary leading-tight">{formatUGX(requested)}</p>
                  <p className="text-[10px] text-muted-foreground">{req.cycle_days} days</p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700">Suggested</p>
                  <p className="text-lg font-extrabold text-emerald-600 leading-tight">{p ? formatUGX(suggested) : '—'}</p>
                  <p className="text-[10px] text-emerald-700">safe amount</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Limit</p>
                  <p className="text-lg font-extrabold leading-tight">{p ? formatUGX(limit) : '—'}</p>
                  <p className="text-[10px] text-muted-foreground">current cap</p>
                </div>
              </div>

              {/* Verdict banner */}
              {p && (
                <div className={cn(
                  'rounded-xl p-3 text-xs font-semibold flex items-start gap-2',
                  withinAll ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : overLimit ? 'bg-rose-50 text-rose-800 border border-rose-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200',
                )}>
                  {withinAll ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
                  <span>
                    {withinAll && 'Requested amount is within both the suggested amount and the current limit — safe to approve.'}
                    {overLimit && `Requested amount exceeds the current limit by ${formatUGX(requested - limit)}. Consider rejecting or asking the agent to lower it.`}
                    {overSuggested && !overLimit && `Requested amount is ${formatUGX(requested - suggested)} above the suggested (safe) amount but within the limit. Approve with caution.`}
                  </span>
                </div>
              )}

              {/* Potential headline */}
              {p ? (
                <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-transparent p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Potential score</p>
                    <p className={cn('text-3xl font-extrabold leading-none', scoreColor(p.potential_score))}>
                      {p.potential_score.toFixed(0)}<span className="text-base text-muted-foreground">/100</span>
                    </p>
                    <p className="text-[11px] font-semibold mt-1">{tierLabel(p.potential_score)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Repayment</p>
                    <p className="text-2xl font-extrabold leading-tight">
                      {repayPct == null ? 'New' : `${repayPct}%`}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{p.advances_count} advances taken</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground inline-flex items-center gap-2">
                  <Info className="h-4 w-4" /> No potential score available for this agent — evaluate from the reason and history below.
                </div>
              )}

              {/* Score breakdown */}
              {p && (
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <p className="text-xs font-bold flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Performance breakdown</p>
                  <ScoreBar label="Sub-agent network" value={p.network_score} max={70} />
                  <ScoreBar label="Rent collections" value={p.collections_score} max={15} />
                  <ScoreBar label="Repayment performance" value={p.repayment_score} max={5} />
                  <ScoreBar label="House listings" value={p.listings_score} max={5} />
                  <ScoreBar label="Rent requests" value={p.requests_score} max={5} />
                </div>
              )}

              {/* Stats grid */}
              {p && (
                <div className="grid grid-cols-2 gap-2">
                  <StatBlock icon={Users} label="Direct sub-agents" value={String(p.direct_subagents)} sub={`${p.active_subagents} active`} />
                  <StatBlock icon={Network} label="Grand sub-agents" value={String(p.grand_subagents)} sub="Under their subs" />
                  <StatBlock icon={Wallet} label="Rent collected" value={formatUGX(p.rent_collected)} sub={`${p.collections_count} collections`} />
                  <StatBlock icon={Home} label="Houses listed" value={String(p.house_listings)} />
                  <StatBlock icon={FileText} label="Rent requests" value={String(p.rent_requests)} sub="For tenants" />
                  <StatBlock icon={TrendingUp} label="Repayment" value={repayPct == null ? 'No history' : `${repayPct}%`} sub={p.advances_count > 0 ? `${p.advances_count} advances` : 'Never taken advance'} />
                </div>
              )}

              {p && p.outstanding_total > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Outstanding advance balance: <strong>{formatUGX(p.outstanding_total)}</strong>. Factor this into the decision.
                </div>
              )}

              {/* Cost breakdown of THIS request */}
              <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-muted/50 text-xs">
                <div><span className="text-muted-foreground">Access Fee</span><br /><span className="font-bold">{formatUGX(num(req.access_fee))}</span></div>
                <div><span className="text-muted-foreground">Reg Fee</span><br /><span className="font-bold">{formatUGX(num(req.registration_fee))}</span></div>
                <div><span className="text-muted-foreground">Total Payable</span><br /><span className="font-bold text-primary">{formatUGX(num(req.total_payable))}</span></div>
                <div><span className="text-muted-foreground">Daily Deduction</span><br /><span className="font-bold text-rose-500">{formatUGX(num(req.daily_payment))}/d</span></div>
              </div>

              {/* Reason */}
              <div className="p-3 rounded-xl bg-muted/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Agent's reason</p>
                <p className="text-sm">{req.reason || '—'}</p>
              </div>

              {/* Decision note */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                  Decision note / rejection reason
                </p>
                <Textarea
                  placeholder="Add a note. If rejecting, this reason is shown to the agent."
                  value={note}
                  onChange={(e) => onNoteChange(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>

              <div className="flex gap-2 sticky bottom-0 bg-background pt-1">
                <Button
                  onClick={() => onDecision(true)}
                  disabled={pending}
                  className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve
                </Button>
                <Button
                  onClick={() => onDecision(false)}
                  disabled={pending}
                  variant="destructive"
                  className="flex-1 gap-1.5"
                >
                  <XCircle className="h-4 w-4" /> Reject
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

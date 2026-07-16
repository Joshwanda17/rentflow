import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/agentAdvanceCalculations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  CheckCircle2, XCircle, Loader2, Clock, User, Info,
  Users, ChevronRight, Target, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AgentAdvanceEvaluationDialog,
  type PotentialInfo,
  scoreColor,
  tierLabel,
} from '@/components/agent/AgentAdvanceEvaluationDialog';

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

export function AdvanceRequestsQueue({ stage }: AdvanceRequestsQueueProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const config = STAGE_CONFIG[stage];
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<any | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; amount: number; original: number } | null>(null);

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
    mutationFn: async ({ id, approve, principal }: { id: string; approve: boolean; principal?: number }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const updateData: any = {};
      if (approve) {
        updateData.status = config.nextStatus;
        updateData[config.reviewerCol] = user.id;
        updateData[config.reviewedAtCol] = new Date().toISOString();
        if (notes[id]) updateData[config.notesCol] = notes[id];
        if (typeof principal === 'number' && Number.isFinite(principal) && principal > 0) {
          updateData.principal = principal;
        }
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
      setConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['advance-requests-queue'] });
      queryClient.invalidateQueries({ queryKey: ['advance-requests-reviewed'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const getEditedAmount = (req: any): number => {
    const raw = amounts[req.id];
    if (raw === undefined || raw === '') return num(req.principal);
    const parsed = Number(String(raw).replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : num(req.principal);
  };

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
                      <Info className="h-3 w-3" /> Not ranked yet — tap to generate this agent's evaluation.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </button>
        );
      })}

      <AgentAdvanceEvaluationDialog
        req={selected}
        agentName={selected?.agent_full_name}
        potential={selected?.agent_id ? potentialMap[selected.agent_id] : undefined}
        onClose={() => setSelected(null)}
        footer={selected ? (
          <>
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                Approved amount (UGX)
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1000}
                step={1000}
                value={amounts[selected.id] ?? String(num(selected.principal))}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [selected.id]: e.target.value }))}
                className="text-sm font-semibold"
              />
              {getEditedAmount(selected) !== num(selected.principal) && (
                <p className="mt-1 text-[10px] text-amber-600 font-medium">
                  Adjusted from requested {formatUGX(num(selected.principal))} → {formatUGX(getEditedAmount(selected))}
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                Decision note / rejection reason
              </p>
              <Textarea
                placeholder="Add a note. If rejecting, this reason is shown to the agent."
                value={notes[selected.id] || ''}
                onChange={(e) => setNotes((prev) => ({ ...prev, [selected.id]: e.target.value }))}
                rows={2}
                className="text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  const amt = getEditedAmount(selected);
                  if (amt < 1000) {
                    toast.error('Approved amount must be at least UGX 1,000');
                    return;
                  }
                  setConfirm({ id: selected.id, amount: amt, original: num(selected.principal) });
                }}
                disabled={approveMutation.isPending}
                className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve
              </Button>
              <Button
                onClick={() => approveMutation.mutate({ id: selected.id, approve: false })}
                disabled={approveMutation.isPending}
                variant="destructive"
                className="flex-1 gap-1.5"
              >
                <XCircle className="h-4 w-4" /> Reject
              </Button>
            </div>
          </>
        ) : null}
      />

      <AlertDialog open={!!confirm} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <AlertDialogTitle className="text-center">Confirm advance approval</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              This sends the request to CFO for final disbursement. This action cannot be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirm && (
            <div className="my-2 rounded-xl border bg-muted/40 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Agent requested</span>
                <span className="font-semibold">{formatUGX(confirm.original)}</span>
              </div>
              <div className="flex items-center justify-between text-base">
                <span className="font-semibold">Approving</span>
                <span className="font-bold text-emerald-600">{formatUGX(confirm.amount)}</span>
              </div>
              {confirm.amount !== confirm.original && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Adjusted by {formatUGX(Math.abs(confirm.amount - confirm.original))}{' '}
                    {confirm.amount > confirm.original ? 'above' : 'below'} the agent's request.
                  </span>
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={approveMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={approveMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!confirm) return;
                approveMutation.mutate({ id: confirm.id, approve: true, principal: confirm.amount });
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {approveMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Approving…</>
              ) : (
                <>Confirm approval</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  UserCheck, UserX, Phone, Clock, Shield, AlertTriangle, Loader2, Users, Inbox,
} from 'lucide-react';

interface PendingFunder {
  id: string;
  agent_id: string;
  beneficiary_id: string;
  beneficiary_role: string;
  reason: string | null;
  created_at: string;
  agent: { full_name: string; phone: string } | null;
  beneficiary: { full_name: string; phone: string } | null;
  accruedReturns: number;
  investmentTotal: number;
}

interface Props {
  /** Start expanded (used on the dedicated Pending Portfolios view). */
  defaultExpanded?: boolean;
  /** Render the section (with an empty state) even when there is nothing pending. */
  showWhenEmpty?: boolean;
}

export function PendingFunderApprovals({ defaultExpanded = false, showWhenEmpty = false }: Props = {}) {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: pending, isLoading } = useQuery({
    queryKey: ['pending-funder-approvals'],
    queryFn: async () => {
      // NOTE: do NOT use embedded selects (agent:agent_id(...)) — proxy_agent_assignments
      // has multiple PostgREST relationships on agent_id/beneficiary_id (profiles +
      // manager_profiles + referral_leaderboard + user_financial_summaries views),
      // which makes the embed ambiguous and silently returns nothing.
      const { data: rows, error } = await supabase
        .from('proxy_agent_assignments')
        .select('id, agent_id, beneficiary_id, beneficiary_role, reason, created_at')
        .eq('approval_status', 'pending')
        .eq('beneficiary_role', 'supporter')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const baseRows = rows || [];
      if (baseRows.length === 0) return [] as PendingFunder[];

      // Resolve agent + beneficiary profiles in a single batched fetch
      const profileIds = Array.from(
        new Set(baseRows.flatMap(r => [r.agent_id, r.beneficiary_id]).filter(Boolean))
      );
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', profileIds);
      const profileMap = new Map(
        (profiles || []).map(p => [p.id, { full_name: p.full_name, phone: p.phone }])
      );

      const items: Omit<PendingFunder, 'accruedReturns' | 'investmentTotal'>[] = baseRows.map(r => ({
        ...r,
        agent: profileMap.get(r.agent_id) || null,
        beneficiary: profileMap.get(r.beneficiary_id) || null,
      }));

      // Enrich with portfolio returns for each funder
      const enriched = await Promise.all(items.map(async (item) => {
        const { data: portfolios } = await supabase
          .from('investor_portfolios')
          .select('investment_amount, roi_percentage, created_at, maturity_date, total_roi_earned')
          .eq('investor_id', item.beneficiary_id)
          .eq('status', 'active');

        const now = new Date();
        let accruedReturns = 0;
        let investmentTotal = 0;

        (portfolios || []).forEach((p) => {
          const amt = Number(p.investment_amount) || 0;
          investmentTotal += amt;
          if ((p.total_roi_earned || 0) > 0) {
            accruedReturns += p.total_roi_earned;
            return;
          }
          const created = new Date(p.created_at);
          const maturity = p.maturity_date ? new Date(p.maturity_date) : now;
          const endDate = maturity < now ? maturity : now;
          const monthsElapsed = Math.max(0, (endDate.getTime() - created.getTime()) / (30 * 24 * 60 * 60 * 1000));
          const roiPct = Number(p.roi_percentage) || 0;
          accruedReturns += Math.floor(amt * roiPct / 100 * monthsElapsed);
        });

        return { ...item, accruedReturns: Math.round(accruedReturns), investmentTotal: Math.round(investmentTotal) };
      }));

      return enriched as PendingFunder[];
    },
    refetchInterval: false, // Cost optimization — manual refresh only
  });

  const approveMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      // Always fetch fresh from DB — never rely on stale React Query cache
      const { data: assignment, error: fetchError } = await supabase
        .from('proxy_agent_assignments')
        .select('id, approval_status, beneficiary_id, agent_id, reason, created_at')
        .eq('id', assignmentId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!assignment) throw new Error('Assignment not found');
      if (assignment.approval_status === 'approved') {
        throw new Error('This partner has already been approved.');
      }

      // Fetch names for toast/audit
      const [{ data: agentProfile }, { data: beneficiaryProfile }] = await Promise.all([
        supabase.from('profiles').select('full_name, phone').eq('id', assignment.agent_id).maybeSingle(),
        supabase.from('profiles').select('full_name, phone').eq('id', assignment.beneficiary_id).maybeSingle(),
      ]);

      // 1. Approve the assignment — NO wallet credit. Payouts go through COO→CFO pipeline.
      const { error } = await supabase
        .from('proxy_agent_assignments')
        .update({
          approval_status: 'approved',
          is_active: true,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', assignmentId)
        .eq('approval_status', 'pending');
      if (error) throw error;

      // 2. Audit log
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'approve_proxy_funder',
        table_name: 'proxy_agent_assignments',
        record_id: assignmentId,
        metadata: {
          beneficiary_name: beneficiaryProfile?.full_name,
          agent_name: agentProfile?.full_name,
          note: 'Assignment activated. No lump-sum credit — payouts via COO→CFO pipeline.',
        },
      });

      return { beneficiaryName: beneficiaryProfile?.full_name, agentName: agentProfile?.full_name };
    },
    onSuccess: (data) => {
      toast({ title: '✅ Funder approved', description: `${data.beneficiaryName} approved. Monthly payouts will go through the normal approval pipeline.` });
      queryClient.invalidateQueries({ queryKey: ['pending-funder-approvals'] });
    },
    onError: (err: any) => {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
      queryClient.invalidateQueries({ queryKey: ['pending-funder-approvals'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from('proxy_agent_assignments')
        .update({
          approval_status: 'rejected',
          is_active: false,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', id);
      if (error) throw error;

      const assignment = pending?.find(p => p.id === id);
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'reject_proxy_funder',
        table_name: 'proxy_agent_assignments',
        record_id: id,
        metadata: {
          beneficiary_name: assignment?.beneficiary?.full_name,
          agent_name: assignment?.agent?.full_name,
          rejection_reason: reason,
        },
      });
    },
    onSuccess: () => {
      toast({ title: 'Funder rejected', description: 'The registration has been declined' });
      setRejectId(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['pending-funder-approvals'] });
    },
    onError: (err: any) => {
      toast({ title: 'Rejection failed', description: err.message, variant: 'destructive' });
    },
  });

  const count = pending?.length || 0;
  if (!isLoading && count === 0 && !showWhenEmpty) return null;

  const isEmpty = !isLoading && count === 0;

  return (
    <>
      <Card className={cn(isEmpty ? 'border-border/60' : 'border-warning/40 bg-warning/5')}>
        <CardContent className="p-4 space-y-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <div className={cn('p-1.5 rounded-lg', isEmpty ? 'bg-muted' : 'bg-warning/15')}>
                <Shield className={cn('h-4 w-4', isEmpty ? 'text-muted-foreground' : 'text-warning')} />
              </div>
              <div>
                <h3 className="text-sm font-bold">Pending Funder Approvals</h3>
                <p className="text-[10px] text-muted-foreground">Agent-registered funders awaiting verification</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {count > 0 && (
                <Badge className="bg-warning/20 text-warning border-0 text-xs font-bold">
                  {count}
                </Badge>
              )}
              <svg className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-180")} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
          </button>

          {isExpanded && (isLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 py-8 text-center">
              <Inbox className="h-7 w-7 text-muted-foreground/70" />
              <p className="text-sm font-semibold">No pending funder approvals</p>
              <p className="text-[11px] text-muted-foreground max-w-[260px]">
                Every agent-registered funder has been verified. New registrations will appear here for approval.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {pending?.map(p => (
                <Card key={p.id} className="border border-border/60">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">
                          {p.beneficiary?.full_name || 'Unknown'}
                        </p>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Phone className="h-2.5 w-2.5" />
                          {p.beneficiary?.phone || '—'}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0 gap-1 bg-warning/10 text-warning border-warning/30">
                        <Clock className="h-2.5 w-2.5" /> Pending
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
                      <div className="min-w-0">
                        <p className="text-muted-foreground uppercase tracking-wide">Registered by</p>
                        <p className="font-semibold text-foreground truncate">
                          {p.agent?.full_name || 'Unknown agent'}
                        </p>
                        {p.agent?.phone && <p className="text-muted-foreground">{p.agent.phone}</p>}
                      </div>
                      <div className="min-w-0">
                        <p className="text-muted-foreground uppercase tracking-wide">Registered on</p>
                        <p className="font-semibold text-foreground">
                          {format(new Date(p.created_at), 'dd MMM yyyy, HH:mm')}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-muted-foreground uppercase tracking-wide">Active Funds</p>
                        <p className="font-semibold text-foreground tabular-nums">
                          UGX {p.investmentTotal.toLocaleString()}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-muted-foreground uppercase tracking-wide">Accrued (unpaid)</p>
                        <p className={cn('font-semibold tabular-nums', p.accruedReturns > 0 ? 'text-success' : 'text-muted-foreground')}>
                          UGX {p.accruedReturns.toLocaleString()}
                        </p>
                      </div>
                      {p.reason && (
                        <div className="col-span-2 min-w-0">
                          <p className="text-muted-foreground uppercase tracking-wide">Reason</p>
                          <p className="text-foreground">{p.reason}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-xs gap-1.5 bg-success hover:bg-success/90 text-white"
                        onClick={() => approveMutation.mutate(p.id)}
                        disabled={approveMutation.isPending}
                      >
                        {approveMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <UserCheck className="h-3 w-3" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => setRejectId(p.id)}
                        disabled={rejectMutation.isPending}
                      >
                        <UserX className="h-3 w-3" />
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Rejection Reason Dialog */}
      <Dialog open={!!rejectId} onOpenChange={(o) => { if (!o) { setRejectId(null); setRejectReason(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Reject Funder Registration
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Provide a reason for rejecting this funder registration (min 10 characters).
            </p>
            <Input
              placeholder="Include reason and phone number or A/C"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              maxLength={200}
            />
            <p className="text-[10px] text-muted-foreground">{rejectReason.length}/200 characters</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { setRejectId(null); setRejectReason(''); }}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={rejectReason.trim().length < 10 || rejectMutation.isPending}
              onClick={() => rejectId && rejectMutation.mutate({ id: rejectId, reason: rejectReason.trim() })}
            >
              {rejectMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

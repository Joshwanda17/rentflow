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
  UserCheck, UserX, Phone, Clock, Shield, AlertTriangle, Loader2, Users,
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
}

export function PendingFunderApprovals() {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: pending, isLoading } = useQuery({
    queryKey: ['pending-funder-approvals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proxy_agent_assignments')
        .select('id, agent_id, beneficiary_id, beneficiary_role, reason, created_at, agent:agent_id(full_name, phone), beneficiary:beneficiary_id(full_name, phone)')
        .eq('approval_status', 'pending')
        .eq('beneficiary_role', 'supporter')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as unknown as PendingFunder[]) || [];
    },
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const assignment = pending?.find(p => p.id === assignmentId);
      if (!assignment) throw new Error('Assignment not found');

      const { data: latestAssignment, error: latestAssignmentError } = await supabase
        .from('proxy_agent_assignments')
        .select('id, approval_status, beneficiary_id, agent_id')
        .eq('id', assignmentId)
        .maybeSingle();

      if (latestAssignmentError) throw latestAssignmentError;
      if (!latestAssignment) throw new Error('Assignment not found');
      if (latestAssignment.approval_status === 'approved') {
        throw new Error('This partner has already been approved and credited.');
      }

      // 1. Approve the assignment
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

      // 2. Query beneficiary's portfolios and calculate accrued ROI
      const { data: portfolios } = await supabase
        .from('investor_portfolios')
        .select('id, investment_amount, roi_percentage, created_at, maturity_date, total_roi_earned')
        .eq('investor_id', assignment.beneficiary_id)
        .eq('status', 'active');

      // Calculate actual returns: sum of (investment × roi% / 100 / 12 × months elapsed) per portfolio
      const now = new Date();
      const totalReturns = (portfolios || []).reduce((sum, p) => {
        // Use total_roi_earned if already tracked, otherwise calculate from elapsed time
        if ((p.total_roi_earned || 0) > 0) return sum + p.total_roi_earned;
        const created = new Date(p.created_at);
        const maturity = p.maturity_date ? new Date(p.maturity_date) : now;
        const endDate = maturity < now ? maturity : now;
        const monthsElapsed = Math.max(0, (endDate.getTime() - created.getTime()) / (30 * 24 * 60 * 60 * 1000));
        const monthlyROI = (p.investment_amount || 0) * (p.roi_percentage || 0) / 100 / 12;
        return sum + Math.floor(monthlyROI * monthsElapsed);
      }, 0);
      const firstPortfolioId = portfolios?.[0]?.id || assignmentId;

      // 3. Credit agent wallet with partner's earned returns (not principal)
      if (totalReturns > 0) {
        const { error: rpcError } = await supabase.rpc('credit_proxy_approval', {
          p_agent_id: assignment.agent_id,
          p_beneficiary_id: assignment.beneficiary_id,
          p_amount: totalReturns,
          p_source_id: firstPortfolioId,
          p_transaction_group_id: `proxy-init-${assignmentId}`,
        });
        if (rpcError) throw rpcError;
      }

      // 4. Audit log
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'approve_proxy_funder',
        table_name: 'proxy_agent_assignments',
        record_id: assignmentId,
        metadata: {
          beneficiary_name: assignment.beneficiary?.full_name,
          agent_name: assignment.agent?.full_name,
          credited_returns: totalReturns,
        },
      });

      return { beneficiaryName: assignment.beneficiary?.full_name, agentName: assignment.agent?.full_name, amount: totalReturns };
    },
    onSuccess: (data) => {
      const amountStr = data.amount > 0 ? ` USh ${data.amount.toLocaleString()} returns credited to ${data.agentName}'s wallet.` : '';
      toast({ title: '✅ Funder approved', description: `${data.beneficiaryName} approved.${amountStr}` });
      queryClient.invalidateQueries({ queryKey: ['pending-funder-approvals'] });
    },
    onError: (err: any) => {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
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
  if (!isLoading && count === 0) return null;

  return (
    <>
      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="p-4 space-y-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-warning/15">
                <Shield className="h-4 w-4 text-warning" />
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

                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      <p>
                        <span className="font-medium text-foreground">Registered by:</span>{' '}
                        {p.agent?.full_name || 'Unknown agent'}
                        {p.agent?.phone && <span className="ml-1">({p.agent.phone})</span>}
                      </p>
                      {p.reason && (
                        <p><span className="font-medium text-foreground">Reason:</span> {p.reason}</p>
                      )}
                      <p>
                        <span className="font-medium text-foreground">Date:</span>{' '}
                        {format(new Date(p.created_at), 'dd MMM yyyy, HH:mm')}
                      </p>
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

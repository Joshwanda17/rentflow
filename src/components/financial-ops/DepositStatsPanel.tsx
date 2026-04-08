import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Clock, CheckCircle2, XCircle, ArrowRight, TrendingUp, ChevronDown, ChevronUp, User, Ban } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface DepositStats {
  pending: number;
  approved: number;
  rejected: number;
  pendingAmount: number;
  approvedAmount: number;
  todayCount: number;
  todayAmount: number;
}

interface PendingDeposit {
  id: string;
  amount: number;
  transaction_id: string | null;
  provider: string | null;
  created_at: string;
  user_id: string;
  depositor_name?: string;
}

interface DepositStatsPanelProps {
  onOpenVerification: () => void;
}

export function DepositStatsPanel({ onOpenVerification }: DepositStatsPanelProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<DepositStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDeposits, setPendingDeposits] = useState<PendingDeposit[]>([]);
  const [showPendingList, setShowPendingList] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingDeposit, setRejectingDeposit] = useState<PendingDeposit | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchStats() {
      try {
        const today = new Date().toISOString().split('T')[0];

        const [pendingRes, approvedRes, rejectedRes, todayRes] = await Promise.all([
          supabase
            .from('deposit_requests')
            .select('amount')
            .eq('status', 'pending'),
          supabase
            .from('deposit_requests')
            .select('amount')
            .eq('status', 'approved'),
          supabase
            .from('deposit_requests')
            .select('id')
            .eq('status', 'rejected'),
          supabase
            .from('deposit_requests')
            .select('amount, status')
            .gte('created_at', today),
        ]);

        const pendingData = pendingRes.data || [];
        const approvedData = approvedRes.data || [];
        const rejectedData = rejectedRes.data || [];
        const todayData = todayRes.data || [];

        setStats({
          pending: pendingData.length,
          approved: approvedData.length,
          rejected: rejectedData.length,
          pendingAmount: pendingData.reduce((sum, d) => sum + (d.amount || 0), 0),
          approvedAmount: approvedData.reduce((sum, d) => sum + (d.amount || 0), 0),
          todayCount: todayData.length,
          todayAmount: todayData.reduce((sum, d) => sum + (d.amount || 0), 0),
        });
      } catch (err) {
        console.error('Failed to fetch deposit stats:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const fetchPendingDeposits = async () => {
    if (pendingDeposits.length > 0) {
      setShowPendingList(!showPendingList);
      return;
    }
    setLoadingList(true);
    setShowPendingList(true);
    try {
      const { data: deposits } = await supabase
        .from('deposit_requests')
        .select('id, amount, transaction_id, provider, created_at, user_id')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!deposits || deposits.length === 0) {
        setPendingDeposits([]);
        setLoadingList(false);
        return;
      }

      const userIds = [...new Set(deposits.map(d => d.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

      setPendingDeposits(deposits.map(d => ({
        ...d,
        depositor_name: profileMap.get(d.user_id) || 'Unknown',
      })));
    } catch (err) {
      console.error('Failed to fetch pending deposits:', err);
    } finally {
      setLoadingList(false);
    }
  };

  const openRejectDialog = (deposit: PendingDeposit) => {
    setRejectingDeposit(deposit);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const handleRejectDeposit = useCallback(async () => {
    if (!user || !rejectingDeposit || rejectionReason.trim().length < 10) return;
    setRejecting(true);

    try {
      const { error } = await supabase.functions.invoke('approve-deposit', {
        body: { deposit_request_id: rejectingDeposit.id, action: 'reject', rejection_reason: rejectionReason.trim() },
      });

      if (error) {
        const { extractFromErrorObject } = await import('@/lib/extractEdgeFunctionError');
        const msg = await extractFromErrorObject(error, 'Failed to reject deposit');
        throw new Error(msg);
      }

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'deposit_rejected_inline',
        table_name: 'deposit_requests',
        record_id: rejectingDeposit.id,
        metadata: {
          transaction_id: rejectingDeposit.transaction_id,
          amount: rejectingDeposit.amount,
          depositor_name: rejectingDeposit.depositor_name,
          rejection_reason: rejectionReason.trim(),
        },
      });

      setRejectedIds(prev => new Set(prev).add(rejectingDeposit.id));
      setPendingDeposits(prev => prev.filter(d => d.id !== rejectingDeposit.id));
      toast.success(`Rejected deposit from ${rejectingDeposit.depositor_name || 'user'}`);
    } catch (err: any) {
      toast.error(err.message || 'Rejection failed');
    } finally {
      setRejecting(false);
      setRejectDialogOpen(false);
      setRejectingDeposit(null);
    }
  }, [user, rejectingDeposit, rejectionReason]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden"
    >
      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
        {/* Today's summary */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">Today</span>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold">{formatUGX(stats.todayAmount)}</p>
            <p className="text-[10px] text-muted-foreground">{stats.todayCount} deposits</p>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={fetchPendingDeposits}
            className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-center hover:bg-warning/20 transition-colors cursor-pointer"
          >
            <Clock className="h-4 w-4 text-warning mx-auto mb-1" />
            <p className="text-lg font-bold text-warning">{stats.pending}</p>
            <p className="text-[10px] text-muted-foreground">Pending</p>
            <p className="text-[10px] font-medium text-warning">{formatUGX(stats.pendingAmount)}</p>
            {stats.pending > 0 && (
              showPendingList
                ? <ChevronUp className="h-3 w-3 text-warning mx-auto mt-1" />
                : <ChevronDown className="h-3 w-3 text-warning mx-auto mt-1" />
            )}
          </button>
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-center">
            <CheckCircle2 className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-lg font-bold text-primary">{stats.approved}</p>
            <p className="text-[10px] text-muted-foreground">Approved</p>
            <p className="text-[10px] font-medium text-primary">{formatUGX(stats.approvedAmount)}</p>
          </div>
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-center">
            <XCircle className="h-4 w-4 text-destructive mx-auto mb-1" />
            <p className="text-lg font-bold text-destructive">{stats.rejected}</p>
            <p className="text-[10px] text-muted-foreground">Rejected</p>
          </div>
        </div>

        {/* Pending deposits list */}
        <AnimatePresence>
          {showPendingList && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {loadingList ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : pendingDeposits.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No pending deposits</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Pending Deposits ({pendingDeposits.length})
                  </p>
                  {pendingDeposits.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-muted/30"
                    >
                      <div className="h-8 w-8 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-warning" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{d.depositor_name}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground truncate">
                            {d.transaction_id || 'No ref'}
                          </span>
                          {d.provider && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                              {d.provider}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(d.created_at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <p className="text-sm font-bold text-warning">
                          {formatUGX(d.amount)}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => openRejectDialog(d)}
                        >
                          <Ban className="h-2.5 w-2.5 mr-0.5" /> Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA */}
        <Button onClick={onOpenVerification} className="w-full gap-2" size="sm">
          Open Verification
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Reject Deposit Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Deposit</AlertDialogTitle>
            <AlertDialogDescription>
              Reject {rejectingDeposit ? formatUGX(rejectingDeposit.amount) : ''} from {rejectingDeposit?.depositor_name || 'user'}. The user will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Enter rejection reason (min 10 characters)..."
            className="min-h-[80px]"
          />
          {rejectionReason.trim().length > 0 && rejectionReason.trim().length < 10 && (
            <p className="text-[11px] text-destructive">Reason must be at least 10 characters</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRejectDeposit}
              disabled={rejecting || rejectionReason.trim().length < 10}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {rejecting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Ban className="h-3 w-3 mr-1" />}
              Confirm Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
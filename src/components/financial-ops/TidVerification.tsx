import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Hash,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Clock,
  Ban,
} from 'lucide-react';

interface MatchResult {
  id: string;
  user_id: string;
  amount: number;
  transaction_id: string | null;
  provider: string | null;
  created_at: string;
  notes: string | null;
  userName: string;
  userPhone: string;
  status: 'matched' | 'amount_mismatch';
}

type ResultState = 'idle' | 'searching' | 'found' | 'not_found';

export function TidVerification() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tid, setTid] = useState('');
  const [operatorAmount, setOperatorAmount] = useState('');
  const [provider, setProvider] = useState('mtn');
  const [resultState, setResultState] = useState<ResultState>('idle');
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [approving, setApproving] = useState<string | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const handleVerify = useCallback(async () => {
    const trimmedTid = tid.trim();
    if (!trimmedTid) { toast.error('Enter a Transaction ID'); return; }
    if (!operatorAmount) { toast.error('Enter the amount'); return; }
    if (!user) return;

    // TID format validation
    if (provider === 'mtn' && !trimmedTid.startsWith('MP')) {
      toast.error('MTN Transaction IDs must start with "MP"');
      return;
    }
    if (provider === 'airtel' && trimmedTid.startsWith('MP')) {
      toast.error('This looks like an MTN TID. Select the correct provider.');
      return;
    }

    setResultState('searching');
    setMatches([]);

    try {
      const parsedAmount = parseFloat(operatorAmount);

      // Extract numeric-only portion for legacy fallback matching
      const numericPortion = trimmedTid.replace(/[^0-9]/g, '');

      // Step 1: Search pending deposits with matching TID (two-pass: exact + numeric fallback)
      const [exactResult, numericResult] = await Promise.all([
        supabase
          .from('deposit_requests')
          .select('*')
          .eq('status', 'pending')
          .ilike('transaction_id', `%${trimmedTid}%`)
          .limit(20),
        numericPortion && numericPortion !== trimmedTid
          ? supabase
              .from('deposit_requests')
              .select('*')
              .eq('status', 'pending')
              .ilike('transaction_id', `%${numericPortion}%`)
              .limit(20)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (exactResult.error) throw exactResult.error;
      if (numericResult.error) throw numericResult.error;

      // Merge and deduplicate by id
      const seen = new Set<string>();
      const deposits = [...(exactResult.data || []), ...(numericResult.data || [])].filter(d => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });

      if (deposits?.length) {
        // Found pending deposits — resolve profiles and show matches
        const userIds = [...new Set(deposits.map(d => d.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', userIds);
        const pm = new Map(profiles?.map(p => [p.id, p]) || []);

        const results: MatchResult[] = deposits.map(d => {
          const profile = pm.get(d.user_id);
          const amountMatches = Math.abs(d.amount - parsedAmount) < 1;
          return {
            id: d.id, user_id: d.user_id, amount: d.amount,
            transaction_id: d.transaction_id, provider: d.provider,
            created_at: d.created_at, notes: d.notes,
            userName: profile?.full_name || 'Unknown',
            userPhone: profile?.phone || '',
            status: amountMatches ? 'matched' : 'amount_mismatch',
          };
        });

        results.sort((a, b) => (a.status === 'matched' ? -1 : 1) - (b.status === 'matched' ? -1 : 1));
        setMatches(results);
        setResultState('found');

        const exact = results.filter(r => r.status === 'matched');
        if (exact.length === 1) toast.info('Exact match found — ready to auto-approve.');
        else if (exact.length > 1) toast.warning(`${exact.length} matches — review individually.`);
        return;
      }

      // No pending deposit found
      setResultState('not_found');
    } catch (err: any) {
      toast.error(err.message || 'Verification failed');
      setResultState('idle');
    }
  }, [tid, operatorAmount, provider, user]);

  const handleAutoApprove = useCallback(async (match: MatchResult) => {
    if (!user) return;
    setApproving(match.id);

    try {
      const { error } = await supabase.functions.invoke('approve-deposit', {
        body: { deposit_request_id: match.id, action: 'approve' },
      });

      if (error) {
        const { extractFromErrorObject } = await import('@/lib/extractEdgeFunctionError');
        const msg = await extractFromErrorObject(error, 'Failed to approve deposit');
        throw new Error(msg);
      }

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'tid_verified_approve',
        table_name: 'deposit_requests',
        record_id: match.id,
        metadata: {
          transaction_id: match.transaction_id,
          amount: match.amount,
          depositor_name: match.userName,
          operator_entered_tid: tid.trim(),
          operator_entered_amount: operatorAmount,
        },
      });

      setApprovedIds(prev => new Set(prev).add(match.id));
      toast.success(`Approved ${formatUGX(match.amount)} for ${match.userName}`);

      queryClient.invalidateQueries({ queryKey: ['approval-queue-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['financial-ops-pulse'] });
    } catch (err: any) {
      toast.error(err.message || 'Approval failed');
    } finally {
      setApproving(null);
    }
  }, [user, tid, operatorAmount, queryClient]);

  const handleAutoApproveAll = useCallback(async () => {
    const exact = matches.filter(m => m.status === 'matched' && !approvedIds.has(m.id));
    for (const match of exact) await handleAutoApprove(match);
  }, [matches, approvedIds, handleAutoApprove]);

  const openRejectDialog = (id: string) => {
    setRejectingId(id);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = useCallback(async () => {
    if (!user || !rejectingId || rejectionReason.trim().length < 10) return;
    setRejecting(true);

    try {
      const { error } = await supabase.functions.invoke('approve-deposit', {
        body: { deposit_request_id: rejectingId, action: 'reject', rejection_reason: rejectionReason.trim() },
      });

      if (error) {
        const { extractFromErrorObject } = await import('@/lib/extractEdgeFunctionError');
        const msg = await extractFromErrorObject(error, 'Failed to reject deposit');
        throw new Error(msg);
      }

      const match = matches.find(m => m.id === rejectingId);
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'tid_verified_reject',
        table_name: 'deposit_requests',
        record_id: rejectingId,
        metadata: {
          transaction_id: match?.transaction_id,
          amount: match?.amount,
          depositor_name: match?.userName,
          rejection_reason: rejectionReason.trim(),
          operator_entered_tid: tid.trim(),
          operator_entered_amount: operatorAmount,
        },
      });

      setRejectedIds(prev => new Set(prev).add(rejectingId));
      toast.success(`Rejected deposit for ${match?.userName || 'user'}`);

      queryClient.invalidateQueries({ queryKey: ['approval-queue-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['financial-ops-pulse'] });
    } catch (err: any) {
      toast.error(err.message || 'Rejection failed');
    } finally {
      setRejecting(false);
      setRejectDialogOpen(false);
      setRejectingId(null);
    }
  }, [user, rejectingId, rejectionReason, matches, tid, operatorAmount, queryClient]);

  const reset = () => {
    setTid('');
    setOperatorAmount('');
    setMatches([]);
    setResultState('idle');
    setApprovedIds(new Set());
    setRejectedIds(new Set());
  };

  const pendingMatches = matches.filter(m => m.status === 'matched' && !approvedIds.has(m.id) && !rejectedIds.has(m.id));

  return (
    <Card>
      <CardHeader className="pb-2 px-3 sm:px-6">
        <CardTitle className="text-sm sm:text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          TID Verify
        </CardTitle>
        <p className="text-[10px] sm:text-xs text-muted-foreground">
          Enter TID + Amount → search pending deposits → approve matches.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-6 pb-4">
        {/* Single input form */}
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Transaction ID / Receipt No. *</Label>
            <div className="relative">
              <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={tid}
                onChange={(e) => setTid(e.target.value.toUpperCase())}
                placeholder="e.g. MP241231... or WEL-00001"
                className="pl-8 h-10 font-mono text-sm tracking-wide"
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs font-medium">Amount (UGX) *</Label>
              <Input
                type="number"
                value={operatorAmount}
                onChange={(e) => setOperatorAmount(e.target.value)}
                placeholder="e.g. 50000"
                className="h-10"
              />
            </div>
             <div className="space-y-1 min-w-0">
              <Label className="text-xs font-medium">Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="h-10 w-[100px]">
                  <SelectValue />
                </SelectTrigger>
              <SelectContent>
                  <SelectItem value="mtn">MTN</SelectItem>
                  <SelectItem value="airtel">Airtel</SelectItem>
                  <SelectItem value="bank_transfer">Bank</SelectItem>
                  <SelectItem value="agent_cash">Cash/Rcpt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={handleVerify}
            disabled={resultState === 'searching' || !tid.trim() || !operatorAmount}
            className="w-full h-11"
          >
            {resultState === 'searching' ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Search className="h-4 w-4 mr-1.5" />
            )}
            Verify & Match
          </Button>
        </div>

        {/* Results */}
        <AnimatePresence mode="wait">
          {/* No matching pending deposit */}
          {resultState === 'not_found' && (
            <motion.div
              key="notfound"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-5 text-center rounded-lg border border-destructive/20 bg-destructive/5"
            >
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-sm font-semibold">No Matching Deposit Found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                No pending deposit matches this TID. The user must first submit a deposit through the app before it can be verified here.
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <Badge variant="outline" className="font-mono text-[10px]">{tid.trim()}</Badge>
                <Badge variant="secondary" className="text-[10px]">{formatUGX(parseFloat(operatorAmount))}</Badge>
              </div>
              <Button variant="outline" size="sm" className="mt-3" onClick={reset}>
                Try Another
              </Button>
            </motion.div>
          )}

          {/* Matches found */}
          {resultState === 'found' && matches.length > 0 && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/50 rounded-lg p-2">
                <div className="flex items-center gap-1.5 text-xs flex-wrap">
                  <Badge variant="outline" className="gap-1 text-[10px]">{matches.length} found</Badge>
                  {pendingMatches.length > 0 && (
                    <Badge className="gap-1 bg-emerald-600 text-[10px]">
                      <Zap className="h-2.5 w-2.5" /> {pendingMatches.length} ready
                    </Badge>
                  )}
                </div>
                {pendingMatches.length > 1 && (
                  <Button size="sm" className="h-7 text-[11px] gap-1" onClick={handleAutoApproveAll} disabled={!!approving}>
                    <CheckCircle2 className="h-3 w-3" /> Approve All
                  </Button>
                )}
              </div>

              <ScrollArea className="max-h-[50vh]">
                <div className="space-y-2">
                  {matches.map((m) => {
                    const isApproved = approvedIds.has(m.id);
                    const isRejected = rejectedIds.has(m.id);
                    const isProcessing = approving === m.id;
                    const isDone = isApproved || isRejected;
                    return (
                      <div
                        key={m.id}
                        className={`rounded-lg border p-2.5 transition-colors ${
                          isApproved
                            ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20'
                            : isRejected
                            ? 'border-destructive/30 bg-destructive/5'
                            : m.status === 'matched'
                            ? 'border-emerald-200 bg-background'
                            : 'border-amber-200 bg-amber-50/30 dark:bg-amber-950/10'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs sm:text-sm font-semibold truncate">{m.userName}</span>
                            <span className="text-xs sm:text-sm font-bold text-foreground shrink-0 tabular-nums">
                              {formatUGX(m.amount)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">{m.userPhone}</span>
                            {m.transaction_id && (
                              <Badge variant="outline" className="font-mono text-[9px] h-4 px-1 gap-0.5 border-primary/30 text-primary">
                                <Hash className="h-2.5 w-2.5" /> ••••{m.transaction_id.slice(-2)}
                              </Badge>
                            )}
                            {m.status === 'matched' ? (
                              <Badge className="bg-emerald-600 text-[9px] h-4 gap-0.5 px-1">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Match
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-600 border-amber-300 text-[9px] h-4 gap-0.5 px-1">
                                <AlertTriangle className="h-2.5 w-2.5" /> Amount Mismatch
                              </Badge>
                            )}
                            {isApproved && (
                              <Badge className="bg-emerald-700 text-[9px] h-4 px-1">Approved ✓</Badge>
                            )}
                            {isRejected && (
                              <Badge variant="destructive" className="text-[9px] h-4 px-1">Rejected ✗</Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                            <span>{m.provider || 'MoMo'}</span>
                            <span>{format(new Date(m.created_at), 'dd MMM HH:mm')}</span>
                          </div>
                          {!isDone && (
                            <div className="flex gap-2 mt-1">
                              {m.status === 'matched' && (
                                <Button size="sm" className="h-8 text-xs gap-1 flex-1" disabled={isProcessing} onClick={() => handleAutoApprove(m)}>
                                  {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                                  Auto-Approve
                                </Button>
                              )}
                              <Button size="sm" variant="destructive" className="h-8 text-xs gap-1 flex-1" onClick={() => openRejectDialog(m.id)}>
                                <Ban className="h-3 w-3" /> Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={reset} className="text-xs">Clear & Verify Another</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reject Confirmation Dialog */}
        <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reject Deposit</AlertDialogTitle>
              <AlertDialogDescription>
                Provide a reason for rejecting this deposit. The user will be notified.
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
                onClick={handleReject}
                disabled={rejecting || rejectionReason.trim().length < 10}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {rejecting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Ban className="h-3 w-3 mr-1" />}
                Confirm Reject
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

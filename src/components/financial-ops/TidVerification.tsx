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
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
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

export function TidVerification() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tid, setTid] = useState('');
  const [operatorAmount, setOperatorAmount] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  const handleSearch = useCallback(async () => {
    const trimmedTid = tid.trim();
    if (!trimmedTid) {
      toast.error('Enter a Transaction ID');
      return;
    }

    setSearching(true);
    setMatches([]);
    setSearched(false);

    try {
      // Search pending deposits with matching TID
      const { data: deposits, error } = await supabase
        .from('deposit_requests')
        .select('*')
        .eq('status', 'pending')
        .ilike('transaction_id', `%${trimmedTid}%`)
        .limit(20);

      if (error) throw error;

      if (!deposits?.length) {
        setSearched(true);
        setSearching(false);
        return;
      }

      // Resolve profiles
      const userIds = [...new Set(deposits.map(d => d.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);
      const pm = new Map(profiles?.map(p => [p.id, p]) || []);

      const enteredAmount = operatorAmount ? parseFloat(operatorAmount) : null;

      const results: MatchResult[] = deposits.map(d => {
        const profile = pm.get(d.user_id);
        const amountMatches = enteredAmount ? Math.abs(d.amount - enteredAmount) < 1 : true;
        return {
          id: d.id,
          user_id: d.user_id,
          amount: d.amount,
          transaction_id: d.transaction_id,
          provider: d.provider,
          created_at: d.created_at,
          notes: d.notes,
          userName: profile?.full_name || 'Unknown',
          userPhone: profile?.phone || '',
          status: amountMatches ? 'matched' : 'amount_mismatch',
        };
      });

      // Sort: exact matches first
      results.sort((a, b) => {
        if (a.status === 'matched' && b.status !== 'matched') return -1;
        if (a.status !== 'matched' && b.status === 'matched') return 1;
        return 0;
      });

      setMatches(results);
      setSearched(true);

      // Auto-approve exact matches if amount was entered
      if (enteredAmount) {
        const exactMatches = results.filter(r => r.status === 'matched');
        if (exactMatches.length === 1) {
          toast.info(`Found 1 exact match — TID and amount tally. Ready to auto-approve.`);
        } else if (exactMatches.length > 1) {
          toast.warning(`Found ${exactMatches.length} matches — review and approve individually.`);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [tid, operatorAmount]);

  const handleAutoApprove = useCallback(async (match: MatchResult) => {
    if (!user) return;
    setApproving(match.id);

    try {
      const { error } = await supabase
        .from('deposit_requests')
        .update({
          status: 'approved',
          processed_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', match.id)
        .eq('status', 'pending');

      if (error) throw error;

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'tid_auto_approve',
        table_name: 'deposit_requests',
        record_id: match.id,
        metadata: {
          transaction_id: match.transaction_id,
          amount: match.amount,
          depositor_name: match.userName,
          depositor_phone: match.userPhone,
          operator_entered_tid: tid.trim(),
          operator_entered_amount: operatorAmount || null,
        },
      });

      setApprovedIds(prev => new Set(prev).add(match.id));
      toast.success(`Approved ${formatUGX(match.amount)} deposit for ${match.userName}`);

      // Invalidate queues
      queryClient.invalidateQueries({ queryKey: ['approval-queue-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['financial-ops-pulse'] });
    } catch (err: any) {
      toast.error(err.message || 'Approval failed');
    } finally {
      setApproving(null);
    }
  }, [user, tid, operatorAmount, queryClient]);

  const handleAutoApproveAll = useCallback(async () => {
    const exactMatches = matches.filter(m => m.status === 'matched' && !approvedIds.has(m.id));
    if (!exactMatches.length) return;

    for (const match of exactMatches) {
      await handleAutoApprove(match);
    }
  }, [matches, approvedIds, handleAutoApprove]);

  const resetSearch = () => {
    setTid('');
    setOperatorAmount('');
    setMatches([]);
    setSearched(false);
    setApprovedIds(new Set());
  };

  const pendingMatches = matches.filter(m => m.status === 'matched' && !approvedIds.has(m.id));

  return (
    <Card>
      <CardHeader className="pb-3 px-3 sm:px-6">
        <CardTitle className="text-sm sm:text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          TID Verify
        </CardTitle>
        <p className="text-[10px] sm:text-xs text-muted-foreground">
          Enter the MoMo Transaction ID. Matching deposits auto-approve.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6">
        {/* Input Fields */}
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Transaction ID (TID) *</Label>
            <div className="relative">
              <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={tid}
                onChange={(e) => setTid(e.target.value.toUpperCase())}
                placeholder="e.g. MP241231.1234.K56789"
                className="pl-8 h-10 font-mono text-sm tracking-wide"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs font-medium">Amount (optional)</Label>
              <Input
                type="number"
                value={operatorAmount}
                onChange={(e) => setOperatorAmount(e.target.value)}
                placeholder="e.g. 15000"
                className="h-10"
              />
            </div>
            <div className="self-end">
              <Button
                onClick={handleSearch}
                disabled={searching || !tid.trim()}
                className="h-10 px-4 sm:px-5"
              >
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-1.5">Verify</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Results */}
        <AnimatePresence mode="wait">
          {searched && matches.length === 0 && (
            <motion.div
              key="no-match"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-8 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-sm font-medium">No pending deposit found</p>
              <p className="text-xs text-muted-foreground mt-1">
                No pending deposit matches TID "{tid.trim()}". Double-check the ID or search in the Approval Queue.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={resetSearch}>
                Try Another
              </Button>
            </motion.div>
          )}

          {matches.length > 0 && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {/* Summary bar */}
              <div className="flex items-center justify-between bg-muted/50 rounded-lg p-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="gap-1">
                    {matches.length} found
                  </Badge>
                  {pendingMatches.length > 0 && (
                    <Badge className="gap-1 bg-emerald-600">
                      <Zap className="h-3 w-3" /> {pendingMatches.length} ready to auto-approve
                    </Badge>
                  )}
                </div>
                {pendingMatches.length > 1 && (
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={handleAutoApproveAll}
                    disabled={!!approving}
                  >
                    <CheckCircle2 className="h-3 w-3" /> Approve All ({pendingMatches.length})
                  </Button>
                )}
              </div>

              {/* Match list */}
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {matches.map((m) => {
                    const isApproved = approvedIds.has(m.id);
                    const isProcessing = approving === m.id;

                    return (
                      <motion.div
                        key={m.id}
                        layout
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: isApproved ? 0.6 : 1, scale: 1 }}
                        className={`rounded-lg border p-3 transition-colors ${
                          isApproved
                            ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20'
                            : m.status === 'matched'
                            ? 'border-emerald-200 bg-background'
                            : 'border-amber-200 bg-amber-50/30 dark:bg-amber-950/10'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold">{m.userName}</span>
                              <span className="text-xs text-muted-foreground">{m.userPhone}</span>
                              {m.status === 'matched' ? (
                                <Badge className="bg-emerald-600 text-[10px] h-4 gap-0.5">
                                  <CheckCircle2 className="h-2.5 w-2.5" /> TID & Amount Match
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] h-4 gap-0.5">
                                  <AlertTriangle className="h-2.5 w-2.5" /> Amount Mismatch
                                </Badge>
                              )}
                              {isApproved && (
                                <Badge className="bg-emerald-700 text-[10px] h-4">
                                  Approved ✓
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="font-mono">TID: {m.transaction_id || '—'}</span>
                              <span>•</span>
                              <span>{m.provider || 'MoMo'}</span>
                              <span>•</span>
                              <span>{format(new Date(m.created_at), 'dd MMM HH:mm')}</span>
                            </div>
                            {m.notes && (
                              <p className="text-xs text-muted-foreground italic">"{m.notes}"</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            <span className="text-sm font-bold text-foreground">
                              {formatUGX(m.amount)}
                            </span>
                            {!isApproved && m.status === 'matched' && (
                              <Button
                                size="sm"
                                className="h-7 text-xs gap-1"
                                disabled={isProcessing}
                                onClick={() => handleAutoApprove(m)}
                              >
                                {isProcessing ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <ArrowRight className="h-3 w-3" />
                                )}
                                Auto-Approve
                              </Button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={resetSearch} className="text-xs">
                  Clear & Verify Another
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

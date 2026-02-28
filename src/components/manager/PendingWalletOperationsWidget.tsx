import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { CheckCircle, XCircle, ChevronDown, Clock, ArrowDownToLine, ArrowUpFromLine, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PendingOperation {
  id: string;
  user_id: string;
  amount: number;
  direction: string;
  category: string;
  description: string | null;
  source_table: string;
  source_id: string | null;
  created_at: string;
  status: string;
  metadata: any;
  reference_id: string | null;
  linked_party: string | null;
  user_name?: string;
  agent_name?: string;
}

export function PendingWalletOperationsWidget() {
  const { user } = useAuth();
  const [operations, setOperations] = useState<PendingOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isOpen, setIsOpen] = useState(true);

  const fetchOperations = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Use server-side RPC with built-in joins for 40M scale
      const { data: result, error } = await (supabase.rpc as any)('get_pending_wallet_ops', {
        p_page: 1,
        p_page_size: 50,
      });

      if (error) {
        console.error('Error fetching pending operations:', error);
        return;
      }

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      const ops = (parsed?.data || []) as PendingOperation[];

      if (ops.length > 0) {
        // Agent name enrichment for wallet_deposits source (lightweight — only for displayed items)
        const walletDepositIds = ops.filter(d => d.source_table === 'wallet_deposits' && d.source_id).map(d => d.source_id!);
        
        if (walletDepositIds.length > 0) {
          const { data: depositsData } = await supabase
            .from('wallet_deposits' as any)
            .select('id, agent_id')
            .in('id', walletDepositIds);

          const agentIds = [...new Set((depositsData || []).map((d: any) => d.agent_id).filter(Boolean))];
          const depositAgentMap = new Map((depositsData || []).map((d: any) => [d.id, d.agent_id]));

          let agentNameMap = new Map<string, string>();
          if (agentIds.length > 0) {
            const { data: agentProfiles } = await supabase.from('profiles').select('id, full_name').in('id', agentIds);
            agentNameMap = new Map(agentProfiles?.map(p => [p.id, p.full_name]) || []);
          }

          setOperations(ops.map(op => {
            const agentId = op.source_id ? depositAgentMap.get(op.source_id) : undefined;
            return { ...op, agent_name: agentId ? agentNameMap.get(agentId) : undefined };
          }));
        } else {
          setOperations(ops);
        }
      } else {
        setOperations([]);
      }
    } catch (e) {
      console.error('Failed to fetch operations:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  const handleAction = async (opId: string, action: 'approve' | 'reject') => {
    setProcessing(opId);
    try {
      const { data, error } = await supabase.functions.invoke('approve-wallet-operation', {
        body: {
          operation_id: opId,
          action,
          rejection_reason: action === 'reject' ? rejectionReason : undefined,
        },
      });

      if (error) throw error;

      toast.success(`Operation ${action}d successfully`);
      setOperations(prev => prev.filter(op => op.id !== opId));
      setRejectionReason('');
    } catch (e: any) {
      toast.error(e.message || `Failed to ${action} operation`);
    } finally {
      setProcessing(null);
    }
  };

  const handleBulkApprove = async () => {
    if (operations.length === 0) return;
    setProcessing('bulk');
    try {
      const { data, error } = await supabase.functions.invoke('approve-wallet-operation', {
        body: {
          bulk_ids: operations.map(op => op.id),
          action: 'approve',
        },
      });

      if (error) throw error;

      toast.success(`${operations.length} operations approved`);
      setOperations([]);
    } catch (e: any) {
      toast.error(e.message || 'Bulk approve failed');
    } finally {
      setProcessing(null);
    }
  };

  const formatUGX = (amount: number) => `UGX ${amount.toLocaleString()}`;
  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-UG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const pendingCount = operations.length;
  const totalPendingIn = operations.filter(o => o.direction === 'cash_in').reduce((s, o) => s + o.amount, 0);
  const totalPendingOut = operations.filter(o => o.direction === 'cash_out').reduce((s, o) => s + o.amount, 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-warning/40 bg-gradient-to-br from-warning/5 to-warning/10 shadow-lg">
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer touch-manipulation">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-warning/20">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <CardTitle className="text-base">Pending Wallet Approvals</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {pendingCount} awaiting review
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="animate-pulse text-sm px-2.5 py-0.5">
                    {pendingCount}
                  </Badge>
                )}
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {/* Summary */}
            {pendingCount > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-success/10 border border-success/20">
                  <div className="flex items-center gap-1.5">
                    <ArrowDownToLine className="h-3.5 w-3.5 text-success" />
                    <span className="text-[11px] text-muted-foreground">Pending In</span>
                  </div>
                  <p className="text-sm font-bold text-success mt-0.5">{formatUGX(totalPendingIn)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                  <div className="flex items-center gap-1.5">
                    <ArrowUpFromLine className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-[11px] text-muted-foreground">Pending Out</span>
                  </div>
                  <p className="text-sm font-bold text-destructive mt-0.5">{formatUGX(totalPendingOut)}</p>
                </div>
              </div>
            )}

            {/* Bulk actions */}
            {pendingCount > 1 && (
              <div className="flex gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" className="flex-1 h-10 touch-manipulation" disabled={processing === 'bulk'}>
                      {processing === 'bulk' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Approve All ({pendingCount})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Approve All {pendingCount} Operations?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will credit/debit all {pendingCount} pending wallet operations totaling {formatUGX(totalPendingIn)} in and {formatUGX(totalPendingOut)} out.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBulkApprove}>Approve All</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button size="sm" variant="outline" className="h-10 touch-manipulation" onClick={fetchOperations}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty */}
            {!loading && pendingCount === 0 && (
              <div className="text-center py-6">
                <CheckCircle className="h-8 w-8 text-success mx-auto mb-2" />
                <p className="text-sm font-medium text-success">All caught up!</p>
                <p className="text-xs text-muted-foreground">No pending wallet operations</p>
              </div>
            )}

            {/* Operations list */}
            <AnimatePresence>
              {operations.map(op => (
                <motion.div
                  key={op.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  className={`p-3 rounded-xl border space-y-2 ${
                    op.agent_name 
                      ? 'bg-purple-50 dark:bg-purple-950/30 border-purple-300 dark:border-purple-700 ring-2 ring-purple-400/50' 
                      : 'bg-card'
                  }`}
                >
                  {/* Agent deposit banner — highly visible */}
                  {op.agent_name && (
                    <div className="p-2.5 rounded-lg bg-purple-500/15 border-2 border-purple-500/40">
                      <p className="text-[9px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest mb-1">
                        ⚠️ Agent Wallet Deposit — Verify with Agent
                      </p>
                      <p className="text-base font-black text-purple-700 dark:text-purple-300">
                        Deposited by: {op.agent_name}
                      </p>
                      <p className="text-[10px] text-purple-600/70 dark:text-purple-400/70 mt-0.5">
                        Cash collected by agent and deposited into tenant wallet
                      </p>
                    </div>
                  )}

                  {/* Reference / Source info */}
                  {!op.agent_name && (
                    <div className="p-2 rounded-lg bg-warning/10 border border-warning/30">
                      <p className="text-[9px] font-semibold text-warning uppercase tracking-wider mb-0.5">
                        {op.reference_id ? 'Reference ID — Verify First' : 'Source — Verify'}
                      </p>
                      <p className="font-mono text-lg font-black text-foreground break-all leading-tight">
                        {op.reference_id || op.source_table.replace(/_/g, ' ')}
                      </p>
                    </div>
                  )}

                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {op.direction === 'cash_in' ? (
                          <ArrowDownToLine className="h-3.5 w-3.5 text-success flex-shrink-0" />
                        ) : (
                          <ArrowUpFromLine className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                        )}
                        <span className="text-sm font-bold truncate">{op.user_name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {op.description || op.category}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{formatTime(op.created_at)}</p>
                    </div>
                    <span className={`text-base font-black ${op.direction === 'cash_in' ? 'text-success' : 'text-destructive'}`}>
                      {op.direction === 'cash_in' ? '+' : '-'}{formatUGX(op.amount)}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 h-10 touch-manipulation"
                      onClick={() => handleAction(op.id, 'approve')}
                      disabled={processing === op.id}
                    >
                      {processing === op.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Approve
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1 h-10 touch-manipulation"
                          disabled={processing === op.id}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reject Operation?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {formatUGX(op.amount)} {op.direction === 'cash_in' ? 'credit' : 'debit'} for {op.user_name}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <Input
                          placeholder="Reason for rejection..."
                          value={rejectionReason}
                          onChange={e => setRejectionReason(e.target.value)}
                          className="h-12"
                        />
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleAction(op.id, 'reject')}
                            disabled={!rejectionReason.trim()}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Reject
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

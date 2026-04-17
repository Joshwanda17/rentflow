import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Wallet, Smartphone, Building2, Banknote, Bell } from 'lucide-react';
import { WithdrawalPayoutCard } from '@/components/withdrawals/WithdrawalPayoutCard';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: any | null;
}

export function CashoutPendingWithdrawalsDialog({ open, onOpenChange, agent }: Props) {
  const qc = useQueryClient();

  const { data: allWithdrawals = [], isLoading } = useQuery({
    queryKey: ['cfo-pending-withdrawals'],
    queryFn: async () => {
      // No FK between withdrawal_requests.user_id and profiles — fetch and join manually.
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .in('status', ['pending', 'requested', 'manager_approved', 'cfo_approved', 'approved', 'fin_ops_approved'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = data || [];
      if (rows.length === 0) return rows;
      const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);
      const map = new Map((profs || []).map((p: any) => [p.id, p]));
      return rows.map((r: any) => ({ ...r, profiles: map.get(r.user_id) || null }));
    },
    enabled: open,
    staleTime: 15_000,
  });

  // Realtime subscription while dialog is open
  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel('cfo-cashout-pending-withdrawals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, () => {
        qc.invalidateQueries({ queryKey: ['cfo-pending-withdrawals'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, qc]);

  const cashoutAgentRowId = agent?.id; // cashout_agents.id (FK target for assigned_cashout_agent_id)
  const agentName = agent?.profiles?.full_name || 'Agent';

  const momoWithdrawals = allWithdrawals.filter((w: any) => ['mobile_money', 'mtn_mobile_money', 'airtel_money'].includes(w.payout_method));
  const bankWithdrawals = allWithdrawals.filter((w: any) => w.payout_method === 'bank_transfer');
  const cashWithdrawals = allWithdrawals.filter((w: any) => ['cash', 'cash_pickup'].includes(w.payout_method) || !w.payout_method);
  const totalPending = allWithdrawals.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Pending Withdrawals
          </DialogTitle>
          <DialogDescription>
            All pending withdrawals visible to cash-out agents. <span className="font-semibold">{agentName}</span> can claim &amp; complete these from their own dashboard.
          </DialogDescription>
        </DialogHeader>

        {totalPending > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-400">
            <Bell className="h-4 w-4 animate-pulse" />
            <span className="text-xs font-medium">{totalPending} pending withdrawal{totalPending !== 1 ? 's' : ''} — Live</span>
          </div>
        )}

        <Tabs defaultValue="all">
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1 gap-1">
              <Wallet className="h-3.5 w-3.5" /> All
              {totalPending > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{totalPending}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="momo" className="flex-1 gap-1">
              <Smartphone className="h-3.5 w-3.5" /> MoMo
              {momoWithdrawals.length > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{momoWithdrawals.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="bank" className="flex-1 gap-1">
              <Building2 className="h-3.5 w-3.5" /> Bank
              {bankWithdrawals.length > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{bankWithdrawals.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="cash" className="flex-1 gap-1">
              <Banknote className="h-3.5 w-3.5" /> Cash
              {cashWithdrawals.length > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{cashWithdrawals.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {(['all', 'momo', 'bank', 'cash'] as const).map(tab => {
            const items = tab === 'all' ? allWithdrawals : tab === 'momo' ? momoWithdrawals : tab === 'bank' ? bankWithdrawals : cashWithdrawals;
            const emptyMsg = tab === 'all' ? 'No pending withdrawals' : `No pending ${tab} payouts`;
            return (
              <TabsContent key={tab} value={tab} className="space-y-2 mt-3">
                {isLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : items.length === 0 ? (
                  <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{emptyMsg}</CardContent></Card>
                ) : (
                  items.map((w: any) => (
                    <WithdrawalPayoutCard
                      key={w.id}
                      withdrawal={w}
                      readOnly
                      isClaimed={cashoutAgentRowId && w.assigned_cashout_agent_id === cashoutAgentRowId}
                      isClaimedByOther={!!w.assigned_cashout_agent_id && w.assigned_cashout_agent_id !== cashoutAgentRowId}
                    />
                  ))
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

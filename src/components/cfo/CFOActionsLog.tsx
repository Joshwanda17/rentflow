import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ArrowDownRight, ArrowUpRight, Clock } from 'lucide-react';
import { format } from 'date-fns';

const ACTION_ICONS: Record<string, string> = {
  cfo_direct_credit: '💰',
  cfo_direct_debit: '🔻',
  wallet_deduction: '🔄',
  roi_payout: '📈',
  deposit_approval: '✅',
  withdrawal_approval: '💸',
  commission_payout: '👤',
  rent_payout_approved: '🏠',
};

const ACTION_LABELS: Record<string, string> = {
  cfo_direct_credit: 'Wallet Credit',
  cfo_direct_debit: 'Wallet Debit',
  wallet_deduction: 'Wallet Deduction',
  roi_payout: 'ROI Payout',
  deposit_approval: 'Deposit Approved',
  withdrawal_approval: 'Withdrawal Approved',
  commission_payout: 'Commission Payout',
  rent_payout_approved: 'Rent Payout',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

export function CFOActionsLog() {
  const { data: actions, isLoading } = useQuery({
    queryKey: ['cfo-actions-log'],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('id, action_type, created_at, metadata')
        .in('action_type', [
          'cfo_direct_credit', 'cfo_direct_debit', 'wallet_deduction',
          'roi_payout', 'deposit_approval', 'withdrawal_approval',
          'commission_payout', 'rent_payout_approved',
        ])
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-4 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!actions?.length) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Recent CFO Actions</p>
          <p className="text-sm text-muted-foreground">No actions recorded yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Recent CFO Actions</p>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {actions.map((action: any) => {
            const meta = action.metadata || {};
            const amount = meta.amount ? Number(meta.amount) : 0;
            const targetName = meta.target_name || meta.target_user_name || meta.user_name || '';
            const reason = meta.reason || meta.description || '';
            const icon = ACTION_ICONS[action.action_type] || '📋';
            const label = ACTION_LABELS[action.action_type] || action.action_type.replace(/_/g, ' ');
            const isDebit = action.action_type.includes('debit') || action.action_type === 'wallet_deduction';
            const categoryLabel = meta.category_label || '';

            return (
              <div key={action.id} className="flex items-start gap-3 p-2.5 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors">
                <div className="text-lg shrink-0 mt-0.5">{icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold truncate">{label}</p>
                    <p className={`text-xs font-bold font-mono tabular-nums shrink-0 ${isDebit ? 'text-destructive' : 'text-emerald-600'}`}>
                      {isDebit ? '−' : '+'}{fmt(amount)}
                    </p>
                  </div>
                  {targetName && (
                    <p className="text-[11px] text-foreground/80 truncate">{targetName}</p>
                  )}
                  {(reason || categoryLabel) && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {categoryLabel ? `${categoryLabel} • ` : ''}{reason}
                    </p>
                  )}
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(action.created_at), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

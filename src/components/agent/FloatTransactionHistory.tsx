import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ArrowDownLeft, ArrowUpRight, History } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TxEntry {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  date: string;
  status?: string;
}

export function FloatTransactionHistory({ open, onOpenChange }: Props) {
  const { user } = useAuth();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['float-tx-history', user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Fetch credits (funding), debits (withdrawals), and ledger entries in parallel
      const [{ data: funding }, { data: withdrawals }, { data: ledgerEntries }] = await Promise.all([
        supabase
          .from('agent_float_funding')
          .select('id, amount, created_at, notes')
          .eq('agent_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('agent_float_withdrawals')
          .select('id, amount, landlord_name, status, created_at')
          .eq('agent_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('general_ledger')
          .select('id, amount, description, direction, created_at, category')
          .eq('user_id', user.id)
          .eq('category', 'rent_float_funding')
          .in('ledger_scope', ['bridge', 'wallet'])
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      const entries: TxEntry[] = [];

      (funding || []).forEach(f => {
        entries.push({
          id: f.id,
          type: 'credit',
          amount: f.amount,
          description: f.notes || 'Float credited by management',
          date: f.created_at,
        });
      });

      // Add ledger-based float funding entries (bridge scope from CFO approval)
      const fundingIds = new Set((funding || []).map(f => f.id));
      (ledgerEntries || []).forEach(le => {
        if (!fundingIds.has(le.id)) {
          entries.push({
            id: le.id,
            type: le.direction === 'cash_in' ? 'credit' : 'debit',
            amount: le.amount,
            description: le.description || 'Float funded from platform',
            date: le.created_at,
          });
        }
      });

      (withdrawals || []).forEach(w => {
        entries.push({
          id: w.id,
          type: 'debit',
          amount: w.amount,
          description: `Paid to ${w.landlord_name}`,
          date: w.created_at,
          status: w.status,
        });
      });

      return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },
    enabled: !!user && open,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl p-0">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-chart-4" />
            Float Transaction History
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(80vh-60px)] px-4">
          {isLoading ? (
            <div className="flex justify-center py-12 text-muted-foreground text-sm">Loading...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No float transactions yet.</div>
          ) : (
            <div className="space-y-2 pb-6">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/30 transition-colors">
                  <div className={`p-2 rounded-lg shrink-0 ${tx.type === 'credit' ? 'bg-success/10' : 'bg-chart-4/10'}`}>
                    {tx.type === 'credit' ? (
                      <ArrowDownLeft className="h-4 w-4 text-success" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-chart-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(tx.date), 'dd MMM yy, HH:mm')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-bold text-sm ${tx.type === 'credit' ? 'text-success' : 'text-foreground'}`}>
                      {tx.type === 'credit' ? '+' : '-'}{formatUGX(tx.amount)}
                    </p>
                    {tx.status && (
                      <Badge
                        variant={tx.status === 'completed' ? 'default' : tx.status === 'rejected' ? 'destructive' : 'secondary'}
                        className="text-[8px] mt-0.5"
                      >
                        {tx.status.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

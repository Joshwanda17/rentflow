import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Wallet, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { format, formatDistanceToNow } from 'date-fns';

interface WalletDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletBalance: number;
}

interface EnrichedTransaction {
  id: string;
  sender_id: string;
  recipient_id: string;
  amount: number;
  description: string | null;
  created_at: string;
  sender_name: string;
  recipient_name: string;
}

export function WalletDetailsSheet({ open, onOpenChange, walletBalance }: WalletDetailsSheetProps) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<EnrichedTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(50);

      // Filter out pool deployment transactions (admin-only)
      const ADMIN_ONLY_DESCRIPTIONS = ['pool deployment'];
      const filtered = (data || []).filter(t => 
        !ADMIN_ONLY_DESCRIPTIONS.some(term => t.description?.toLowerCase().startsWith(term))
      );

      if (error || !filtered.length) {
        setTransactions([]);
        return;
      }

      const userIds = [...new Set([...filtered.map(t => t.sender_id), ...filtered.map(t => t.recipient_id)])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name || 'Unknown']) || []);

      setTransactions(filtered.map(t => ({
        ...t,
        sender_name: profileMap.get(t.sender_id) || 'Unknown',
        recipient_name: profileMap.get(t.recipient_id) || 'Unknown',
      })));
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open) fetchTransactions();
  }, [open, fetchTransactions]);

  const isSent = (tx: EnrichedTransaction) => tx.sender_id === user?.id;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl p-0">
        <SheetHeader className="p-5 pb-3">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Wallet className="h-5 w-5 text-primary" />
            My Wallet
          </SheetTitle>
        </SheetHeader>

        {/* Balance card */}
        <div className="mx-5 mb-4 rounded-2xl bg-primary/10 p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Available Balance</p>
          <p className="text-3xl font-black text-foreground tracking-tight">{formatUGX(walletBalance)}</p>
        </div>

        {/* Transactions */}
        <div className="px-5 pb-2">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Transaction History</p>
        </div>

        <ScrollArea className="flex-1 h-[calc(85dvh-200px)]">
          <div className="divide-y divide-border px-5">
            {loading && (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading transactions…</div>
            )}
            {!loading && transactions.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">No transactions yet.</div>
            )}
            {transactions.map(tx => {
              const sent = isSent(tx);
              return (
                <div key={tx.id} className="flex items-center gap-3 py-3">
                  <div className={`p-2 rounded-xl ${sent ? 'bg-destructive/10' : 'bg-emerald-500/10'}`}>
                    {sent
                      ? <ArrowUpRight className="h-4 w-4 text-destructive" />
                      : <ArrowDownLeft className="h-4 w-4 text-emerald-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {sent ? `To: ${tx.recipient_name}` : `From: ${tx.sender_name}`}
                    </p>
                    {tx.description && (
                      <p className="text-xs text-muted-foreground truncate">{tx.description}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground/70">
                      {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })} · {format(new Date(tx.created_at), 'MMM d, HH:mm')}
                    </p>
                  </div>
                  <p className={`text-sm font-bold tabular-nums ${sent ? 'text-destructive' : 'text-emerald-600'}`}>
                    {sent ? '-' : '+'}{formatUGX(tx.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Landmark, Wallet, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

export function PlatformVsWalletSummary() {
  const { data, isLoading } = useQuery({
    queryKey: ['cfo-platform-vs-wallets'],
    queryFn: async () => {
      // Total wallet balances (all users)
      const { data: wallets } = await supabase
        .from('wallets')
        .select('balance');
      const totalWallets = (wallets || []).reduce((s, w) => s + (w.balance || 0), 0);

      // Platform ledger: net cash position (cash_in - cash_out for platform scope)
      const { data: platformIn } = await supabase
        .from('general_ledger')
        .select('amount')
        .eq('ledger_scope', 'platform')
        .eq('direction', 'cash_in');
      const platformCashIn = (platformIn || []).reduce((s, e) => s + (e.amount || 0), 0);

      const { data: platformOut } = await supabase
        .from('general_ledger')
        .select('amount')
        .eq('ledger_scope', 'platform')
        .eq('direction', 'cash_out');
      const platformCashOut = (platformOut || []).reduce((s, e) => s + (e.amount || 0), 0);

      const platformNet = platformCashIn - platformCashOut;

      // Total system money (all ledger cash_in - cash_out)
      const { data: allIn } = await supabase
        .from('general_ledger')
        .select('amount')
        .eq('direction', 'cash_in')
        .in('ledger_scope', ['wallet', 'bridge']);
      const allCashIn = (allIn || []).reduce((s, e) => s + (e.amount || 0), 0);

      const { data: allOut } = await supabase
        .from('general_ledger')
        .select('amount')
        .eq('direction', 'cash_out')
        .in('ledger_scope', ['wallet', 'bridge']);
      const allCashOut = (allOut || []).reduce((s, e) => s + (e.amount || 0), 0);

      const ledgerNetWallets = allCashIn - allCashOut;
      const variance = totalWallets - ledgerNetWallets;

      return { totalWallets, platformNet, ledgerNetWallets, variance, platformCashIn, platformCashOut };
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const { totalWallets, platformNet, variance } = data;
  const isBalanced = Math.abs(variance) < 100; // within 100 UGX tolerance

  return (
    <div className="space-y-3">
      {/* Main two-column comparison */}
      <div className="grid grid-cols-2 gap-3">
        {/* Wallet Total */}
        <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 p-4">
          <div className="absolute top-2 right-2 opacity-10">
            <Wallet className="h-16 w-16 text-primary" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-primary/20">
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                User Wallets
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-black font-mono tracking-tight text-primary">
              {formatUGX(totalWallets)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Total held in all user wallets
            </p>
          </div>
        </div>

        {/* Platform Ledger */}
        <div className="relative overflow-hidden rounded-2xl border-2 border-accent/30 bg-gradient-to-br from-accent/5 to-accent/10 p-4">
          <div className="absolute top-2 right-2 opacity-10">
            <Landmark className="h-16 w-16 text-accent-foreground" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-accent/20">
                <Landmark className="h-4 w-4 text-accent-foreground" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-accent-foreground">
                Platform Ledger
              </span>
            </div>
            <p className={cn(
              "text-xl sm:text-2xl font-black font-mono tracking-tight",
              platformNet >= 0 ? "text-success" : "text-destructive"
            )}>
              {formatUGX(platformNet)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Platform net position (income − expenses)
            </p>
          </div>
        </div>
      </div>

      {/* Reconciliation status bar */}
      <div className={cn(
        "flex items-center justify-between rounded-xl px-4 py-2.5 text-xs font-medium border",
        isBalanced
          ? "bg-success/10 border-success/30 text-success"
          : "bg-warning/10 border-warning/30 text-warning"
      )}>
        <div className="flex items-center gap-2">
          {isBalanced ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <span>
            {isBalanced
              ? "Wallets & Ledger are reconciled ✓"
              : `Variance detected: ${formatUGX(Math.abs(variance))}`}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          Auto-checked
        </span>
      </div>
    </div>
  );
}

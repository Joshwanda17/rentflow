import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Landmark, Wallet, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

export function PlatformVsWalletSummary() {
  const { data, isLoading } = useQuery({
    queryKey: ['cfo-platform-vs-wallets'],
    queryFn: async () => {
      // Use RPC to bypass 1000-row limit
      const { data: walletTotals } = await supabase.rpc('get_wallet_totals');
      const totalWallets = Number((walletTotals as any)?.total_balance ?? 0);

      // Platform cash: all-time earned revenue minus costs (paginated, direction-fallback)
      const revenueCategories = ['tenant_access_fee', 'access_fee', 'tenant_request_fee', 'request_fee', 'platform_service_income', 'landlord_platform_fee', 'management_fee'];
      const costCategories = ['supporter_platform_rewards', 'supporter_reward', 'investment_reward', 'roi_payout', 'agent_commission_payout', 'agent_commission', 'agent_payout', 'agent_approval_bonus', 'referral_bonus', 'transaction_platform_expenses', 'operational_expenses', 'platform_expense'];
      const allPlatformRows: any[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: page } = await supabase
          .from('general_ledger')
          .select('amount, direction, category')
          .eq('ledger_scope', 'platform')
          .neq('category', 'opening_balance')
          .range(offset, offset + 999);
        if (page && page.length > 0) {
          allPlatformRows.push(...page);
          offset += 1000;
          hasMore = page.length === 1000;
        } else {
          hasMore = false;
        }
      }
      const sumByCat = (rows: any[], cats: string[]) => rows.filter(r => cats.includes(r.category)).reduce((s, r) => s + Number(r.amount), 0);
      const pIn = allPlatformRows.filter(e => e.direction === 'cash_in');
      const pOut = allPlatformRows.filter(e => e.direction === 'cash_out');
      const rev = sumByCat(pIn, revenueCategories) || sumByCat(pOut, revenueCategories);
      const costs = sumByCat(pOut, costCategories) || sumByCat(pIn, costCategories);
      const platformNet = Math.max(0, rev - costs);

      const { data: allIn } = await supabase
        .from('general_ledger').select('amount')
        .eq('direction', 'cash_in').in('ledger_scope', ['wallet', 'bridge']);
      const allCashIn = (allIn || []).reduce((s, e) => s + (e.amount || 0), 0);

      const { data: allOut } = await supabase
        .from('general_ledger').select('amount')
        .eq('direction', 'cash_out').in('ledger_scope', ['wallet', 'bridge']);
      const allCashOut = (allOut || []).reduce((s, e) => s + (e.amount || 0), 0);

      const ledgerNetWallets = allCashIn - allCashOut;
      const variance = totalWallets - ledgerNetWallets;

      return { totalWallets, platformNet, ledgerNetWallets, variance };
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
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
  const isBalanced = Math.abs(variance) < 100;

  return (
    <div className="space-y-2">
      {/* Stacked metric cards — clean and readable on all screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">User Wallets</p>
            <p className="text-base sm:text-lg font-bold font-mono tracking-tight truncate">
              {formatUGX(totalWallets)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          <div className="p-2 rounded-lg bg-accent/10 shrink-0">
            <Landmark className="h-4 w-4 text-accent-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Platform Ledger</p>
            <p className={cn(
              "text-base sm:text-lg font-bold font-mono tracking-tight truncate",
              platformNet >= 0 ? "text-emerald-600" : "text-destructive"
            )}>
              {formatUGX(platformNet)}
            </p>
          </div>
        </div>
      </div>

      {/* Reconciliation status — compact inline */}
      <div className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium",
        isBalanced
          ? "bg-emerald-500/8 text-emerald-600"
          : "bg-amber-500/8 text-amber-600"
      )}>
        {isBalanced ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">
          {isBalanced
            ? "Reconciled ✓"
            : `Variance: ${formatUGX(Math.abs(variance))}`}
        </span>
      </div>
    </div>
  );
}

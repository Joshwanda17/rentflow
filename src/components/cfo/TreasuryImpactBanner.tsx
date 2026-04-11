import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight, Wallet, TrendingDown, Landmark, Loader2 } from 'lucide-react';

interface TreasuryImpactBannerProps {
  payoutAmount: number;
}

export function TreasuryImpactBanner({ payoutAmount }: TreasuryImpactBannerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['treasury-cash-snapshot'],
    queryFn: async () => {
      const { data: ledger } = await supabase
        .from('general_ledger')
        .select('amount, direction')
        .eq('ledger_scope', 'platform');

      let totalCash = 0;
      (ledger || []).forEach((e: any) => {
        totalCash += e.direction === 'credit' ? e.amount : -e.amount;
      });

      const { data: wallets } = await supabase
        .from('wallets')
        .select('balance');
      const walletTotal = (wallets || []).reduce((s: number, w: any) => s + (w.balance || 0), 0);

      return { totalCash, walletTotal };
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading treasury…
      </div>
    );
  }

  const totalCash = data?.totalCash || 0;
  const remaining = totalCash - payoutAmount;
  const walletTotal = data?.walletTotal || 0;
  const remainingAfterWallets = remaining - walletTotal;
  const isRisky = remaining < walletTotal;

  const fmt = (n: number) => `UGX ${Math.abs(n).toLocaleString()}`;

  return (
    <div className={`rounded-lg p-3 space-y-2 text-sm border ${isRisky ? 'bg-destructive/10 border-destructive/30' : 'bg-muted/50 border-border'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Treasury Impact
      </p>
      <div className="flex items-center gap-2 flex-wrap text-xs sm:text-sm">
        <div className="flex items-center gap-1.5">
          <Landmark className="h-4 w-4 text-primary shrink-0" />
          <div>
            <p className="text-[10px] text-muted-foreground leading-none">We Have</p>
            <p className="font-bold">{fmt(totalCash)}</p>
          </div>
        </div>

        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        <div className="flex items-center gap-1.5">
          <TrendingDown className="h-4 w-4 text-orange-500 shrink-0" />
          <div>
            <p className="text-[10px] text-muted-foreground leading-none">This Payout</p>
            <p className="font-bold text-orange-600">−{fmt(payoutAmount)}</p>
          </div>
        </div>

        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        <div className="flex items-center gap-1.5">
          <Wallet className={`h-4 w-4 shrink-0 ${isRisky ? 'text-destructive' : 'text-emerald-500'}`} />
          <div>
            <p className="text-[10px] text-muted-foreground leading-none">We Keep</p>
            <p className={`font-bold ${isRisky ? 'text-destructive' : 'text-emerald-600'}`}>
              {remaining < 0 ? '−' : ''}{fmt(remaining)}
            </p>
          </div>
        </div>
      </div>

      {isRisky && (
        <p className="text-[10px] text-destructive font-medium">
          ⚠️ After this payout, remaining cash ({fmt(remaining)}) will be less than user wallets ({fmt(walletTotal)}).
        </p>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { HandCoins, TrendingUp } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { Skeleton } from '@/components/ui/skeleton';

export function SupporterPoolBalanceCard() {
  const [poolBalance, setPoolBalance] = useState(0);
  const [totalDeployed, setTotalDeployed] = useState(0);
  const [monthlyObligation, setMonthlyObligation] = useState(0);
  const [deployableAmount, setDeployableAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPoolBalance();
    const handler = () => fetchPoolBalance();
    window.addEventListener('pool-funded', handler);
    return () => window.removeEventListener('pool-funded', handler);
  }, []);

  const fetchPoolBalance = async () => {
    const [inRes, outRes, withdrawnRes] = await Promise.all([
      supabase
        .from('general_ledger')
        .select('amount')
        .eq('category', 'supporter_rent_fund'),
      supabase
        .from('general_ledger')
        .select('amount')
        .eq('category', 'pool_rent_deployment'),
      supabase
        .from('general_ledger')
        .select('amount')
        .eq('category', 'supporter_capital_return'),
    ]);

    const totalIn = (inRes.data || []).reduce((s, r) => s + Number(r.amount), 0);
    const totalOut = (outRes.data || []).reduce((s, r) => s + Number(r.amount), 0);
    const totalWithdrawn = (withdrawnRes.data || []).reduce((s, r) => s + Number(r.amount), 0);
    const pool = totalIn - totalOut;
    const activeCapital = totalIn - totalWithdrawn;
    const obligation = Math.round(activeCapital * 0.15);
    const deployable = Math.max(0, pool - obligation);

    setPoolBalance(pool);
    setTotalDeployed(totalOut);
    setMonthlyObligation(obligation);
    setDeployableAmount(deployable);
    setLoading(false);
  };

  if (loading) {
    return <Skeleton className="h-24 w-full rounded-2xl" />;
  }

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-card to-primary/10 p-4 space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-xl bg-primary/15">
          <HandCoins className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-black text-foreground text-sm">Supporter Pool Funds</h3>
          <p className="text-[10px] text-muted-foreground font-medium">Available for rent deployment</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-primary/10 px-3 py-2">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Available</p>
          <p className="text-xl font-black text-primary">{formatUGX(poolBalance)}</p>
        </div>
        <div className="rounded-xl bg-muted/50 px-3 py-2">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Deployed
          </p>
          <p className="text-xl font-black text-foreground">{formatUGX(totalDeployed)}</p>
        </div>
      </div>
    </div>
  );
}

import { Target, TrendingUp, PieChart, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TOTAL_POOL_UGX, TOTAL_SHARES, PRICE_PER_SHARE } from './constants';
import { useAngelPoolData } from '@/hooks/useAngelPoolData';

const formatCompact = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
};

export function AngelPoolDashboard() {
  const { totalRaised, sharesRemaining, progress, topInvestors, isLoading } = useAngelPoolData();

  if (isLoading) {
    return <div className="h-48 rounded-2xl bg-muted/50 animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border bg-card p-3 flex items-start gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 shrink-0">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Total Raised</p>
            <p className="text-lg font-black">UGX {formatCompact(totalRaised)}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 flex items-start gap-2.5">
          <div className="p-2 rounded-xl bg-secondary/50 shrink-0">
            <Target className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Target</p>
            <p className="text-lg font-black">UGX {formatCompact(TOTAL_POOL_UGX)}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 flex items-start gap-2.5">
          <div className="p-2 rounded-xl bg-warning/10 shrink-0">
            <PieChart className="h-4 w-4 text-warning" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Filled</p>
            <p className="text-lg font-black">{progress.toFixed(1)}%</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 flex items-start gap-2.5">
          <div className="p-2 rounded-xl bg-destructive/10 shrink-0">
            <Layers className="h-4 w-4 text-destructive" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Shares Left</p>
            <p className="text-lg font-black">{sharesRemaining.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold">Pool Progress</span>
            <span className="text-muted-foreground">{progress.toFixed(1)}%</span>
          </div>
          <Progress value={progress} size="lg" variant={progress > 75 ? 'warning' : 'default'} className="h-3" />
          <p className="text-[11px] text-destructive font-semibold">
            ⚡ Only {sharesRemaining.toLocaleString()} shares remaining
          </p>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Top Contributors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {topInvestors.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No investments yet. Be the first!</p>
          )}
          {topInvestors.slice(0, 5).map((inv, i) => (
            <div key={inv.id} className="flex items-center gap-3 py-1.5">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{inv.name}</p>
                <p className="text-[10px] text-muted-foreground">{inv.shares} shares</p>
              </div>
              <span className="text-sm font-bold text-primary">UGX {formatCompact(inv.amount)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

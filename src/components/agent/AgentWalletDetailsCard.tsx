import { useAgentBalances } from '@/hooks/useAgentBalances';
import { useWalletMovementCounts } from '@/hooks/useWalletMovementCounts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2, Wallet, ArrowDownLeft, ArrowUpRight, Activity, Clock, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentWalletDetailsCardProps {
  agentId?: string;
  onOpenWallet?: () => void;
}

export function AgentWalletDetailsCard({ agentId, onOpenWallet }: AgentWalletDetailsCardProps) {
  const {
    withdrawableBalance,
    floatBalance,
    advanceBalance,
    pendingHolds,
    totalBalance,
    isLoading: balancesLoading,
  } = useAgentBalances(agentId);

  const { counts, isLoading: countsLoading } = useWalletMovementCounts(agentId);

  const isLoading = balancesLoading || countsLoading;

  if (isLoading) {
    return (
      <Card className="border border-border/60 bg-card">
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const netLedger = totalBalance;

  return (
    <Card className={cn(
      "border border-border/60 bg-card overflow-hidden",
      onOpenWallet && "cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all active:scale-[0.99] touch-manipulation"
    )}
    onClick={onOpenWallet}
    style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2 text-foreground">
          <Wallet className="h-4 w-4 text-primary" />
          Wallet Details
        </CardTitle>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-4">
        {/* Primary balances */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-primary/5 border border-primary/10 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 mb-1">
              Available
            </p>
            <p className={cn(
              "font-bold text-lg tabular-nums leading-tight",
              withdrawableBalance > 0 ? 'text-primary' : 'text-muted-foreground'
            )}>
              {formatUGX(withdrawableBalance)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Can withdraw now</p>
          </div>

          <div className="rounded-xl bg-muted/40 border border-border/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Ledger Balance
            </p>
            <p className="font-bold text-lg tabular-nums leading-tight text-foreground">
              {formatUGX(netLedger)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Backed by ledger</p>
          </div>
        </div>

        {/* Secondary buckets */}
        <div className="space-y-2">
          {floatBalance > 0 && (
            <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 last:border-0">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ArrowDownLeft className="h-3 w-3 text-amber-500" />
                Company Float
              </span>
              <span className="text-xs font-medium text-foreground tabular-nums">{formatUGX(floatBalance)}</span>
            </div>
          )}
          {advanceBalance > 0 && (
            <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 last:border-0">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ArrowUpRight className="h-3 w-3 text-destructive" />
                Advance Owed
              </span>
              <span className="text-xs font-medium text-destructive tabular-nums">{formatUGX(advanceBalance)}</span>
            </div>
          )}
          {pendingHolds > 0 && (
            <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 last:border-0">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-amber-600" />
                Pending Hold
              </span>
              <span className="text-xs font-medium text-amber-600 tabular-nums">{formatUGX(pendingHolds)}</span>
            </div>
          )}
        </div>

        {/* Movement counts */}
        <div className="rounded-xl bg-muted/30 border border-border/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            Recent Movements
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="text-sm font-bold text-foreground tabular-nums">{counts.last24h}</p>
              <p className="text-[10px] text-muted-foreground">24h</p>
            </div>
            <div className="text-center border-x border-border/30">
              <p className="text-sm font-bold text-foreground tabular-nums">{counts.last7d}</p>
              <p className="text-[10px] text-muted-foreground">7d</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-foreground tabular-nums">{counts.last30d}</p>
              <p className="text-[10px] text-muted-foreground">30d</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

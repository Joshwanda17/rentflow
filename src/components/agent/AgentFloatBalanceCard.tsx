import { useAgentBalances } from '@/hooks/useAgentBalances';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2, Wallet, Lock, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function AgentFloatBalanceCard() {
  const { withdrawableBalance, floatBalance, advanceBalance, isLoading } = useAgentBalances();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (withdrawableBalance === 0 && floatBalance === 0 && advanceBalance === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-600" /> Available Balance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* PRIMARY: withdrawable */}
        <p className={`font-bold text-2xl ${withdrawableBalance > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
          {formatUGX(withdrawableBalance)}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Available to withdraw</p>

        {/* Outstanding advance (liability) */}
        {advanceBalance > 0 && (
          <div className="mt-3 pt-3 border-t border-dashed flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3" />
              Outstanding Advance
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help underline decoration-dotted underline-offset-2">why?</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs">
                    Money owed back to the platform. Future salary or commission will pay this down automatically.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
            <span className="text-xs font-semibold text-destructive tabular-nums">{formatUGX(advanceBalance)}</span>
          </div>
        )}

        {/* Locked float (company money) */}
        {floatBalance > 0 && (
          <div className="mt-3 pt-3 border-t border-dashed flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              Company Float (locked)
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help underline decoration-dotted underline-offset-2">why?</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs">
                    Float is company money for paying tenants & landlords. It cannot be withdrawn.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
            <span className="text-xs font-medium text-foreground/80 tabular-nums">{formatUGX(floatBalance)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

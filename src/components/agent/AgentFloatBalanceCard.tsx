import { useAgentBalances } from '@/hooks/useAgentBalances';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2, Wallet, Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function AgentFloatBalanceCard() {
  const { floatBalance, commissionBalance, totalBalance, isLoading } = useAgentBalances();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (totalBalance === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-600" /> Withdrawable Earnings
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Lead with the ACTUAL withdrawable amount (commission only) */}
        <p className={`font-bold text-2xl ${commissionBalance > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
          {formatUGX(commissionBalance)}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Your commission — available to cash out</p>

        {/* Locked float shown as secondary, clearly non-withdrawable */}
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
                  Float is company money for paying tenants & landlords. It cannot be withdrawn — only your commission can.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
          <span className="text-xs font-medium text-foreground/80 tabular-nums">{formatUGX(floatBalance)}</span>
        </div>

        <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground/70">
          <span>Total in wallet</span>
          <span className="tabular-nums">{formatUGX(totalBalance)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

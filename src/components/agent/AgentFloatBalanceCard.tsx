import { useAgentBalances } from '@/hooks/useAgentBalances';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2, Wallet, Lock, AlertTriangle, Clock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function AgentFloatBalanceCard() {
  const { withdrawableBalance, floatBalance, advanceBalance, pendingHolds, isLoading } = useAgentBalances();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (withdrawableBalance === 0 && floatBalance === 0 && advanceBalance === 0 && pendingHolds === 0) return null;

  // When the agent only has float (no withdrawable commission), surface
  // the float prominently as the headline so deposited operational money
  // is visible at a glance. Otherwise keep withdrawable as the headline.
  const floatIsHeadline = withdrawableBalance === 0 && floatBalance > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-600" />
          {floatIsHeadline ? 'Operational Float' : 'Available Balance'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {floatIsHeadline ? (
          <>
            <p className="font-bold text-2xl text-foreground">{formatUGX(floatBalance)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Company float — for paying tenants & landlords (not withdrawable)
            </p>
          </>
        ) : (
          <>
            <p className={`font-bold text-2xl ${withdrawableBalance > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
              {formatUGX(withdrawableBalance)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Available to withdraw</p>
          </>
        )}

        {/* Pending withdrawal hold (already subtracted from withdrawable) */}
        {pendingHolds > 0 && (
          <div className="mt-3 pt-3 border-t border-dashed flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-amber-600">
              <Clock className="h-3 w-3" />
              Held against pending withdrawal
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help underline decoration-dotted underline-offset-2">why?</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] text-xs">
                    You have a withdrawal in progress. This amount is reserved and will be released back if the request is rejected.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
            <span className="text-xs font-semibold text-amber-600 tabular-nums">{formatUGX(pendingHolds)}</span>
          </div>
        )}

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

        {/* Locked float (company money) — only as a secondary row when
            withdrawable is already shown as the headline. */}
        {floatBalance > 0 && !floatIsHeadline && (
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

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
          <Wallet className="h-4 w-4 text-primary" /> Agent Wallet
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`font-bold text-lg ${totalBalance < 0 ? 'text-destructive' : 'text-foreground'}`}>
          {formatUGX(totalBalance)}
        </p>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
          <span className="inline-flex items-center gap-0.5">
            Withdrawable
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Lock className="h-2.5 w-2.5 text-muted-foreground/70 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  Commission cannot be used for tenant payments — float only.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            : <span className={`font-medium ${commissionBalance > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>{formatUGX(commissionBalance)}</span>
          </span>
          <span>·</span>
          <span>Company Float: <span className="font-medium text-primary">{formatUGX(floatBalance)}</span></span>
        </p>
      </CardContent>
    </Card>
  );
}

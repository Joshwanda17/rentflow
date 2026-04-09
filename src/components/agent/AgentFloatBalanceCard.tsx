import { useAgentBalances } from '@/hooks/useAgentBalances';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2, Wallet } from 'lucide-react';

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
        <p className="text-xs text-muted-foreground mt-1">
          Withdrawable: <span className="font-medium text-emerald-600">{formatUGX(commissionBalance)}</span>
          {' · '}
          Locked: <span className="font-medium text-primary">{formatUGX(floatBalance)}</span>
        </p>
      </CardContent>
    </Card>
  );
}

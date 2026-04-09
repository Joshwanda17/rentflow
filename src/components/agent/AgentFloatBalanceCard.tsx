import { useAgentBalances } from '@/hooks/useAgentBalances';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2, Banknote, ArrowDownToLine, Wallet, Shield } from 'lucide-react';

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
          <Banknote className="h-4 w-4 text-primary" /> Agent Wallet
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-primary/10">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <Banknote className="h-3 w-3" /> Float
            </div>
            <p className={`font-bold text-sm ${floatBalance < 0 ? 'text-destructive' : 'text-primary'}`}>
              {formatUGX(floatBalance)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <Shield className="h-3 w-3" /> Commission
            </div>
            <p className="font-bold text-sm text-emerald-600">{formatUGX(commissionBalance)}</p>
          </div>
          <div className="col-span-2 p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <Wallet className="h-3 w-3" /> Total Balance
            </div>
            <p className="font-bold text-sm">{formatUGX(totalBalance)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
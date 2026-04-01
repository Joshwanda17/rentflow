import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PiggyBank, TrendingUp, Wallet, Phone } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

interface FunderPortfolioCardProps {
  funder: {
    full_name: string;
    phone: string;
  };
  stats: {
    totalInvested: number;
    totalROI: number;
    activeCount: number;
    walletBalance: number;
  };
}

export function FunderPortfolioCard({ funder, stats }: FunderPortfolioCardProps) {
  const { formatAmountCompact, formatAmount } = useCurrency();

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">{funder.full_name}</h3>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              {funder.phone}
            </div>
          </div>
          <Badge className="bg-primary/20 text-primary border-0">
            💼 Funder
          </Badge>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-background/80 p-3 text-center">
            <PiggyBank className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-[10px] text-muted-foreground">Invested</p>
            <p className="text-sm font-bold truncate">
              <span className="sm:hidden">{formatAmountCompact(stats.totalInvested)}</span>
              <span className="hidden sm:inline">{formatAmount(stats.totalInvested)}</span>
            </p>
          </div>
          <div className="rounded-xl bg-background/80 p-3 text-center">
            <TrendingUp className="h-4 w-4 mx-auto text-success mb-1" />
            <p className="text-[10px] text-muted-foreground">Returns</p>
            <p className="text-sm font-bold text-success truncate">
              <span className="sm:hidden">{formatAmountCompact(stats.totalROI)}</span>
              <span className="hidden sm:inline">{formatAmount(stats.totalROI)}</span>
            </p>
          </div>
          <div className="rounded-xl bg-background/80 p-3 text-center">
            <Wallet className="h-4 w-4 mx-auto text-warning mb-1" />
            <p className="text-[10px] text-muted-foreground">Wallet</p>
            <p className="text-sm font-bold truncate">
              <span className="sm:hidden">{formatAmountCompact(stats.walletBalance)}</span>
              <span className="hidden sm:inline">{formatAmount(stats.walletBalance)}</span>
            </p>
          </div>
          <div className="rounded-xl bg-background/80 p-3 text-center">
            <p className="text-lg font-bold text-primary">{stats.activeCount}</p>
            <p className="text-[10px] text-muted-foreground">Active Accounts</p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-center text-muted-foreground">
          Your money is safe & working. Questions? Contact your Welile agent.
        </p>
      </CardContent>
    </Card>
  );
}

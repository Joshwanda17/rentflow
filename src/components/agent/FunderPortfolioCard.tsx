import { formatUGX } from '@/lib/rentCalculations';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PiggyBank, TrendingUp, Wallet, Phone } from 'lucide-react';

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
            <p className="text-sm font-bold">{formatUGX(stats.totalInvested)}</p>
          </div>
          <div className="rounded-xl bg-background/80 p-3 text-center">
            <TrendingUp className="h-4 w-4 mx-auto text-success mb-1" />
            <p className="text-[10px] text-muted-foreground">Returns</p>
            <p className="text-sm font-bold text-success">{formatUGX(stats.totalROI)}</p>
          </div>
          <div className="rounded-xl bg-background/80 p-3 text-center">
            <Wallet className="h-4 w-4 mx-auto text-amber-500 mb-1" />
            <p className="text-[10px] text-muted-foreground">Wallet</p>
            <p className="text-sm font-bold">{formatUGX(stats.walletBalance)}</p>
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

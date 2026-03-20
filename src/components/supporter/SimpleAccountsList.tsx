import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Wallet, Sparkles, ArrowDownToLine, ChevronRight, TrendingUp } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { InvestmentAccount } from '@/components/supporter/InvestmentAccountCard';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface SimpleAccountsListProps {
  accounts: InvestmentAccount[];
  onCreateAccount: () => void;
  onFundAccount: (account: InvestmentAccount) => void;
  onWithdrawAccount: (account: InvestmentAccount) => void;
  onViewDetails: (account: InvestmentAccount) => void;
}

const accentColors = [
  'border-l-[hsl(var(--primary))]',
  'border-l-[hsl(var(--success))]',
  'border-l-[hsl(142,60%,45%)]',
  'border-l-[hsl(220,80%,55%)]',
  'border-l-[hsl(32,95%,50%)]',
];

export function SimpleAccountsList({
  accounts,
  onCreateAccount,
  onFundAccount,
  onWithdrawAccount,
  onViewDetails,
}: SimpleAccountsListProps) {
  const navigate = useNavigate();

  const statusDot = (status?: string) => {
    switch (status) {
      case 'approved': return 'bg-success animate-[pulse_3s_ease-in-out_infinite]';
      case 'pending': return 'bg-warning';
      case 'rejected': return 'bg-destructive';
      default: return 'bg-muted-foreground/40';
    }
  };

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground tracking-tight">My Accounts</h3>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/investment-portfolio')}
            className="h-7 text-[11px] text-muted-foreground hover:text-foreground gap-0.5 px-2"
          >
            View All
            <ChevronRight className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            onClick={onCreateAccount}
            className="h-8 gap-1 text-xs font-semibold rounded-lg"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
      </div>

      {/* Empty State */}
      {accounts.length === 0 ? (
        <Card className="border border-dashed border-border/60 bg-transparent">
          <CardContent className="p-8 text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto">
              <Wallet className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">No accounts yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Create one to start earning</p>
              <Button onClick={onCreateAccount} size="sm" className="gap-1.5 h-9 rounded-lg">
                <Plus className="h-3.5 w-3.5" />
                Create Account
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {accounts.map((account, index) => (
            <div
              key={account.id}
              onClick={() => onViewDetails(account)}
              className="cursor-pointer animate-fade-in"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <Card className={cn(
                'border-l-[3px] border border-border/40 bg-card hover:bg-accent/30 transition-colors duration-200 active:scale-[0.98] transition-transform',
                accentColors[index % accentColors.length]
              )}>
                <CardContent className="p-3.5">
                  <div className="flex items-center gap-3">
                    {/* Left: Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', statusDot(account.status))} />
                        <p className="text-[13px] font-bold text-foreground truncate leading-tight">
                          {account.name}
                        </p>
                      </div>
                      <p className="text-xl font-black text-foreground font-mono tabular-nums tracking-tight leading-tight">
                        {formatUGX(account.balance)}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <TrendingUp className="h-2.5 w-2.5 text-success" />
                        <span className="text-[10px] font-semibold text-success">15% monthly</span>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    {account.status === 'approved' && (
                      <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onFundAccount(account)}
                          className="h-9 w-9 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary flex items-center justify-center transition-colors active:scale-95"
                          title="Fund"
                        >
                          <Sparkles className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onWithdrawAccount(account)}
                          disabled={account.balance <= 0}
                          className="h-9 w-9 rounded-lg border border-border/60 hover:bg-muted/60 text-muted-foreground flex items-center justify-center transition-colors active:scale-95 disabled:opacity-30"
                          title="Withdraw"
                        >
                          <ArrowDownToLine className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

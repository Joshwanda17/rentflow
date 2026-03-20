import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, TrendingUp, MoreVertical, Trash2, Edit2, Sparkles, Clock, ArrowDownToLine } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface InvestmentAccount {
  id: string;
  name: string;
  balance: number;
  invested: number;
  returns: number;
  color: string;
  isDefault?: boolean;
  status?: 'pending' | 'approved' | 'rejected';
}

interface InvestmentAccountCardProps {
  account: InvestmentAccount;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
  onFund?: (id: string) => void;
  onWithdraw?: (id: string) => void;
  onClick?: (account: InvestmentAccount) => void;
}

const accentMap: Record<string, string> = {
  blue: 'border-l-[hsl(220,80%,55%)]',
  green: 'border-l-[hsl(var(--success))]',
  purple: 'border-l-[hsl(270,60%,55%)]',
  orange: 'border-l-[hsl(32,95%,50%)]',
  pink: 'border-l-[hsl(340,70%,55%)]',
};

const statusDot: Record<string, string> = {
  pending: 'bg-warning',
  approved: 'bg-success animate-[pulse_3s_ease-in-out_infinite]',
  rejected: 'bg-destructive',
};

const statusLabel: Record<string, string> = {
  pending: 'Pending',
  approved: 'Active',
  rejected: 'Rejected',
};

export function InvestmentAccountCard({ account, onDelete, onEdit, onFund, onWithdraw, onClick }: InvestmentAccountCardProps) {
  const monthlyROI = 15;

  return (
    <div
      onClick={() => onClick?.(account)}
      className={cn('animate-fade-in', onClick && 'cursor-pointer')}
    >
      <Card className={cn(
        'border-l-[3px] border border-border/40 bg-card hover:bg-accent/30 transition-colors duration-200 active:scale-[0.98] transition-transform overflow-hidden',
        accentMap[account.color] || accentMap.purple
      )}>
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-muted/60 flex items-center justify-center shrink-0">
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-[13px] font-bold text-foreground truncate">{account.name}</h3>
                  {account.status && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={cn('h-1.5 w-1.5 rounded-full', statusDot[account.status] || 'bg-muted-foreground/40')} />
                      <span className="text-[9px] font-medium text-muted-foreground capitalize">
                        {statusLabel[account.status] || account.status}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/60 hover:text-foreground">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit?.(account.id)}>
                  <Edit2 className="h-3.5 w-3.5 mr-2" />
                  Edit
                </DropdownMenuItem>
                {!account.isDefault && (
                  <DropdownMenuItem onClick={() => onDelete?.(account.id)} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Balance + ROI */}
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium mb-0.5">Invested</p>
              <p className="text-xl font-black text-foreground font-mono tabular-nums tracking-tight">{formatUGX(account.balance)}</p>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-success/8 border border-success/15">
              <TrendingUp className="h-3 w-3 text-success" />
              <span className="text-xs font-bold text-success">{monthlyROI}%</span>
            </div>
          </div>

          {/* Actions */}
          {account.status === 'approved' ? (
            <div className="flex gap-2">
              <Button
                onClick={(e) => { e.stopPropagation(); onFund?.(account.id); }}
                className="flex-1 h-10 text-sm font-semibold gap-1.5 rounded-lg"
              >
                <Sparkles className="h-4 w-4" />
                Fund
              </Button>
              <Button
                onClick={(e) => { e.stopPropagation(); onWithdraw?.(account.id); }}
                variant="outline"
                className="flex-1 h-10 text-sm font-semibold gap-1.5 rounded-lg border-border/60"
                disabled={account.balance <= 0}
              >
                <ArrowDownToLine className="h-4 w-4" />
                Withdraw
              </Button>
            </div>
          ) : account.status === 'pending' ? (
            <Button disabled variant="outline" className="w-full h-10 text-sm font-semibold rounded-lg">
              <Clock className="h-4 w-4 mr-1.5" />
              Awaiting Approval
            </Button>
          ) : (
            <Button disabled variant="outline" className="w-full h-10 text-sm font-semibold text-destructive rounded-lg">
              Account Rejected
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Wallet, TrendingUp, MoreVertical, Trash2, Edit2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
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
}

interface InvestmentAccountCardProps {
  account: InvestmentAccount;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
  onFund?: (id: string) => void;
}

export function InvestmentAccountCard({ account, onDelete, onEdit, onFund }: InvestmentAccountCardProps) {
  const totalValue = account.balance + account.returns;
  const roi = account.invested > 0 ? ((account.returns / account.invested) * 100) : 0;
  const progressPercent = account.invested > 0 ? Math.min((account.returns / (account.invested * 0.15)) * 100, 100) : 0;

  const colorClasses: Record<string, string> = {
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    green: 'from-green-500/20 to-green-600/10 border-green-500/30',
    purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
    orange: 'from-orange-500/20 to-orange-600/10 border-orange-500/30',
    pink: 'from-pink-500/20 to-pink-600/10 border-pink-500/30',
  };

  const iconColorClasses: Record<string, string> = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    pink: 'from-pink-500 to-pink-600',
  };

  return (
    <Card className={`elevated-card overflow-hidden border bg-gradient-to-br ${colorClasses[account.color] || colorClasses.blue}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl bg-gradient-to-br ${iconColorClasses[account.color] || iconColorClasses.blue} shadow-lg`}>
              <Wallet className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">{account.name}</h3>
                {account.isDefault && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Default</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Investment Account</p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit?.(account.id)}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit Account
              </DropdownMenuItem>
              {!account.isDefault && (
                <DropdownMenuItem onClick={() => onDelete?.(account.id)} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Account
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Balance */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-1">Total Value</p>
          <p className="text-2xl font-bold text-foreground">{formatUGX(totalValue)}</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-background/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Invested</p>
            <p className="font-semibold text-sm">{formatUGX(account.invested)}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-background/50">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-success" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Returns</p>
            </div>
            <p className="font-semibold text-sm text-success">{formatUGX(account.returns)}</p>
          </div>
        </div>

        {/* ROI Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">ROI Progress</span>
            <span className="font-medium text-success">{roi.toFixed(1)}%</span>
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>

        {/* Fund Button */}
        <Button 
          onClick={() => onFund?.(account.id)} 
          className="w-full mt-4"
          size="sm"
        >
          Fund Tenants
        </Button>
      </CardContent>
    </Card>
  );
}

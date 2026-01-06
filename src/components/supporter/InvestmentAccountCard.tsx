import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wallet, TrendingUp, MoreVertical, Trash2, Edit2, Sparkles, ArrowUpRight, Clock, ArrowDownToLine, ChevronRight } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
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

export function InvestmentAccountCard({ account, onDelete, onEdit, onFund, onWithdraw, onClick }: InvestmentAccountCardProps) {
  const totalValue = account.balance + account.returns;
  const roi = account.invested > 0 ? ((account.returns / account.invested) * 100) : 0;
  const progressPercent = account.invested > 0 ? Math.min((account.returns / (account.invested * 0.15)) * 100, 100) : 0;

  const colorSchemes: Record<string, { gradient: string; iconBg: string; glow: string; accent: string }> = {
    blue: { 
      gradient: 'from-blue-600/20 via-cyan-500/10 to-indigo-600/20',
      iconBg: 'from-blue-500 to-cyan-400',
      glow: 'shadow-blue-500/20',
      accent: 'text-blue-400'
    },
    green: { 
      gradient: 'from-emerald-600/20 via-green-500/10 to-teal-600/20',
      iconBg: 'from-emerald-500 to-green-400',
      glow: 'shadow-emerald-500/20',
      accent: 'text-emerald-400'
    },
    purple: { 
      gradient: 'from-purple-600/20 via-violet-500/10 to-fuchsia-600/20',
      iconBg: 'from-purple-500 to-violet-400',
      glow: 'shadow-purple-500/20',
      accent: 'text-purple-400'
    },
    orange: { 
      gradient: 'from-orange-600/20 via-amber-500/10 to-yellow-600/20',
      iconBg: 'from-orange-500 to-amber-400',
      glow: 'shadow-orange-500/20',
      accent: 'text-orange-400'
    },
    pink: { 
      gradient: 'from-pink-600/20 via-rose-500/10 to-red-600/20',
      iconBg: 'from-pink-500 to-rose-400',
      glow: 'shadow-pink-500/20',
      accent: 'text-pink-400'
    },
  };

  const scheme = colorSchemes[account.color] || colorSchemes.purple;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      onClick={() => onClick?.(account)}
      className={onClick ? 'cursor-pointer' : ''}
    >
      <Card className={`relative overflow-hidden border-0 bg-gradient-to-br ${scheme.gradient} backdrop-blur-xl shadow-xl ${scheme.glow} hover:shadow-2xl transition-all duration-500`}>
        {/* Animated background effect */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/40 to-transparent" />
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-2xl" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-gradient-to-tr from-white/5 to-transparent rounded-full blur-xl" />
        
        <CardContent className="relative p-5">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <motion.div 
                className={`p-3 rounded-2xl bg-gradient-to-br ${scheme.iconBg} shadow-lg ${scheme.glow}`}
                whileHover={{ scale: 1.05, rotate: 5 }}
              >
                <Wallet className="h-5 w-5 text-white" />
              </motion.div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-foreground text-lg">{account.name}</h3>
                  {account.isDefault && (
                    <Badge className="text-[10px] px-2 py-0.5 bg-white/10 text-white/90 border-0">
                      <Sparkles className="h-2.5 w-2.5 mr-1" />
                      Default
                    </Badge>
                  )}
                  {account.status === 'pending' && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-warning/20 text-warning border-warning/30">
                      Pending Approval
                    </Badge>
                  )}
                  {account.status === 'approved' && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-success/20 text-success border-success/30">
                      Approved
                    </Badge>
                  )}
                  {account.status === 'rejected' && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-destructive/20 text-destructive border-destructive/30">
                      Rejected
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground/80 font-medium">Investment Portfolio</p>
              </div>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="backdrop-blur-xl bg-background/90">
                <DropdownMenuItem onClick={() => onEdit?.(account.id)}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit Account
                </DropdownMenuItem>
                {!account.isDefault && (
                  <DropdownMenuItem onClick={() => onDelete?.(account.id)} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Account
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Total Value */}
          <div className="mb-5">
            <p className="text-xs text-muted-foreground/80 mb-1 font-medium uppercase tracking-wider">Total Value</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black tracking-tight text-foreground">{formatUGX(totalValue)}</p>
              {roi > 0 && (
                <span className="flex items-center gap-0.5 text-xs font-bold text-success">
                  <ArrowUpRight className="h-3 w-3" />
                  {roi.toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="p-3 rounded-xl bg-white/5 backdrop-blur border border-white/10">
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-semibold mb-1">Invested</p>
              <p className="font-bold text-base text-foreground">{formatUGX(account.invested)}</p>
            </div>
            <div className="p-3 rounded-xl bg-success/10 backdrop-blur border border-success/20">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3 w-3 text-success" />
                <p className="text-[10px] text-success/80 uppercase tracking-wider font-semibold">Returns</p>
              </div>
              <p className="font-bold text-base text-success">{formatUGX(account.returns)}</p>
            </div>
          </div>

          {/* ROI Progress */}
          <div className="space-y-2 mb-5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground/80 font-medium">Monthly ROI Progress</span>
              <span className="font-bold text-success">{progressPercent.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden backdrop-blur">
              <motion.div 
                className="h-full bg-gradient-to-r from-success to-emerald-400 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Action Buttons - only for approved accounts */}
          {account.status === 'approved' ? (
            <div className="flex gap-2">
              <Button 
                onClick={() => onFund?.(account.id)} 
                className="flex-1 h-11 font-semibold text-sm bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Fund
              </Button>
              <Button 
                onClick={() => onWithdraw?.(account.id)} 
                variant="outline"
                className="flex-1 h-11 font-semibold text-sm border-primary/30 hover:bg-primary/10"
                disabled={account.balance <= 0}
              >
                <ArrowDownToLine className="h-4 w-4 mr-2" />
                Withdraw
              </Button>
            </div>
          ) : account.status === 'pending' ? (
            <Button 
              disabled
              variant="outline"
              className="w-full h-11 font-semibold text-sm"
            >
              <Clock className="h-4 w-4 mr-2" />
              Awaiting Approval
            </Button>
          ) : (
            <Button 
              disabled
              variant="outline"
              className="w-full h-11 font-semibold text-sm text-destructive"
            >
              Account Rejected
            </Button>
          )}

          {/* Tap for details indicator */}
          {onClick && (
            <motion.div 
              className="flex items-center justify-center gap-1 mt-3 text-xs text-muted-foreground/60 font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <span>Tap for details</span>
              <ChevronRight className="h-3.5 w-3.5 animate-[pulse_2s_ease-in-out_infinite]" />
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

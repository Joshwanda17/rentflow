import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wallet, TrendingUp, MoreVertical, Trash2, Edit2, Sparkles, Clock, ArrowDownToLine } from 'lucide-react';
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
  const monthlyROI = 15; // Fixed 15% monthly ROI

  const colorSchemes: Record<string, { gradient: string; iconBg: string; glow: string }> = {
    blue: { 
      gradient: 'from-blue-600/20 via-cyan-500/10 to-indigo-600/20',
      iconBg: 'from-blue-500 to-cyan-400',
      glow: 'shadow-blue-500/20'
    },
    green: { 
      gradient: 'from-emerald-600/20 via-green-500/10 to-teal-600/20',
      iconBg: 'from-emerald-500 to-green-400',
      glow: 'shadow-emerald-500/20'
    },
    purple: { 
      gradient: 'from-purple-600/20 via-violet-500/10 to-fuchsia-600/20',
      iconBg: 'from-purple-500 to-violet-400',
      glow: 'shadow-purple-500/20'
    },
    orange: { 
      gradient: 'from-orange-600/20 via-amber-500/10 to-yellow-600/20',
      iconBg: 'from-orange-500 to-amber-400',
      glow: 'shadow-orange-500/20'
    },
    pink: { 
      gradient: 'from-pink-600/20 via-rose-500/10 to-red-600/20',
      iconBg: 'from-pink-500 to-rose-400',
      glow: 'shadow-pink-500/20'
    },
  };

  const scheme = colorSchemes[account.color] || colorSchemes.purple;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      onClick={() => onClick?.(account)}
      className={onClick ? 'cursor-pointer' : ''}
    >
      <Card className={`relative overflow-hidden border-0 bg-gradient-to-br ${scheme.gradient} backdrop-blur-xl shadow-lg ${scheme.glow} hover:shadow-xl transition-all duration-300`}>
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/40 to-transparent" />
        
        <CardContent className="relative p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl bg-gradient-to-br ${scheme.iconBg} shadow-md`}>
                <Wallet className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-foreground">{account.name}</h3>
                  {account.status === 'pending' && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-warning/20 text-warning border-warning/30">
                      Pending
                    </Badge>
                  )}
                  {account.status === 'approved' && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-success/20 text-success border-success/30">
                      Active
                    </Badge>
                  )}
                  {account.status === 'rejected' && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-destructive/20 text-destructive border-destructive/30">
                      Rejected
                    </Badge>
                  )}
                </div>
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
                  Edit
                </DropdownMenuItem>
                {!account.isDefault && (
                  <DropdownMenuItem onClick={() => onDelete?.(account.id)} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Simplified Stats - Only Invested and Monthly ROI */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-xl bg-white/5 backdrop-blur border border-white/10">
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-semibold mb-1">Invested</p>
              <p className="font-bold text-lg text-foreground">{formatUGX(account.balance)}</p>
            </div>
            <div className="p-3 rounded-xl bg-success/10 backdrop-blur border border-success/20">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3 w-3 text-success" />
                <p className="text-[10px] text-success/80 uppercase tracking-wider font-semibold">Monthly ROI</p>
              </div>
              <p className="font-bold text-lg text-success">{monthlyROI}%</p>
            </div>
          </div>

          {/* Action Buttons */}
          {account.status === 'approved' ? (
            <div className="flex gap-2">
              <Button 
                onClick={(e) => { e.stopPropagation(); onFund?.(account.id); }} 
                className="flex-1 h-10 font-semibold text-sm bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-md"
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Fund
              </Button>
              <Button 
                onClick={(e) => { e.stopPropagation(); onWithdraw?.(account.id); }} 
                variant="outline"
                className="flex-1 h-10 font-semibold text-sm border-primary/30 hover:bg-primary/10"
                disabled={account.balance <= 0}
              >
                <ArrowDownToLine className="h-4 w-4 mr-1.5" />
                Withdraw
              </Button>
            </div>
          ) : account.status === 'pending' ? (
            <Button 
              disabled
              variant="outline"
              className="w-full h-10 font-semibold text-sm"
            >
              <Clock className="h-4 w-4 mr-2" />
              Awaiting Approval
            </Button>
          ) : (
            <Button 
              disabled
              variant="outline"
              className="w-full h-10 font-semibold text-sm text-destructive"
            >
              Account Rejected
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

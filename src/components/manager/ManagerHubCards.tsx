import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, 
  Home, 
  Shield,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRight,
  Clock,
  CheckCircle,
  Users,
  Landmark,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  BarChart3,
  HandCoins,
  PiggyBank,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { formatUGX } from '@/lib/rentCalculations';

interface ManagerHubCardsProps {
  pendingWalletOps: number;
  pendingWithdrawals: number;
  withdrawalStats: { pending: number; approved: number; rejected: number; pendingAmount: number; approvedAmount: number; rejectedAmount: number };
  pendingRequests: number;
  totalFacilitated: number;
  totalUsers: number;
  rentDueTotal: number;
  onOpenWallets: () => void;
  onOpenRentInvestments: () => void;
  onOpenBufferAccount: () => void;
}

export function ManagerHubCards({
  pendingWalletOps,
  pendingWithdrawals,
  withdrawalStats,
  pendingRequests,
  totalFacilitated,
  totalUsers,
  rentDueTotal,
  onOpenWallets,
  onOpenRentInvestments,
  onOpenBufferAccount,
}: ManagerHubCardsProps) {
  const navigate = useNavigate();

  const cards = [
    {
      id: 'wallets',
      icon: Wallet,
      title: '💰 Manage Wallets',
      subtitle: 'Cash in/out, balances & approvals',
      gradient: 'from-primary/15 via-primary/8 to-primary/5',
      borderColor: 'border-primary/40',
      iconBg: 'bg-primary',
      textColor: 'text-primary',
      onClick: onOpenWallets,
      stats: [
        { label: 'Pending Approval', value: pendingWalletOps + pendingWithdrawals, color: 'text-warning', urgent: (pendingWalletOps + pendingWithdrawals) > 0 },
        { label: 'Approved Today', value: withdrawalStats.approved, color: 'text-success' },
      ],
      badge: (pendingWalletOps + pendingWithdrawals) > 0 ? pendingWalletOps + pendingWithdrawals : undefined,
    },
    {
      id: 'rent-investments',
      icon: Home,
      title: '🏠 Rent Management',
      subtitle: 'Requests, receivables & fund routing',
      gradient: 'from-emerald-500/15 via-emerald-500/8 to-emerald-500/5',
      borderColor: 'border-emerald-500/40',
      iconBg: 'bg-emerald-600',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      onClick: onOpenRentInvestments,
      stats: [
        { label: 'Pending Requests', value: pendingRequests, color: 'text-warning', urgent: pendingRequests > 0 },
        { label: 'Rent Due', value: rentDueTotal > 0 ? formatUGX(rentDueTotal) : '0', color: 'text-emerald-600' },
      ],
      badge: pendingRequests > 0 ? pendingRequests : undefined,
    },
    {
      id: 'buffer',
      icon: Shield,
      title: '🛡️ Buffer Account',
      subtitle: 'Platform safety & solvency',
      gradient: 'from-amber-500/15 via-amber-500/8 to-amber-500/5',
      borderColor: 'border-amber-500/40',
      iconBg: 'bg-amber-500',
      textColor: 'text-amber-600 dark:text-amber-400',
      onClick: onOpenBufferAccount,
      stats: [
        { label: 'Total Facilitated', value: formatUGX(totalFacilitated), color: 'text-amber-600' },
        { label: 'Active Users', value: totalUsers, color: 'text-muted-foreground' },
      ],
    },
  ];

  return (
    <div className="space-y-3">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, type: 'spring', stiffness: 300, damping: 25 }}
          >
            <Card
              className={cn(
                "relative overflow-hidden cursor-pointer active:scale-[0.98] transition-all duration-200 touch-manipulation border-2 shadow-lg",
                card.borderColor
              )}
              onClick={() => {
                hapticSuccess();
                card.onClick();
              }}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {/* Background gradient */}
              <div className={cn("absolute inset-0 bg-gradient-to-br opacity-100", card.gradient)} />
              
              {/* Decorative circle */}
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/5" />
              
              <CardContent className="relative p-5">
                {/* Header row */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-3.5 rounded-2xl text-white shadow-lg", card.iconBg)}>
                      <Icon className="h-7 w-7" strokeWidth={2} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black leading-tight">{card.title}</h3>
                      <p className="text-xs text-muted-foreground font-medium mt-0.5">{card.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {card.badge && (
                      <Badge variant="destructive" className="animate-pulse text-sm px-2.5 py-0.5 font-bold">
                        {card.badge}
                      </Badge>
                    )}
                    <ArrowRight className={cn("h-5 w-5 opacity-60", card.textColor)} />
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-2">
                  {card.stats.map((stat, si) => (
                    <div 
                      key={si} 
                      className="px-3 py-2.5 rounded-xl bg-background/60 backdrop-blur-sm border border-border/40"
                    >
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{stat.label}</p>
                      <p className={cn("text-base font-black mt-0.5", stat.color)}>
                        {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                      </p>
                      {(stat as any).urgent && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="h-2.5 w-2.5 text-warning" />
                          <span className="text-[9px] text-warning font-semibold">Needs action</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

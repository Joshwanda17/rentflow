import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Wallet,
  ArrowDownToLine,
  Home,
  ArrowRight
} from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { formatUGX } from '@/lib/rentCalculations';

interface MobileQuickActionsProps {
  pendingRequests: number;
  pendingLoans: number;
  pendingOrders: number;
  totalUsers: number;
  pendingWithdrawals?: number;
  rentDueTotal?: number;
  onRentDueClick?: () => void;
}

export function MobileQuickActions({ 
  pendingWithdrawals = 0,
  rentDueTotal = 0,
  onRentDueClick,
}: MobileQuickActionsProps) {
  const navigate = useNavigate();

  const primaryActions = [
    {
      icon: Wallet,
      label: 'Deposits',
      sublabel: 'User payments in',
      path: '/deposits-management',
      iconBg: 'bg-primary',
      cardBg: 'bg-primary/10 hover:bg-primary/15 border-primary/30',
      textColor: 'text-primary',
    },
    {
      icon: ArrowDownToLine,
      label: 'Withdrawals',
      sublabel: 'Pending requests',
      path: '#withdrawals',
      iconBg: 'bg-amber-500',
      cardBg: 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/30',
      textColor: 'text-amber-600 dark:text-amber-400',
      badge: pendingWithdrawals,
    },
    {
      icon: Home,
      label: 'Rent Due',
      sublabel: rentDueTotal > 0 ? formatUGX(rentDueTotal) : 'Repayments receivable',
      path: '#rent-due',
      iconBg: 'bg-emerald-600',
      cardBg: 'bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/30',
      textColor: 'text-emerald-600 dark:text-emerald-400',
    },
  ];

  const handleAction = (path: string) => {
    hapticTap();
    if (path === '#withdrawals') {
      const el = document.getElementById('withdrawal-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (path === '#rent-due') {
      onRentDueClick?.();
    } else {
      navigate(path);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-3">
      {primaryActions.map((action, index) => {
        const Icon = action.icon;
        return (
          <motion.button
            key={action.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.07, type: 'spring', stiffness: 300, damping: 25 }}
            onClick={() => handleAction(action.path)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl border-2 transition-all touch-manipulation active:scale-95 min-h-[120px]",
              action.cardBg
            )}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {action.badge !== undefined && action.badge > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[22px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shadow-sm">
                {action.badge > 99 ? '99+' : action.badge}
              </span>
            )}

            <div className={cn("p-3 rounded-xl text-white shadow-sm", action.iconBg)}>
              <Icon className="h-6 w-6" strokeWidth={2} />
            </div>

            <div className="text-center">
              <p className={cn("text-sm font-bold leading-tight", action.textColor)}>
                {action.label}
              </p>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">
                {action.sublabel}
              </p>
            </div>

            <ArrowRight className={cn("h-3.5 w-3.5 opacity-50", action.textColor)} />
          </motion.button>
        );
      })}
    </div>
  );
}

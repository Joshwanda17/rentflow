import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Users, 
  FileText, 
  Banknote, 
  ShoppingCart, 
  Receipt, 
  Wallet,
  TrendingUp,
  UserPlus,
  ChevronRight,
  Megaphone,
  MessageSquare
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { hapticTap } from '@/lib/haptics';
import BroadcastNotificationDialog from './BroadcastNotificationDialog';
import BroadcastMessageDialog from '@/components/chat/BroadcastMessageDialog';
import { cn } from '@/lib/utils';

interface QuickAction {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  path: string;
  color: string;
  bgColor: string;
  count?: number;
  urgent?: boolean;
}

interface MobileQuickActionsProps {
  pendingRequests: number;
  pendingLoans: number;
  pendingOrders: number;
  totalUsers: number;
}

export function MobileQuickActions({ 
  pendingRequests, 
  pendingLoans, 
  pendingOrders, 
  totalUsers 
}: MobileQuickActionsProps) {
  const navigate = useNavigate();

  const quickActions: QuickAction[] = [
    {
      icon: Users,
      label: 'Users',
      sublabel: 'View all',
      path: '/manager-access?tab=users',
      color: 'text-primary',
      bgColor: 'bg-primary/15 hover:bg-primary/25',
      count: totalUsers
    },
    {
      icon: FileText,
      label: 'Rent',
      sublabel: 'Requests',
      path: '/manager-access',
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-500/15 hover:bg-amber-500/25',
      count: pendingRequests,
      urgent: pendingRequests > 0
    },
    {
      icon: Banknote,
      label: 'Loans',
      sublabel: 'Pending',
      path: '/manager-access?tab=loans',
      color: 'text-success',
      bgColor: 'bg-success/15 hover:bg-success/25',
      count: pendingLoans,
      urgent: pendingLoans > 0
    },
    {
      icon: ShoppingCart,
      label: 'Orders',
      sublabel: 'Pending',
      path: '/manager-access?tab=orders',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-500/15 hover:bg-blue-500/25',
      count: pendingOrders,
      urgent: pendingOrders > 0
    },
    {
      icon: Receipt,
      label: 'Receipts',
      sublabel: 'User submissions',
      path: '/manager-access?tab=receipts',
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-500/15 hover:bg-purple-500/25'
    },
    {
      icon: Wallet,
      label: 'Invest',
      sublabel: 'Accounts',
      path: '/manager-access?tab=investments',
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-500/15 hover:bg-emerald-500/25'
    },
  ];

  const handleAction = (path: string) => {
    hapticTap();
    navigate(path);
  };

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardContent className="p-0">
        <div className="grid grid-cols-3 gap-2">
          {quickActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <motion.button
                key={action.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => handleAction(action.path)}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 p-4 rounded-2xl border-2 border-border/50 transition-all touch-manipulation active:scale-95",
                  action.bgColor
                )}
              >
                {/* Urgent indicator */}
                {action.urgent && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full animate-pulse"
                  />
                )}
                
                {/* Large icon */}
                <div className="relative">
                  <Icon className={cn("h-8 w-8", action.color)} strokeWidth={1.5} />
                  {action.count !== undefined && action.count > 0 && (
                    <Badge 
                      className={cn(
                        "absolute -top-2 -right-3 h-5 min-w-[20px] px-1 text-[10px] font-bold",
                        action.urgent ? "bg-destructive" : "bg-primary"
                      )}
                    >
                      {action.count > 99 ? '99+' : action.count}
                    </Badge>
                  )}
                </div>
                
                {/* Label - Large and clear */}
                <span className={cn("text-sm font-bold leading-tight", action.color)}>
                  {action.label}
                </span>
                
                {/* Sublabel */}
                <span className="text-[10px] text-muted-foreground font-medium">
                  {action.sublabel}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Broadcast & Add User Buttons */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {/* Broadcast Notification Button */}
          <BroadcastNotificationDialog 
            trigger={
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                onClick={() => hapticTap()}
                className="w-full flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-gradient-to-r from-orange-500/20 via-orange-500/15 to-orange-500/10 border-2 border-orange-500/30 touch-manipulation active:scale-[0.98]"
              >
                <div className="p-2 rounded-xl bg-orange-500 text-white">
                  <Megaphone className="h-5 w-5" />
                </div>
                <p className="text-xs font-bold text-orange-600 dark:text-orange-400">Notify All</p>
              </motion.button>
            }
          />

          {/* Broadcast Message Button */}
          <BroadcastMessageDialog 
            trigger={
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32 }}
                onClick={() => hapticTap()}
                className="w-full flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-gradient-to-r from-blue-500/20 via-blue-500/15 to-blue-500/10 border-2 border-blue-500/30 touch-manipulation active:scale-[0.98]"
              >
                <div className="p-2 rounded-xl bg-blue-500 text-white">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400">Message All</p>
              </motion.button>
            }
          />

          {/* Add User Button */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            onClick={() => {
              hapticTap();
              navigate('/manager-access?tab=users&action=add');
            }}
            className="w-full flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-gradient-to-r from-primary/20 via-primary/15 to-primary/10 border-2 border-primary/30 touch-manipulation active:scale-[0.98]"
          >
            <div className="p-2 rounded-xl bg-primary text-primary-foreground">
              <UserPlus className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold text-primary">Add User</p>
          </motion.button>
        </div>
      </CardContent>
    </Card>
  );
}
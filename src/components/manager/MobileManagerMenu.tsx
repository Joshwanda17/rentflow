import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Menu, 
  X, 
  Users, 
  FileText, 
  Banknote, 
  ShoppingCart, 
  Receipt, 
  ChartBar, 
  Wallet, 
  Award,
  Download,
  CreditCard,
  ClipboardList,
  Calendar,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap, hapticSuccess } from '@/lib/haptics';

interface MobileManagerMenuProps {
  onScrollToProductivity?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const menuItems = [
  { 
    icon: Calendar, 
    label: 'Schedules', 
    path: '/users',
    color: 'bg-primary',
    description: 'Repayment schedules'
  },
  { 
    icon: Users, 
    label: 'Users', 
    path: '/users',
    color: 'bg-blue-500',
    description: 'Manage all users'
  },
  { 
    icon: FileText, 
    label: 'Rent', 
    path: '/manager-access',
    color: 'bg-green-500',
    description: 'Rent requests'
  },
  { 
    icon: Banknote, 
    label: 'Loans', 
    path: '/manager-access?tab=loans',
    color: 'bg-orange-500',
    description: 'Loan applications'
  },
  { 
    icon: ShoppingCart, 
    label: 'Orders', 
    path: '/manager-access?tab=orders',
    color: 'bg-purple-500',
    description: 'Product orders'
  },
  { 
    icon: CreditCard, 
    label: 'Payments', 
    path: '/manager-access?tab=payments',
    color: 'bg-pink-500',
    description: 'Payment confirmations'
  },
  { 
    icon: Receipt, 
    label: 'Receipts', 
    path: '/manager-access?tab=receipts',
    color: 'bg-teal-500',
    description: 'User receipts'
  },
  { 
    icon: ChartBar, 
    label: 'Finance', 
    path: '/manager-access?tab=financials',
    color: 'bg-emerald-500',
    description: 'Financial overview'
  },
  { 
    icon: Wallet, 
    label: 'Ledger', 
    path: '/manager-access?tab=ledger',
    color: 'bg-indigo-500',
    description: 'General ledger'
  },
  { 
    icon: ClipboardList, 
    label: 'Audit', 
    path: '/audit-log',
    color: 'bg-slate-600',
    description: 'System audit log'
  },
  { 
    icon: BarChart3, 
    label: 'COO', 
    path: '/coo-dashboard',
    color: 'bg-rose-600',
    description: 'COO Dashboard'
  },
  { 
    icon: ChartBar, 
    label: 'CFO', 
    path: '/cfo-dashboard',
    color: 'bg-cyan-600',
    description: 'CFO Dashboard'
  },
  { icon: Award, label: 'CEO', path: '/executive-hub?tab=ceo', color: 'bg-amber-600', description: 'CEO Dashboard' },
  { icon: CreditCard, label: 'CTO', path: '/executive-hub?tab=cto', color: 'bg-violet-600', description: 'CTO Dashboard' },
  { icon: Receipt, label: 'CMO', path: '/executive-hub?tab=cmo', color: 'bg-lime-600', description: 'CMO Dashboard' },
  { icon: Users, label: 'Agent Ops', path: '/executive-hub?tab=agent-ops', color: 'bg-sky-600', description: 'Agent Operations' },
  { icon: Banknote, label: 'Tenant Ops', path: '/executive-hub?tab=tenant-ops', color: 'bg-fuchsia-600', description: 'Tenant Operations' },
  { icon: Wallet, label: 'Landlord Ops', path: '/executive-hub?tab=landlord-ops', color: 'bg-stone-600', description: 'Landlord Operations' },
  { icon: ShoppingCart, label: 'Partners', path: '/executive-hub?tab=partners-ops', color: 'bg-yellow-600', description: 'Partners Operations' },
  { icon: ClipboardList, label: 'CRM', path: '/executive-hub?tab=crm', color: 'bg-red-600', description: 'CRM Dashboard' },
];

export default function MobileManagerMenu({ onScrollToProductivity, isOpen: externalOpen, onClose }: MobileManagerMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const navigate = useNavigate();

  const isControlled = externalOpen !== undefined;
  const isOpen = isControlled ? externalOpen : internalOpen;

  const handleOpen = () => {
    hapticTap();
    if (isControlled) { /* controlled externally */ } else setInternalOpen(true);
  };

  const handleClose = () => {
    hapticTap();
    if (isControlled && onClose) onClose();
    else setInternalOpen(false);
  };

  const handleItemClick = (path: string) => {
    hapticSuccess();
    handleClose();
    navigate(path);
  };

  const handleProductivity = () => {
    hapticSuccess();
    handleClose();
    onScrollToProductivity?.();
  };

  return (
    <>
      {/* Floating Menu Button - only shown when not controlled externally */}
      {!isControlled && (
        <motion.button
          drag
          dragMomentum={false}
          dragElastic={0.1}
          whileDrag={{ scale: 1.1 }}
          onClick={isOpen ? handleClose : handleOpen}
          className={cn(
            "fixed bottom-28 right-4 z-[60] p-5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-colors touch-manipulation ring-2 ring-background cursor-grab active:cursor-grabbing",
            isOpen 
              ? "bg-destructive text-destructive-foreground" 
              : "bg-primary text-primary-foreground"
          )}
          whileTap={{ scale: 0.9 }}
          animate={{ rotate: isOpen ? 90 : 0 }}
        >
          {isOpen ? (
            <X className="h-7 w-7" />
          ) : (
            <Menu className="h-7 w-7" />
          )}
        </motion.button>
      )}

      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55]"
          />
        )}
      </AnimatePresence>

      {/* Menu Panel - Larger items for easy tapping */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-40 left-3 right-3 z-[60] bg-card rounded-3xl shadow-2xl border-2 border-border overflow-hidden max-w-md mx-auto"
          >
            {/* Header */}
            <div className="p-4 bg-primary/10 border-b border-border">
              <h3 className="font-bold text-xl text-center">⚡ Quick Actions</h3>
              <p className="text-sm text-muted-foreground text-center mt-1">
                Tap any icon to go
              </p>
            </div>

            {/* Grid of Actions - Extra large icons for easy tapping */}
            <div className="p-4 grid grid-cols-4 gap-3">
              {menuItems.map((item, index) => (
                <motion.button
                  key={item.path}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => handleItemClick(item.path)}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-muted/50 hover:bg-muted active:scale-90 transition-all touch-manipulation min-h-[100px]"
                >
                  <div className={cn("p-4 rounded-2xl shadow-lg", item.color)}>
                    <item.icon className="h-7 w-7 text-white" />
                  </div>
                  <span className="text-sm font-bold text-center leading-tight">
                    {item.label}
                  </span>
                </motion.button>
              ))}
            </div>

            {/* Bottom Actions - Extra large buttons */}
            <div className="p-4 border-t border-border bg-muted/30 flex gap-3">
              <button
                onClick={handleProductivity}
                className="flex-1 flex items-center justify-center gap-3 p-5 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold active:scale-95 transition-all touch-manipulation"
              >
                <Award className="h-7 w-7" />
                <span className="text-lg">📊 Stats</span>
              </button>
              <button
                onClick={() => handleItemClick('/install')}
                className="flex-1 flex items-center justify-center gap-3 p-5 rounded-2xl bg-primary/20 text-primary font-bold active:scale-95 transition-all touch-manipulation"
              >
                <Download className="h-7 w-7" />
                <span className="text-lg">📤 Share</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

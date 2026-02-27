import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  CreditCard,
  TrendingUp,
  History,
  Receipt,
  Share2,
  Download,
  Calculator,
  Settings,
  HelpCircle,
  ScrollText,
  Store,
  Wallet,
  FileText,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { Separator } from '@/components/ui/separator';

interface SupporterMenuDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddInvestment: () => void;
  onOpenCalculator: () => void;
  onViewAgreement: () => void;
}

interface MenuItem {
  icon: typeof X;
  label: string;
  description?: string;
  path?: string;
  onClick?: () => void;
  badge?: string;
  color?: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

export function SupporterMenuDrawer({ 
  open, 
  onOpenChange, 
  onAddInvestment,
  onOpenCalculator,
  onViewAgreement,
}: SupporterMenuDrawerProps) {
  const navigate = useNavigate();

  const handleClose = () => {
    hapticTap();
    onOpenChange(false);
  };

  const handleItemClick = (item: MenuItem) => {
    hapticSuccess();
    onOpenChange(false);
    if (item.onClick) {
      item.onClick();
    } else if (item.path) {
      navigate(item.path);
    }
  };

  const menuSections: MenuSection[] = [
    {
      title: 'Investments',
      items: [
        { 
          icon: CreditCard, 
          label: 'Add Investment', 
          description: 'Fund via Mobile Money',
          onClick: onAddInvestment,
          color: 'text-primary'
        },
        { 
          icon: TrendingUp, 
          label: 'ROI Analytics', 
          description: 'Earnings & projections',
          path: '/supporter-earnings',
          color: 'text-success'
        },
        { 
          icon: Calculator, 
          label: 'ROI Calculator', 
          description: 'Project your returns',
          onClick: onOpenCalculator,
          color: 'text-indigo-500'
        },
      ]
    },
    {
      title: 'Financial Activity',
      items: [
        { 
          icon: Wallet, 
          label: 'My Wallet', 
          description: 'Balance & transactions',
          path: '/transactions',
          color: 'text-success'
        },
        { 
          icon: History, 
          label: 'Transaction History', 
          description: 'All payment activity',
          path: '/transactions',
          color: 'text-blue-500'
        },
        { 
          icon: FileText, 
          label: 'Financial Statement', 
          description: 'Download your statement',
          path: '/financial-statement',
          color: 'text-indigo-500'
        },
        { 
          icon: Receipt, 
          label: 'My Receipts', 
          description: 'Payment records',
          path: '/my-receipts',
          color: 'text-teal-500'
        },
      ]
    },
    {
      title: 'Community',
      items: [
        { 
          icon: Share2, 
          label: 'Referrals', 
          description: 'Invite & earn rewards',
          path: '/referrals',
          color: 'text-purple-500'
        },
        { 
          icon: Store, 
          label: 'Marketplace', 
          description: 'Shop products',
          path: '/marketplace',
          color: 'text-orange-500'
        },
        { 
          icon: Download, 
          label: 'Share App', 
          description: 'Invite friends to Welile',
          path: '/install',
          color: 'text-primary'
        },
      ]
    },
    {
      title: 'More',
      items: [
        { 
          icon: ScrollText, 
          label: 'Supporter Agreement', 
          description: 'Terms & conditions',
          onClick: onViewAgreement,
          color: 'text-muted-foreground'
        },
        { 
          icon: Settings, 
          label: 'Settings', 
          description: 'Account preferences',
          path: '/settings',
          color: 'text-muted-foreground'
        },
        { 
          icon: HelpCircle, 
          label: 'Help & Support', 
          description: 'Get assistance',
          path: '/settings',
          color: 'text-muted-foreground'
        },
      ]
    },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-[85%] max-w-sm bg-background z-[101] shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-card">
              <div>
                <h2 className="font-bold text-lg">Menu</h2>
                <p className="text-xs text-muted-foreground">All supporter features</p>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div className="p-4 space-y-6">
                {menuSections.map((section, sectionIndex) => (
                  <div key={section.title}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
                      {section.title}
                    </h3>
                    <div className="space-y-1">
                      {section.items.map((item, itemIndex) => (
                        <motion.button
                          key={item.label}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: (sectionIndex * 0.05) + (itemIndex * 0.02) }}
                          onClick={() => handleItemClick(item)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 active:scale-[0.98] transition-all text-left"
                        >
                          <div className={cn(
                            "p-2 rounded-lg bg-muted/80",
                            item.color
                          )}>
                            <item.icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm truncate">{item.label}</p>
                              {item.badge && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-success/20 text-success rounded-full">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </motion.button>
                      ))}
                    </div>
                    {sectionIndex < menuSections.length - 1 && (
                      <Separator className="mt-4" />
                    )}
                  </div>
                ))}
              </div>

              {/* Footer Padding */}
              <div className="h-8" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

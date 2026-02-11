import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Menu, 
  X, 
  UserPlus, 
  ArrowDownCircle,
  TrendingUp,
  Store,
  History,
  Receipt,
  Banknote,
  Users,
  Share2,
  Download,
  Trophy,
  Target,
  FileText,
  Handshake,
  ChevronRight,
  Calculator,
  Home,
  Settings,
  HelpCircle,
  ScrollText,
  BarChart3,
  PiggyBank,
  ShoppingBag,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { Separator } from '@/components/ui/separator';

interface AgentMenuDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegisterUser: () => void;
  onDeposit: () => void;
  onPostRentRequest: () => void;
  onInviteSubAgent: () => void;
  onOpenEarningsRank: () => void;
  onManageProperty?: () => void;
  onViewManagedProperties?: () => void;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

interface MenuItem {
  icon: typeof Menu;
  label: string;
  description?: string;
  path?: string;
  onClick?: () => void;
  badge?: string;
  color?: string;
}

export function AgentMenuDrawer({ 
  open, 
  onOpenChange, 
  onRegisterUser,
  onDeposit,
  onPostRentRequest,
  onInviteSubAgent,
  onOpenEarningsRank,
  onManageProperty,
  onViewManagedProperties,
}: AgentMenuDrawerProps) {
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
      title: 'Agent Actions',
      items: [
        { 
          icon: UserPlus, 
          label: 'Register New User', 
          description: 'Onboard tenants, landlords & more',
          onClick: onRegisterUser,
          color: 'text-primary'
        },
        { 
          icon: ArrowDownCircle, 
          label: 'Deposit for User', 
          description: 'Add funds to user wallet',
          onClick: onDeposit,
          color: 'text-success'
        },
        { 
          icon: FileText, 
          label: 'Post Rent Request', 
          description: 'On behalf of tenant',
          onClick: onPostRentRequest,
          color: 'text-blue-500'
        },
        { 
          icon: Handshake, 
          label: 'Register Sub-Agent', 
          description: 'Grow your team',
          onClick: onInviteSubAgent,
          color: 'text-amber-500'
        },
        ...(onManageProperty ? [{ 
          icon: Building2, 
          label: 'Manage Property for Landlord', 
          description: 'For landlords without smartphones',
          onClick: onManageProperty,
          color: 'text-orange-500',
          badge: '2% fee'
        }] : []),
        ...(onViewManagedProperties ? [{ 
          icon: Home, 
          label: 'My Managed Properties', 
          description: 'Properties you manage & payouts',
          onClick: onViewManagedProperties,
          color: 'text-teal-500'
        }] : []),
      ]
    },
    {
      title: 'Earnings & Growth',
      items: [
        { 
          icon: Trophy, 
          label: 'Earnings & Rank System', 
          description: 'See how you earn & level up',
          onClick: onOpenEarningsRank,
          color: 'text-amber-500'
        },
        { 
          icon: TrendingUp, 
          label: 'My Earnings', 
          description: 'View detailed earnings',
          path: '/earnings',
          color: 'text-success'
        },
        { 
          icon: Target, 
          label: 'Goals & Progress', 
          description: 'Track your targets',
          path: '/agent-analytics',
          color: 'text-primary'
        },
        { 
          icon: Users, 
          label: 'My Referrals', 
          description: 'Users you brought in',
          path: '/referrals',
          color: 'text-purple-500'
        },
        { 
          icon: Share2, 
          label: 'Share & Earn', 
          description: 'Invite others for rewards',
          path: '/benefits',
          color: 'text-pink-500'
        },
      ]
    },
    {
      title: 'Business Tools',
      items: [
        { 
          icon: Store, 
          label: 'Welile Shop', 
          description: 'Buy, sell & earn loan access',
          path: '/shop',
          color: 'text-orange-500',
          badge: 'Loans up to 30M'
        },
        { 
          icon: Receipt, 
          label: 'My Receipts', 
          description: 'Scan receipts to earn',
          path: '/my-receipts',
          color: 'text-teal-500'
        },
        { 
          icon: Banknote, 
          label: 'My Loans', 
          description: 'View & manage loans',
          path: '/my-loans',
          color: 'text-green-500'
        },
        { 
          icon: History, 
          label: 'Transactions', 
          description: 'Payment history',
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
          icon: Calculator, 
          label: 'Calculator', 
          description: 'Rent & interest calculator',
          path: '/calculator',
          color: 'text-indigo-500'
        },
      ]
    },
    {
      title: 'Management',
      items: [
        { 
          icon: BarChart3, 
          label: 'Agent Analytics', 
          description: 'Performance metrics',
          path: '/agent-analytics',
          color: 'text-purple-500'
        },
        { 
          icon: Users, 
          label: 'My Sub-Agents', 
          description: 'Manage your team',
          path: '/sub-agents',
          color: 'text-blue-500'
        },
        { 
          icon: PiggyBank, 
          label: 'My Withdrawals', 
          description: 'Commission payouts & wallet withdrawals',
          path: '/earnings',
          color: 'text-success'
        },
      ]
    },
    {
      title: 'More',
      items: [
        { 
          icon: Download, 
          label: 'Share App', 
          description: 'Invite friends to Welile',
          path: '/install',
          color: 'text-primary'
        },
        { 
          icon: ScrollText, 
          label: 'Agent Agreement', 
          description: 'Terms & conditions',
          path: '/agent-agreement',
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
          path: '/help',
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
                <p className="text-xs text-muted-foreground">All agent features</p>
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

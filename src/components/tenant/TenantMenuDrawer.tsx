import { useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Home,
  CreditCard,
  Calendar,
  Receipt,
  Banknote,
  ShoppingBag,
  History,
  Users,
  Share2,
  Download,
  Settings,
  HelpCircle,
  Calculator,
  ChevronRight,
  ScrollText,
  PiggyBank,
  FileText,
  Search,
  Wallet,
  ArrowUpRight,
} from 'lucide-react';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { formatUGX } from '@/lib/rentCalculations';

interface TenantMenuDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPayLandlord: () => void;
  onPayWelile: () => void;
  onRepaymentSchedule: () => void;
  onRentCalculator: () => void;
  onBrowseHouses?: () => void;
  extraContent?: ReactNode;
  walletBalance?: number;
  onOpenWallet?: () => void;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

interface MenuItem {
  icon: typeof Home;
  label: string;
  description?: string;
  path?: string;
  onClick?: () => void;
  badge?: string;
  color?: string;
}

export function TenantMenuDrawer({ 
  open, 
  onOpenChange, 
  onPayLandlord,
  onPayWelile,
  onRepaymentSchedule,
  onRentCalculator,
  onBrowseHouses,
  extraContent,
  walletBalance = 0,
  onOpenWallet,
}: TenantMenuDrawerProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const handleClose = () => {
    hapticTap();
    setQuery('');
    onOpenChange(false);
  };

  const handleItemClick = (item: MenuItem) => {
    hapticSuccess();
    setQuery('');
    onOpenChange(false);
    if (item.onClick) {
      item.onClick();
    } else if (item.path) {
      navigate(item.path);
    }
  };

  const menuSections: MenuSection[] = [
    {
      title: 'Money',
      items: [
        { 
          icon: Calendar, 
          label: 'My Repayment Schedule', 
          description: 'Daily plan, progress & share as PDF',
          onClick: onRepaymentSchedule,
          color: 'text-primary',
          badge: 'PDF & WhatsApp'
        },
        { 
          icon: Home, 
          label: 'Pay Rent to Landlord', 
          description: 'Direct landlord payment',
          onClick: onPayLandlord,
          color: 'text-success'
        },
        { 
          icon: CreditCard, 
          label: 'Pay Welile', 
          description: 'Via Mobile Money',
          onClick: onPayWelile,
          color: 'text-amber-500'
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
          label: 'Transaction History', 
          description: 'All past transactions',
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
          description: 'Earn rewards & rent discounts',
          path: '/my-receipts',
          color: 'text-teal-500',
        },
      ]
    },
    {
      title: 'Home',
      items: [
        ...(onBrowseHouses ? [{ 
          icon: Search, 
          label: 'Available Houses — Daily Rent', 
          description: 'Browse affordable houses, pay daily',
          onClick: onBrowseHouses,
          color: 'text-success',
          badge: 'New'
        } as MenuItem] : []),
        { 
          icon: PiggyBank, 
          label: 'Welile Homes', 
          description: 'Turn rent into a future home',
          path: '/welile-homes',
          color: 'text-emerald-500'
        },
        { 
          icon: Calculator, 
          label: 'Rent Calculator', 
          description: 'Estimate your daily plan',
          onClick: onRentCalculator,
          color: 'text-indigo-500'
        },
        { 
          icon: ShoppingBag, 
          label: 'Marketplace', 
          description: 'Shop daily essentials',
          path: '/marketplace',
          color: 'text-orange-500',
        },
      ]
    },
    {
      title: 'Profile',
      items: [
        { 
          icon: Users, 
          label: 'My Referrals', 
          description: 'People you have invited',
          path: '/referrals',
          color: 'text-purple-500'
        },
        { 
          icon: Share2, 
          label: 'Share & Earn', 
          description: 'Invite friends for rewards',
          path: '/benefits',
          color: 'text-pink-500'
        },
        { 
          icon: ScrollText, 
          label: 'Tenant Agreement', 
          description: 'Terms & conditions',
          path: '/tenant-agreement',
          color: 'text-muted-foreground'
        },
        { 
          icon: Settings, 
          label: 'Settings', 
          description: 'Account preferences',
          path: '/settings',
          color: 'text-muted-foreground'
        },
      ]
    },
    {
      title: 'Support',
      items: [
        { 
          icon: Download, 
          label: 'Share App', 
          description: 'Invite friends to Welile',
          path: '/install',
          color: 'text-primary'
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

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return menuSections;
    return menuSections
      .map((s) => ({
        ...s,
        items: s.items.filter(
          (i) =>
            i.label.toLowerCase().includes(q) ||
            (i.description?.toLowerCase().includes(q) ?? false),
        ),
      }))
      .filter((s) => s.items.length > 0);
  }, [query, menuSections]);

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
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed right-0 top-0 bottom-0 w-[86%] max-w-sm bg-background z-[101] shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="border-b border-border/60 bg-background/80 backdrop-blur">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <h2 className="font-bold text-[17px] tracking-tight leading-tight">Menu</h2>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">Everything in one place</p>
                </div>
                <button
                  onClick={handleClose}
                  aria-label="Close menu"
                  className="h-9 w-9 rounded-full bg-muted/70 hover:bg-muted active:scale-95 transition-all flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-3 pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    inputMode="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search menu…"
                    className="w-full h-10 pl-9 pr-9 rounded-xl bg-muted/60 border border-border/50 text-[13px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background transition-all"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Scrollable Content — WhatsApp-style settings list */}
            <div className="flex-1 overflow-y-auto overscroll-contain bg-background">
              {/* Wallet hero (profile-row equivalent) */}
              {onOpenWallet && (
                <button
                  onClick={() => { hapticSuccess(); onOpenWallet(); }}
                  className="w-full flex items-center gap-3 px-4 py-4 border-b border-border/60 hover:bg-muted/40 active:bg-muted/60 transition-colors text-left"
                >
                  <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm">
                    <Wallet className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[15px] text-foreground leading-tight truncate">My Wallet</p>
                    <p className="text-[12px] text-muted-foreground leading-tight mt-0.5 truncate">{formatUGX(walletBalance)} available</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground/60 shrink-0" />
                </button>
              )}

              {extraContent && (
                <div className="px-4 py-3 border-b border-border/60 space-y-3">
                  {extraContent}
                </div>
              )}

              {filteredSections.length === 0 ? (
                <div className="text-center py-12 text-[13px] text-muted-foreground">
                  No results for “{query}”.
                </div>
              ) : (
                filteredSections.map((section) => (
                  <section key={section.title} className="py-1">
                    <h3 className="text-[12px] font-semibold text-primary px-4 pt-3 pb-1.5 tracking-tight">
                      {section.title}
                    </h3>
                    <div>
                      {section.items.map((item, itemIndex) => (
                        <button
                          key={item.label}
                          onClick={() => handleItemClick(item)}
                          className="w-full flex items-center gap-3.5 px-4 py-2.5 hover:bg-muted/40 active:bg-muted/60 transition-colors text-left"
                        >
                          <div className={cn(
                            "h-9 w-9 rounded-full flex items-center justify-center shrink-0",
                            "bg-muted/60",
                          )}>
                            <item.icon className={cn("h-[18px] w-[18px]", item.color || "text-foreground/70")} />
                          </div>
                          <div className="flex-1 min-w-0 border-b border-border/40 py-1.5"
                               style={itemIndex === section.items.length - 1 ? { borderBottom: 'none' } : undefined}>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-[15px] text-foreground truncate leading-tight">{item.label}</p>
                              {item.badge && (
                                <span className="px-1.5 py-px text-[9px] font-bold bg-primary/10 text-primary rounded-full uppercase tracking-wide whitespace-nowrap">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-[12px] text-muted-foreground truncate leading-tight mt-0.5">{item.description}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))
              )}

              <p className="text-center text-[11px] text-muted-foreground/60 pt-6 pb-6 font-medium tracking-wide">
                Welile · Tenant
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

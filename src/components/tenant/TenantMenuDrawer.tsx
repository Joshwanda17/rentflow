import { useNavigate, useLocation } from 'react-router-dom';
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
import { hapticTap, hapticSuccess, hapticImpact, hapticSelection } from '@/lib/haptics';
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
  const location = useLocation();
  const [query, setQuery] = useState('');

  const handleClose = () => {
    hapticTap();
    setQuery('');
    onOpenChange(false);
  };

  const handleItemClick = (item: MenuItem) => {
    hapticImpact();
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
            role="dialog"
            aria-modal="true"
            aria-label="Tenant menu"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed right-0 top-0 bottom-0 w-[86%] max-w-sm bg-background z-[101] shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header (title only) */}
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
            </div>

            {/* Scrollable Content — WhatsApp-style settings list */}
            <div className="flex-1 overflow-y-auto overscroll-contain bg-background">
              {/* Sticky WhatsApp-style search */}
              <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/50 px-3 py-2.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    inputMode="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search menu…"
                    className="w-full h-10 pl-9 pr-9 rounded-full bg-muted/70 border border-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background focus:border-border transition-all"
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

              {/* Wallet hero (profile-row equivalent) */}
              {onOpenWallet && (
                <button
                  type="button"
                  onPointerDown={() => hapticImpact()}
                  onClick={() => { hapticSuccess(); onOpenWallet(); }}
                  aria-label={`Open wallet. Available balance ${formatUGX(walletBalance)}`}
                  className="w-full min-h-[64px] flex items-center gap-3 px-4 py-4 border-b border-border/60 hover:bg-muted/40 active:bg-primary/10 active:scale-[0.985] transition-all duration-100 text-left touch-manipulation select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset"
                >
                  <div aria-hidden="true" className="h-12 w-12 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm">
                    <Wallet className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[15px] text-foreground leading-tight truncate">My Wallet</p>
                    <p className="text-[12px] text-muted-foreground leading-tight mt-0.5 truncate">{formatUGX(walletBalance)} available</p>
                  </div>
                  <ChevronRight aria-hidden="true" className="h-5 w-5 text-muted-foreground/60 shrink-0" />
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
                <nav aria-label="Tenant menu navigation">
                {filteredSections.map((section) => {
                  const sectionId = `tenant-menu-section-${section.title.toLowerCase().replace(/\s+/g, '-')}`;
                  return (
                  <section key={section.title} className="py-1" aria-labelledby={sectionId}>
                    <h3 id={sectionId} className="text-[12px] font-semibold text-primary px-4 pt-3 pb-1.5 tracking-tight">
                      {section.title}
                    </h3>
                    <ul role="list" className="m-0 p-0 list-none">
                      {section.items.map((item, itemIndex) => {
                        const isActive = !!item.path && (location.pathname === item.path || location.pathname.startsWith(item.path + '/'));
                        const ariaLabel = [
                          item.label,
                          item.description,
                          isActive ? '(current page)' : null,
                          item.badge && !isActive ? `(${item.badge})` : null,
                        ].filter(Boolean).join('. ');
                        return (
                          <li key={item.label}>
                            <button
                              type="button"
                              onPointerDown={() => hapticSelection()}
                              onClick={() => handleItemClick(item)}
                              aria-current={isActive ? 'page' : undefined}
                              aria-label={ariaLabel}
                              className={cn(
                                "relative w-full min-h-[56px] flex items-center gap-3.5 px-4 py-3 transition-all duration-100 text-left touch-manipulation select-none active:scale-[0.985]",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset",
                                isActive
                                  ? "bg-primary/10 hover:bg-primary/15 active:bg-primary/20"
                                  : "hover:bg-muted/40 active:bg-muted/80",
                              )}
                            >
                              {isActive && (
                                <span aria-hidden="true" className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary" />
                              )}
                              <div aria-hidden="true" className={cn(
                                "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                                isActive ? "bg-primary/15 ring-1 ring-primary/30" : "bg-muted/60",
                              )}>
                                <item.icon className={cn("h-[19px] w-[19px]", isActive ? "text-primary" : (item.color || "text-foreground/70"))} />
                              </div>
                              <div className="flex-1 min-w-0 border-b border-border/40 py-1.5"
                                   style={itemIndex === section.items.length - 1 ? { borderBottom: 'none' } : undefined}>
                                <div className="flex items-center gap-1.5">
                                  <p className={cn(
                                    "text-[15px] truncate leading-tight",
                                    isActive ? "font-semibold text-primary" : "font-medium text-foreground",
                                  )}>{item.label}</p>
                                  {isActive && (
                                    <span className="px-1.5 py-px text-[9px] font-bold bg-primary text-primary-foreground rounded-full uppercase tracking-wide whitespace-nowrap">
                                      Current
                                    </span>
                                  )}
                                  {!isActive && item.badge && (
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
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                  );
                })}
                </nav>
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

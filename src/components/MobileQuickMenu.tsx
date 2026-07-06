import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useDrawerTransition } from '@/hooks/useDrawerTransition';
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
  Home,
  Calculator,
  UserPlus,
  Building,
  PiggyBank,
  Gift,
  History,
  Settings,
  Store,
  Heart,
  MapPin
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { AppRole } from '@/hooks/useAuth';
import { roleToSlug } from '@/lib/roleRoutes';

interface MobileQuickMenuProps {
  currentRole: AppRole;
  onScrollToProductivity?: () => void;
}

interface MenuItem {
  icon: typeof Menu;
  label: string;
  path: string;
  color: string;
  description: string;
}

// Role-specific menu configurations
const defaultMenu: MenuItem[] = [
  { icon: Home, label: 'Home', path: '/dashboard/tenant', color: 'bg-blue-500', description: 'Dashboard' },
  { icon: Settings, label: 'Settings', path: '/settings', color: 'bg-slate-500', description: 'Account settings' },
];

const menuConfigs: Partial<Record<AppRole, MenuItem[]>> = {
  manager: [
    { icon: Users, label: 'Users', path: '/users', color: 'bg-blue-500', description: 'Manage all users' },
    { icon: FileText, label: 'Rent', path: '/manager-access', color: 'bg-green-500', description: 'Rent requests' },
    { icon: Banknote, label: 'Rent Plans', path: '/manager-access?tab=loans', color: 'bg-orange-500', description: 'Rent facilitations' },
    { icon: ShoppingCart, label: 'Orders', path: '/manager-access?tab=orders', color: 'bg-purple-500', description: 'Product orders' },
    { icon: CreditCard, label: 'Payments', path: '/manager-access?tab=payments', color: 'bg-pink-500', description: 'Payment confirmations' },
    { icon: Receipt, label: 'Receipts', path: '/manager-access?tab=receipts', color: 'bg-teal-500', description: 'User receipts' },
    { icon: ChartBar, label: 'Finance', path: '/manager-access?tab=financials', color: 'bg-emerald-500', description: 'Financial overview' },
    { icon: MapPin, label: 'Locations', path: '/manager-access?tab=locations', color: 'bg-red-500', description: 'User locations' },
  ],
  tenant: [
    { icon: Home, label: 'Home', path: '/dashboard/tenant', color: 'bg-blue-500', description: 'Dashboard' },
    { icon: Calculator, label: 'Calculator', path: '/calculator', color: 'bg-green-500', description: 'Rent calculator' },
    { icon: Receipt, label: 'Receipts', path: '/my-receipts', color: 'bg-purple-500', description: 'My receipts' },
    { icon: Banknote, label: 'My Loans', path: '/my-loans', color: 'bg-orange-500', description: 'View loans' },
    { icon: History, label: 'History', path: '/transaction-history', color: 'bg-teal-500', description: 'Transactions' },
    { icon: Store, label: 'Shop', path: '/marketplace', color: 'bg-pink-500', description: 'Marketplace' },
    { icon: Gift, label: 'Referrals', path: '/referrals', color: 'bg-amber-500', description: 'Earn rewards' },
    { icon: Settings, label: 'Settings', path: '/settings', color: 'bg-slate-500', description: 'Account settings' },
  ],
  agent: [
    { icon: Home, label: 'Home', path: '/dashboard/agent', color: 'bg-blue-500', description: 'Dashboard' },
    { icon: UserPlus, label: 'Register', path: '/agent-registrations', color: 'bg-green-500', description: 'Register users' },
    { icon: ChartBar, label: 'Analytics', path: '/agent-analytics', color: 'bg-purple-500', description: 'View analytics' },
    { icon: Wallet, label: 'Earnings', path: '/agent-earnings', color: 'bg-amber-500', description: 'My earnings' },
    { icon: Store, label: 'Shop', path: '/marketplace', color: 'bg-pink-500', description: 'Marketplace' },
    { icon: History, label: 'History', path: '/transaction-history', color: 'bg-teal-500', description: 'Transactions' },
    { icon: Gift, label: 'Referrals', path: '/referrals', color: 'bg-orange-500', description: 'Earn rewards' },
    { icon: Settings, label: 'Settings', path: '/settings', color: 'bg-slate-500', description: 'Account settings' },
  ],
  supporter: [
    { icon: Home, label: 'Home', path: '/dashboard/funder', color: 'bg-blue-500', description: 'Dashboard' },
    { icon: PiggyBank, label: 'Support', path: '/dashboard/funder', color: 'bg-green-500', description: 'My contributions' },
    { icon: Heart, label: 'Fund', path: '/dashboard/funder', color: 'bg-pink-500', description: 'Fund tenants' },
    { icon: History, label: 'History', path: '/transaction-history', color: 'bg-teal-500', description: 'Transactions' },
    { icon: Store, label: 'Shop', path: '/marketplace', color: 'bg-purple-500', description: 'Marketplace' },
    { icon: Gift, label: 'Referrals', path: '/referrals', color: 'bg-amber-500', description: 'Earn rewards' },
    { icon: Calculator, label: 'Calculator', path: '/calculator', color: 'bg-orange-500', description: 'Fee calculator' },
    { icon: Settings, label: 'Settings', path: '/settings', color: 'bg-slate-500', description: 'Account settings' },
  ],
  landlord: [
    { icon: Home, label: 'Home', path: '/dashboard/landlord', color: 'bg-blue-500', description: 'Dashboard' },
    { icon: Building, label: 'Tenants', path: '/dashboard/landlord', color: 'bg-green-500', description: 'My tenants' },
    { icon: Wallet, label: 'Payments', path: '/transaction-history', color: 'bg-purple-500', description: 'View payments' },
    { icon: History, label: 'History', path: '/transaction-history', color: 'bg-teal-500', description: 'Transactions' },
    { icon: Store, label: 'Shop', path: '/marketplace', color: 'bg-pink-500', description: 'Marketplace' },
    { icon: Receipt, label: 'Receipts', path: '/my-receipts', color: 'bg-orange-500', description: 'My receipts' },
    { icon: Gift, label: 'Referrals', path: '/referrals', color: 'bg-amber-500', description: 'Earn rewards' },
    { icon: Settings, label: 'Settings', path: '/settings', color: 'bg-slate-500', description: 'Account settings' },
  ],
};

const roleLabels: Partial<Record<AppRole, string>> = {
  manager: 'Manager Quick Actions',
  tenant: 'Quick Actions',
  agent: 'Agent Quick Actions',
  supporter: 'Supporter Quick Actions',
  landlord: 'Landlord Quick Actions',
};

export default function MobileQuickMenu({ currentRole, onScrollToProductivity }: MobileQuickMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const menuItems = menuConfigs[currentRole] || defaultMenu;
  const roleLabel = roleLabels[currentRole] || 'Quick Actions';

  const handleOpen = () => {
    hapticTap();
    setIsOpen(true);
  };

  const handleClose = () => {
    hapticTap();
    setIsOpen(false);
  };

  const handleItemClick = (path: string) => {
    hapticSuccess();
    setIsOpen(false);
    navigate(path);
  };

  const handleProductivity = () => {
    hapticSuccess();
    setIsOpen(false);
    onScrollToProductivity?.();
  };

  const { mounted, visible } = useDrawerTransition(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); handleClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <>
      {/* Floating Menu Button - Visible on mobile only */}
      <button
        onClick={isOpen ? handleClose : handleOpen}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        className={cn(
          "md:hidden fixed bottom-24 right-4 z-[60] p-4 rounded-full shadow-2xl transition-transform duration-200 active:scale-90",
          isOpen
            ? "bg-destructive text-destructive-foreground rotate-90"
            : "bg-primary text-primary-foreground rotate-0"
        )}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Menu className="h-6 w-6" />
        )}
      </button>

      {mounted && (
        <>
          {/* Backdrop */}
          <div
            onClick={handleClose}
            className={cn(
              "md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] transition-opacity duration-300",
              visible ? "opacity-100" : "opacity-0",
            )}
          />

          {/* Menu Panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={roleLabel}
            className={cn(
              "md:hidden fixed bottom-40 left-4 right-4 z-[60] bg-card rounded-3xl shadow-2xl border border-border overflow-hidden max-w-md mx-auto transition-all duration-300 ease-out",
              visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-24 scale-95",
            )}
          >
            {/* Header */}
            <div className="p-4 bg-primary/10 border-b border-border">
              <h3 className="font-bold text-lg text-center">{roleLabel}</h3>
              <p className="text-xs text-muted-foreground text-center mt-1">
                Tap any item to navigate
              </p>
            </div>

            {/* Grid of Actions */}
            <div className="p-4 grid grid-cols-4 gap-3">
              {menuItems.map((item) => (
                <button
                  key={item.path + item.label}
                  onClick={() => handleItemClick(item.path)}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-muted/50 hover:bg-muted active:scale-95 transition-all animate-fade-in"
                >
                  <div className={cn("p-2.5 rounded-xl", item.color)}>
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-xs font-medium text-center leading-tight">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Bottom Actions */}
            <div className="p-4 border-t border-border bg-muted/30 flex gap-2">
              {currentRole === 'manager' && onScrollToProductivity && (
                <button
                  onClick={handleProductivity}
                  className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium active:scale-95 transition-all"
                >
                  <Award className="h-5 w-5" />
                  <span className="text-sm">Productivity</span>
                </button>
              )}
              <button
                onClick={() => handleItemClick('/install')}
                className={cn(
                  "flex items-center justify-center gap-2 p-3 rounded-xl bg-primary/20 text-primary font-medium active:scale-95 transition-all",
                  currentRole === 'manager' && onScrollToProductivity ? "flex-1" : "flex-1"
                )}
              >
                <Download className="h-5 w-5" />
                <span className="text-sm">Share App</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

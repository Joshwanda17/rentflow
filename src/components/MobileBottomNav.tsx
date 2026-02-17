import { Link, useLocation } from 'react-router-dom';
import { Home, MessageCircle, Settings, Store, Users, FileText, DollarSign } from 'lucide-react';
import { AppRole } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';
import { useCurrency } from '@/hooks/useCurrency';
import { CurrencySwitcher } from '@/components/CurrencySwitcher';

interface MobileBottomNavProps {
  currentRole: AppRole;
}

export default function MobileBottomNav({ currentRole }: MobileBottomNavProps) {
  const location = useLocation();
  const { currency } = useCurrency();
  
  // Role-specific navigation items with large, clear icons
  const getNavItems = () => {
    const baseItems = [
      { 
        href: '/dashboard', 
        icon: Home, 
        label: 'Home',
        active: location.pathname === '/dashboard'
      },
    ];

    // Manager-specific quick actions
    if (currentRole === 'manager') {
      return [
        ...baseItems,
        { 
          href: '/manager-access?tab=users', 
          icon: Users, 
          label: 'Users',
          active: location.pathname === '/manager-access' && location.search.includes('users')
        },
        { 
          href: '/manager-access', 
          icon: FileText, 
          label: 'Rent',
          active: location.pathname === '/manager-access' && !location.search.includes('users')
        },
        { 
          href: '/marketplace', 
          icon: Store, 
          label: 'Shop',
          active: location.pathname === '/marketplace'
        },
      ];
    }

    // Agent-specific navigation
    if (currentRole === 'agent') {
      return [
        ...baseItems,
        { 
          href: '/agent-registrations', 
          icon: Users, 
          label: 'Users',
          active: location.pathname === '/agent-registrations'
        },
        { 
          href: '/marketplace', 
          icon: Store, 
          label: 'Shop',
          active: location.pathname === '/marketplace'
        },
        { 
          href: '/referrals', 
          icon: Users, 
          label: 'Invite',
          active: location.pathname === '/referrals'
        },
      ];
    }

    // Supporter-specific navigation
    if (currentRole === 'supporter') {
      return [
        ...baseItems,
        { 
          href: '/marketplace', 
          icon: Store, 
          label: 'Shop',
          active: location.pathname === '/marketplace'
        },
        { 
          href: '/chat', 
          icon: MessageCircle, 
          label: 'Chat',
          active: location.pathname === '/chat'
        },
      ];
    }

    // Default navigation for other roles
    return [
      ...baseItems,
      { 
        href: '/marketplace', 
        icon: Store, 
        label: 'Shop',
        active: location.pathname === '/marketplace'
      },
      { 
        href: '/chat', 
        icon: MessageCircle, 
        label: 'Chat',
        active: location.pathname === '/chat'
      },
      { 
        href: '/referrals', 
        icon: Users, 
        label: 'Invite',
        active: location.pathname === '/referrals'
      },
    ];
  };

  const navItems = getNavItems();

  const handleTap = () => {
    hapticTap();
  };

  return (
    <nav 
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-around py-1.5 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label + item.href}
              to={item.href}
              onClick={handleTap}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 px-2 rounded-2xl transition-all min-w-[52px] relative touch-manipulation",
                item.active 
                  ? "text-primary bg-primary/12 scale-105" 
                  : "text-muted-foreground active:text-foreground active:bg-accent/50 active:scale-95"
              )}
            >
              <div className={cn(
                "relative p-1 rounded-xl transition-all",
                item.active && "bg-primary/15"
              )}>
                <Icon className={cn(
                  "h-5 w-5 transition-transform",
                  item.active && "scale-110"
                )} strokeWidth={item.active ? 2.5 : 2} />
              </div>
              <span className={cn(
                "text-[9px] font-bold tracking-wide leading-tight",
                item.active ? "text-primary" : "text-muted-foreground"
              )}>{item.label}</span>
              {item.active && (
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}

        {/* Currency quick-switch button */}
        <CurrencySwitcher 
          variant="compact" 
          className="flex flex-col items-center justify-center gap-0.5 py-2 px-2 rounded-2xl min-w-[52px] min-h-[48px] text-muted-foreground hover:text-foreground active:scale-95 touch-manipulation !h-auto !w-auto"
        />

        {/* Big Menu button */}
        <Link
          to="/settings"
          onClick={handleTap}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-2xl transition-all min-w-[56px] min-h-[48px] relative touch-manipulation",
            location.pathname === '/settings'
              ? "text-primary bg-primary/12 scale-105" 
              : "text-muted-foreground active:text-foreground active:bg-accent/50 active:scale-95"
          )}
        >
          <div className={cn(
            "relative p-1.5 rounded-xl transition-all",
            location.pathname === '/settings' && "bg-primary/15"
          )}>
            <Settings className={cn(
              "h-6 w-6 transition-transform",
              location.pathname === '/settings' && "scale-110"
            )} strokeWidth={location.pathname === '/settings' ? 2.5 : 2} />
          </div>
          <span className={cn(
            "text-[9px] font-bold tracking-wide leading-tight",
            location.pathname === '/settings' ? "text-primary" : "text-muted-foreground"
          )}>Menu</span>
          {location.pathname === '/settings' && (
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-primary" />
          )}
        </Link>
      </div>
    </nav>
  );
}

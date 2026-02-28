import { Link, useLocation } from 'react-router-dom';
import { Home, MessageCircle, Settings, Store, Users, FileText, Wallet, Shield } from 'lucide-react';
import { AppRole } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';

interface MobileBottomNavProps {
  currentRole: AppRole;
  /** For manager: switch to a hub section instead of navigating */
  onManagerHubChange?: (hub: 'home' | 'wallets' | 'rent-investments' | 'buffer') => void;
  activeManagerHub?: string;
}

export default function MobileBottomNav({ currentRole, onManagerHubChange, activeManagerHub }: MobileBottomNavProps) {
  const location = useLocation();
  const currentPath = location.pathname;
  const handleTap = () => {
    hapticTap();
  };

  // Manager-specific: in-dashboard hub switching
  if (currentRole === 'manager' && location.pathname === '/dashboard' && onManagerHubChange) {
    const managerItems = [
      { 
        id: 'home' as const,
        icon: Home, 
        label: 'Home',
      },
      { 
        id: 'wallets' as const,
        icon: Wallet, 
        label: 'Wallets',
      },
      { 
        id: 'rent-investments' as const,
        icon: FileText, 
        label: 'Rent',
      },
      { 
        id: 'buffer' as const,
        icon: Shield, 
        label: 'Buffer',
      },
    ];

    return (
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-around py-1.5 px-1">
          {managerItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeManagerHub === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { handleTap(); onManagerHubChange(item.id); }}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-2xl transition-all min-w-[56px] min-h-[48px] relative touch-manipulation",
                  isActive 
                    ? "text-primary bg-primary/12" 
                    : "text-muted-foreground active:text-foreground active:bg-accent/50 active:scale-95"
                )}
              >
                <div className={cn(
                  "relative p-1 rounded-xl transition-all",
                  isActive && "bg-primary/15"
                )}>
                  <Icon className={cn(
                    "h-5 w-5 transition-transform",
                    isActive && "scale-110"
                  )} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={cn(
                  "text-[9px] font-bold tracking-wide leading-tight",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>{item.label}</span>
                {isActive && (
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}

          {/* Settings */}
          <Link
            to="/settings"
            onClick={handleTap}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-2xl transition-all min-w-[56px] min-h-[48px] relative touch-manipulation",
              location.pathname === '/settings'
                ? "text-primary bg-primary/12" 
                : "text-muted-foreground active:text-foreground active:bg-accent/50 active:scale-95"
            )}
          >
            <div className={cn(
              "relative p-1 rounded-xl transition-all",
              location.pathname === '/settings' && "bg-primary/15"
            )}>
              <Settings className={cn(
                "h-5 w-5 transition-transform",
                location.pathname === '/settings' && "scale-110"
              )} strokeWidth={location.pathname === '/settings' ? 2.5 : 2} />
            </div>
            <span className={cn(
              "text-[9px] font-bold tracking-wide leading-tight",
              location.pathname === '/settings' ? "text-primary" : "text-muted-foreground"
            )}>Menu</span>
          </Link>
        </div>
      </nav>
    );
  }

  // Standard nav for all roles
  const getNavItems = () => {
    const baseItems = [
      { 
        href: '/dashboard', 
        icon: Home, 
        label: 'Home',
        active: location.pathname === '/dashboard'
      },
    ];

    if (currentRole === 'manager') {
      return [
        ...baseItems,
        { href: '/manager-access?tab=users', icon: Users, label: 'Users', active: location.pathname === '/manager-access' && location.search.includes('users') },
        { href: '/manager-access', icon: FileText, label: 'Rent', active: location.pathname === '/manager-access' && !location.search.includes('users') },
        { href: '/marketplace', icon: Store, label: 'Shop', active: location.pathname === '/marketplace' },
      ];
    }

    if (currentRole === 'agent') {
      return [
        ...baseItems,
        { href: '/agent-registrations', icon: Users, label: 'Users', active: location.pathname === '/agent-registrations' },
        { href: '/marketplace', icon: Store, label: 'Shop', active: location.pathname === '/marketplace' },
        { href: '/referrals', icon: Users, label: 'Invite', active: location.pathname === '/referrals' },
      ];
    }

    if (currentRole === 'supporter') {
      return [
        ...baseItems,
        { href: '/marketplace', icon: Store, label: 'Shop', active: location.pathname === '/marketplace' },
        { href: '/chat', icon: MessageCircle, label: 'Chat', active: location.pathname === '/chat' },
      ];
    }

    return [
      ...baseItems,
      { href: '/marketplace', icon: Store, label: 'Shop', active: location.pathname === '/marketplace' },
      { href: '/chat', icon: MessageCircle, label: 'Chat', active: location.pathname === '/chat' },
      { href: '/referrals', icon: Users, label: 'Invite', active: location.pathname === '/referrals' },
    ];
  };

  const navItems = getNavItems();

  return (
    <nav 
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
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

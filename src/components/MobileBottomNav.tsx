import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Menu, Settings, Store, Users, FileText, Wallet, Shield } from 'lucide-react';
import { AppRole } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';
import { roleToSlug } from '@/lib/roleRoutes';
import WelileAIChatDrawer from '@/components/ai-chat/WelileAIChatDrawer';
import MobileManagerMenu from '@/components/manager/MobileManagerMenu';

const GeminiSparkle = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14 2C14 2 16.5 9 18.5 11.5C20.5 14 26 14 26 14C26 14 20.5 14 18.5 16.5C16.5 19 14 26 14 26C14 26 11.5 19 9.5 16.5C7.5 14 2 14 2 14C2 14 7.5 14 9.5 11.5C11.5 9 14 2 14 2Z"
      fill="currentColor"
    />
  </svg>
);

interface MobileBottomNavProps {
  currentRole: AppRole;
  onManagerHubChange?: (hub: 'home' | 'wallets' | 'rent-investments' | 'buffer') => void;
  activeManagerHub?: string;
  onScrollToProductivity?: () => void;
  onOpenMenu?: () => void;
}

export default function MobileBottomNav({ currentRole, onManagerHubChange, activeManagerHub, onScrollToProductivity, onOpenMenu }: MobileBottomNavProps) {
  const location = useLocation();
  const currentPath = location.pathname;
  const currentSearch = location.search;
  const personaSlug = roleToSlug(currentRole);
  const [aiOpen, setAiOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  
  const handleTap = () => { hapticTap(); };

  // Manager bottom nav: hub switching when on the manager dashboard
  if (currentRole === 'manager' && currentPath === '/dashboard/manager' && onManagerHubChange) {
    const managerItems = [
      { id: 'home' as const, icon: Home, label: 'Home' },
      { id: 'wallets' as const, icon: Wallet, label: 'Wallets' },
      { id: 'rent-investments' as const, icon: FileText, label: 'Rent' },
      { id: 'buffer' as const, icon: Shield, label: 'Buffer' },
    ];

    return (
      <>
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
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
                    isActive ? "text-primary bg-primary/12" : "text-muted-foreground active:text-foreground active:bg-accent/50 active:scale-95"
                  )}
                >
                  <div className={cn("relative p-1 rounded-xl transition-all", isActive && "bg-primary/15")}>
                    <Icon className={cn("h-5 w-5", isActive && "scale-110")} strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  <span className={cn("text-[9px] font-bold tracking-wide", isActive ? "text-primary" : "text-muted-foreground")}>{item.label}</span>
                  {isActive && <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-primary" />}
                </button>
              );
            })}
            <button onClick={() => { handleTap(); setAiOpen(true); }} className="flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-2xl transition-all min-w-[56px] min-h-[48px] text-primary active:scale-95 touch-manipulation">
              <div className="relative p-1 rounded-xl bg-primary/15"><GeminiSparkle size={20} /></div>
              <span className="text-[9px] font-bold tracking-wide text-primary">AI</span>
            </button>
            <button onClick={() => { handleTap(); setMenuOpen(true); }} className="flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-2xl transition-all min-w-[56px] min-h-[48px] text-muted-foreground active:text-foreground active:bg-accent/50 active:scale-95 touch-manipulation">
              <div className="relative p-1.5 rounded-xl">
                <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
                  <Menu className="h-4 w-4" />
                </div>
              </div>
              <span className="text-[9px] font-bold tracking-wide text-muted-foreground">Menu</span>
            </button>
          </div>
        </nav>
        <WelileAIChatDrawer open={aiOpen} onOpenChange={setAiOpen} />
        {menuOpen && <MobileManagerMenu onScrollToProductivity={onScrollToProductivity} isOpen={menuOpen} onClose={() => setMenuOpen(false)} />}
      </>
    );
  }

  // Standard nav for all roles
  const getNavItems = () => {
    const baseItems = [{ href: personaSlug, icon: Home, label: 'Home', active: currentPath === personaSlug }];

    if (currentRole === 'manager') {
      return [...baseItems,
        { href: '/manager-access?tab=users', icon: Users, label: 'Users', active: currentPath === '/manager-access' && currentSearch.includes('users') },
        { href: '/manager-access', icon: FileText, label: 'Rent', active: currentPath === '/manager-access' && !currentSearch.includes('users') },
        { href: '/marketplace', icon: Store, label: 'Shop', active: currentPath === '/marketplace' },
      ];
    }
    if (currentRole === 'agent') {
      return [...baseItems,
        { href: '/marketplace', icon: Store, label: 'Shop', active: currentPath === '/marketplace' },
      ];
    }
    if (currentRole === 'supporter') {
      return [...baseItems,
        { href: '/transactions', icon: Wallet, label: 'Wallet', active: currentPath === '/transactions' },
        { href: '/marketplace', icon: Store, label: 'Shop', active: currentPath === '/marketplace' },
        { href: '/settings', icon: Settings, label: 'Settings', active: currentPath === '/settings' },
      ];
    }
    return [...baseItems,
      { href: '/marketplace', icon: Store, label: 'Shop', active: currentPath === '/marketplace' },
      { href: '/referrals', icon: Users, label: 'Invite', active: currentPath === '/referrals' },
    ];
  };

  const navItems = getNavItems();
  const isSettingsActive = currentPath === '/settings';

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center justify-around py-1.5 px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.label + item.href} to={item.href} onClick={handleTap}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 px-2 rounded-2xl transition-all min-w-[52px] relative touch-manipulation",
                  item.active ? "text-primary bg-primary/12 scale-105" : "text-muted-foreground active:text-foreground active:bg-accent/50 active:scale-95"
                )}
              >
                <div className={cn("relative p-1 rounded-xl transition-all", item.active && "bg-primary/15")}>
                  <Icon className={cn("h-5 w-5 transition-transform", item.active && "scale-110")} strokeWidth={item.active ? 2.5 : 2} />
                </div>
                <span className={cn("text-[9px] font-bold tracking-wide leading-tight", item.active ? "text-primary" : "text-muted-foreground")}>{item.label}</span>
                {item.active && <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
          <button onClick={() => { handleTap(); setAiOpen(true); }} className="flex flex-col items-center justify-center gap-0.5 py-2 px-2 rounded-2xl transition-all min-w-[52px] text-primary active:scale-95 touch-manipulation">
            <div className="relative p-1 rounded-xl bg-primary/15"><GeminiSparkle size={20} /></div>
            <span className="text-[9px] font-bold tracking-wide leading-tight text-primary">AI</span>
          </button>
          {onOpenMenu ? (
            <button onClick={() => { handleTap(); onOpenMenu(); }}
              className="flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-2xl transition-all min-w-[56px] min-h-[48px] text-muted-foreground active:text-foreground active:bg-accent/50 active:scale-95 touch-manipulation"
            >
              <div className="relative p-1.5 rounded-xl">
                <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
                  <Menu className="h-4 w-4" />
                </div>
              </div>
              <span className="text-[9px] font-bold tracking-wide leading-tight text-muted-foreground">Menu</span>
            </button>
          ) : (
            <Link to="/settings" onClick={handleTap}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-2xl transition-all min-w-[56px] min-h-[48px] relative touch-manipulation",
                isSettingsActive ? "text-primary bg-primary/12 scale-105" : "text-muted-foreground active:text-foreground active:bg-accent/50 active:scale-95"
              )}
            >
              <div className={cn("relative p-1.5 rounded-xl transition-all", isSettingsActive && "bg-primary/15")}>
                <Settings className={cn("h-6 w-6 transition-transform", isSettingsActive && "scale-110")} strokeWidth={isSettingsActive ? 2.5 : 2} />
              </div>
              <span className={cn("text-[9px] font-bold tracking-wide leading-tight", isSettingsActive ? "text-primary" : "text-muted-foreground")}>Menu</span>
              {isSettingsActive && <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-primary" />}
            </Link>
          )}
        </div>
      </nav>
      <WelileAIChatDrawer open={aiOpen} onOpenChange={setAiOpen} />
    </>
  );
}

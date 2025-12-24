import { Link, useLocation } from 'react-router-dom';
import { Home, User, Settings, LogOut } from 'lucide-react';
import { AppRole } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  currentRole: AppRole;
  onSignOut: () => void;
}

const roleIcons: Record<AppRole, { icon: React.ReactNode; label: string }> = {
  tenant: { icon: <Home className="h-5 w-5" />, label: 'Home' },
  agent: { icon: <User className="h-5 w-5" />, label: 'Dashboard' },
  supporter: { icon: <Home className="h-5 w-5" />, label: 'Invest' },
  landlord: { icon: <Home className="h-5 w-5" />, label: 'Payments' },
  manager: { icon: <Settings className="h-5 w-5" />, label: 'Manage' },
};

export default function MobileBottomNav({ currentRole, onSignOut }: MobileBottomNavProps) {
  const location = useLocation();
  
  const navItems = [
    { 
      href: '/', 
      icon: <Home className="h-5 w-5" />, 
      label: 'Home',
      active: location.pathname === '/'
    },
    { 
      href: '/dashboard', 
      icon: roleIcons[currentRole]?.icon || <User className="h-5 w-5" />, 
      label: roleIcons[currentRole]?.label || 'Dashboard',
      active: location.pathname === '/dashboard'
    },
    { 
      href: '#signout', 
      icon: <LogOut className="h-5 w-5" />, 
      label: 'Sign Out',
      onClick: onSignOut,
      active: false
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around py-2 px-4">
        {navItems.map((item) => (
          item.onClick ? (
            <button
              key={item.label}
              onClick={item.onClick}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[64px]",
                "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              {item.icon}
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          ) : (
            <Link
              key={item.label}
              to={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[64px]",
                item.active 
                  ? "text-primary bg-primary/10" 
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              {item.icon}
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        ))}
      </div>
    </nav>
  );
}

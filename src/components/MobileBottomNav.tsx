import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, User, Settings, LogOut, Store } from 'lucide-react';
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
      href: '/marketplace', 
      icon: <Store className="h-5 w-5" />, 
      label: 'Shop',
      active: location.pathname === '/marketplace'
    },
    { 
      href: '/settings', 
      icon: <Settings className="h-5 w-5" />, 
      label: 'Settings',
      active: location.pathname === '/settings'
    },
    { 
      href: '#signout', 
      icon: <LogOut className="h-5 w-5" />, 
      label: 'Exit',
      onClick: onSignOut,
      active: false
    },
  ];

  return (
    <motion.nav 
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-bottom"
    >
      <div className="flex items-center justify-around py-2 px-2">
        {navItems.map((item) => (
          item.onClick ? (
            <button
              key={item.label}
              onClick={item.onClick}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg transition-colors min-w-[56px]",
                "text-muted-foreground hover:text-foreground active:bg-accent"
              )}
            >
              {item.icon}
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ) : (
            <Link
              key={item.label}
              to={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg transition-colors min-w-[56px] relative",
                item.active 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground active:bg-accent"
              )}
            >
              {item.active && (
                <motion.div
                  layoutId="activeNavBg"
                  className="absolute inset-0 bg-primary/8 rounded-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{item.icon}</span>
              <span className="text-[10px] font-medium relative z-10">{item.label}</span>
            </Link>
          )
        ))}
      </div>
    </motion.nav>
  );
}
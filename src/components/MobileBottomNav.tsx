import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, User, Settings, LogOut, Store } from 'lucide-react';
import { AppRole } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';

interface MobileBottomNavProps {
  currentRole: AppRole;
  onSignOut: () => void;
}

const roleIcons: Record<AppRole, { icon: React.ReactNode; label: string }> = {
  tenant: { icon: <Home className="h-6 w-6" />, label: 'Home' },
  agent: { icon: <User className="h-6 w-6" />, label: 'Me' },
  supporter: { icon: <Home className="h-6 w-6" />, label: 'Invest' },
  landlord: { icon: <Home className="h-6 w-6" />, label: 'Pay' },
  manager: { icon: <Settings className="h-6 w-6" />, label: 'Admin' },
};

export default function MobileBottomNav({ currentRole, onSignOut }: MobileBottomNavProps) {
  const location = useLocation();
  
  const navItems = [
    { 
      href: '/', 
      icon: <Home className="h-6 w-6" />, 
      label: 'Home',
      active: location.pathname === '/'
    },
    { 
      href: '/dashboard', 
      icon: roleIcons[currentRole]?.icon || <User className="h-6 w-6" />, 
      label: roleIcons[currentRole]?.label || 'Me',
      active: location.pathname === '/dashboard'
    },
    { 
      href: '/marketplace', 
      icon: <Store className="h-6 w-6" />, 
      label: 'Shop',
      active: location.pathname === '/marketplace'
    },
    { 
      href: '/settings', 
      icon: <Settings className="h-6 w-6" />, 
      label: 'More',
      active: location.pathname === '/settings'
    },
    { 
      href: '#signout', 
      icon: <LogOut className="h-6 w-6" />, 
      label: 'Exit',
      onClick: onSignOut,
      active: false
    },
  ];

  const handleTap = () => {
    hapticTap();
  };

  return (
    <motion.nav 
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border safe-area-bottom"
    >
      <div className="flex items-center justify-around py-1.5 px-1">
        {navItems.map((item) => (
          item.onClick ? (
            <button
              key={item.label}
              onClick={() => {
                handleTap();
                item.onClick?.();
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl transition-all min-w-[60px] min-h-[56px]",
                "text-muted-foreground hover:text-foreground active:scale-95 active:bg-accent/50"
              )}
            >
              {item.icon}
              <span className="text-[10px] font-semibold">{item.label}</span>
            </button>
          ) : (
            <Link
              key={item.label}
              to={item.href}
              onClick={handleTap}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl transition-all min-w-[60px] min-h-[56px] relative active:scale-95",
                item.active 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground active:bg-accent/50"
              )}
            >
              {item.active && (
                <motion.div
                  layoutId="activeNavBg"
                  className="absolute inset-0 bg-primary/10 rounded-xl"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{item.icon}</span>
              <span className="text-[10px] font-semibold relative z-10">{item.label}</span>
            </Link>
          )
        ))}
      </div>
    </motion.nav>
  );
}
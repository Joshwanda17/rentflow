import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, MessageCircle, Settings, Store, User } from 'lucide-react';
import { AppRole } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';

interface MobileBottomNavProps {
  currentRole: AppRole;
  onSignOut: () => void;
}

export default function MobileBottomNav({ currentRole, onSignOut }: MobileBottomNavProps) {
  const location = useLocation();
  
  const navItems = [
    { 
      href: '/dashboard', 
      icon: MessageCircle, 
      label: 'Chats',
      active: location.pathname === '/dashboard'
    },
    { 
      href: '/marketplace', 
      icon: Store, 
      label: 'Shop',
      active: location.pathname === '/marketplace'
    },
    { 
      href: '/', 
      icon: Home, 
      label: 'Home',
      active: location.pathname === '/'
    },
    { 
      href: '/referrals', 
      icon: User, 
      label: 'Community',
      active: location.pathname === '/referrals'
    },
    { 
      href: '/settings', 
      icon: Settings, 
      label: 'Settings',
      active: location.pathname === '/settings'
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
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom"
    >
      <div className="flex items-center justify-around py-2 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.href}
              onClick={handleTap}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[56px] relative",
                item.active 
                  ? "text-primary" 
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              <Icon className={cn("h-6 w-6", item.active && "fill-primary/20")} />
              <span className="text-[10px] font-medium">{item.label}</span>
              {item.active && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute -top-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}

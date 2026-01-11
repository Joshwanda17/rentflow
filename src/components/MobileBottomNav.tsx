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
      href: '/dashboard', 
      icon: Home, 
      label: 'Home',
      active: location.pathname === '/dashboard'
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
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/50 safe-area-bottom shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.1)]"
    >
      <div className="flex items-center justify-around py-1.5 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.href}
              onClick={handleTap}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-[60px] relative",
                item.active 
                  ? "text-primary bg-primary/8" 
                  : "text-muted-foreground active:text-foreground active:bg-accent/50"
              )}
            >
              <Icon className={cn(
                "h-5 w-5 transition-transform",
                item.active && "scale-110"
              )} />
              <span className={cn(
                "text-[10px] font-semibold tracking-wide",
                item.active && "text-primary"
              )}>{item.label}</span>
              {item.active && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-primary"
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

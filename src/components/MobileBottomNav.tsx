import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
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

const navItemVariants = {
  tap: { scale: 0.9 },
  hover: { y: -2 },
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
      href: '/settings', 
      icon: <Settings className="h-5 w-5" />, 
      label: 'Settings',
      active: location.pathname === '/settings'
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
    <motion.nav 
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t border-border/50 safe-area-bottom"
    >
      <div className="flex items-center justify-around py-2 px-4">
        {navItems.map((item, index) => (
          item.onClick ? (
            <motion.button
              key={item.label}
              onClick={item.onClick}
              variants={navItemVariants}
              whileTap="tap"
              whileHover="hover"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl transition-colors min-w-[64px] relative",
                "text-muted-foreground hover:text-foreground"
              )}
            >
              <motion.div
                whileHover={{ scale: 1.1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                {item.icon}
              </motion.div>
              <span className="text-xs font-medium">{item.label}</span>
            </motion.button>
          ) : (
            <Link
              key={item.label}
              to={item.href}
              className="relative"
            >
              <motion.div
                variants={navItemVariants}
                whileTap="tap"
                whileHover="hover"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl transition-colors min-w-[64px] relative",
                  item.active 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.active && (
                  <motion.div
                    layoutId="activeNavBg"
                    className="absolute inset-0 bg-primary/10 rounded-xl"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                  className="relative z-10"
                >
                  {item.icon}
                </motion.div>
                <span className="text-xs font-medium relative z-10">{item.label}</span>
                {item.active && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute -top-1 w-1 h-1 bg-primary rounded-full"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </motion.div>
            </Link>
          )
        ))}
      </div>
    </motion.nav>
  );
}

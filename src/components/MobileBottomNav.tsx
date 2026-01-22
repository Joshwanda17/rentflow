import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, MessageCircle, Settings, Store, Users, FileText, TrendingUp } from 'lucide-react';
import { AppRole } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLastSeenAt } from '@/lib/opportunitySeenStorage';

interface MobileBottomNavProps {
  currentRole: AppRole;
  onSignOut: () => void;
}

export default function MobileBottomNav({ currentRole, onSignOut }: MobileBottomNavProps) {
  const location = useLocation();
  const [pendingOpportunities, setPendingOpportunities] = useState(0);
  
  // Fetch unseen opportunities count for supporters
  const fetchUnseenCount = useCallback(async () => {
    const lastSeenAt = getLastSeenAt();
    
    let query = supabase
      .from('rent_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'approved']);
    
    // Only count opportunities created after last seen timestamp
    if (lastSeenAt) {
      query = query.gt('created_at', lastSeenAt.toISOString());
    }
    
    const { count, error } = await query;
    
    if (!error && count !== null) {
      setPendingOpportunities(count);
    }
  }, []);

  useEffect(() => {
    if (currentRole !== 'supporter') return;
    
    fetchUnseenCount();
    
    const channel = supabase
      .channel('nav-opportunities')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rent_requests',
        },
        () => {
          fetchUnseenCount();
        }
      )
      .subscribe();
    
    // Also listen for storage changes (when user marks all as seen)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'opportunities_last_seen_at') {
        fetchUnseenCount();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    // Custom event for same-tab updates
    const handleCustomEvent = () => fetchUnseenCount();
    window.addEventListener('opportunities-marked-seen', handleCustomEvent);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('opportunities-marked-seen', handleCustomEvent);
    };
  }, [currentRole, fetchUnseenCount]);
  
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
        { 
          href: '/settings', 
          icon: Settings, 
          label: 'More',
          active: location.pathname === '/settings'
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
        { 
          href: '/settings', 
          icon: Settings, 
          label: 'More',
          active: location.pathname === '/settings'
        },
      ];
    }

    // Supporter-specific navigation with opportunities badge
    if (currentRole === 'supporter') {
      return [
        ...baseItems,
        { 
          href: '/opportunities', 
          icon: TrendingUp, 
          label: 'Invest',
          active: location.pathname === '/opportunities',
          badge: pendingOpportunities > 0 ? pendingOpportunities : undefined
        },
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
          href: '/settings', 
          icon: Settings, 
          label: 'More',
          active: location.pathname === '/settings'
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
      { 
        href: '/settings', 
        icon: Settings, 
        label: 'More',
        active: location.pathname === '/settings'
      },
    ];
  };

  const navItems = getNavItems();

  const handleTap = () => {
    hapticTap();
  };

  return (
    <motion.nav 
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/98 backdrop-blur-xl border-t-2 border-primary/20 shadow-[0_-8px_30px_-8px_rgba(0,0,0,0.15)]"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
      }}
    >
      <div className="flex items-center justify-around py-2 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const badge = 'badge' in item ? item.badge : undefined;
          return (
            <Link
              key={item.label + item.href}
              to={item.href}
              onClick={handleTap}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2.5 px-3 rounded-2xl transition-all min-w-[60px] relative touch-manipulation",
                item.active 
                  ? "text-primary bg-primary/12 scale-105" 
                  : "text-muted-foreground active:text-foreground active:bg-accent/50 active:scale-95"
              )}
            >
              {/* Large icon for easy tapping */}
              <div className={cn(
                "relative p-1 rounded-xl transition-all",
                item.active && "bg-primary/15"
              )}>
                <Icon className={cn(
                  "h-6 w-6 transition-transform",
                  item.active && "scale-110"
                )} strokeWidth={item.active ? 2.5 : 2} />
                
                {/* Badge for pending opportunities */}
                {badge !== undefined && badge > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold shadow-sm"
                  >
                    {badge > 99 ? '99+' : badge}
                  </motion.span>
                )}
              </div>
              
              {/* Clear label */}
              <span className={cn(
                "text-[10px] font-bold tracking-wide leading-tight",
                item.active ? "text-primary" : "text-muted-foreground"
              )}>{item.label}</span>
              
              {/* Active indicator dot */}
              {item.active && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full bg-primary"
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

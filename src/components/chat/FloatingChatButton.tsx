import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';
import { PresenceProvider } from '@/hooks/usePresence';
import ChatDrawer from './ChatDrawer';

export default function FloatingChatButton() {
  const location = useLocation();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Don't show on chat page
  const isOnChatPage = location.pathname === '/chat';

  useEffect(() => {
    if (!user) return;

    const fetchUnreadCount = async () => {
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id);

      if (!participations || participations.length === 0) {
        setUnreadCount(0);
        return;
      }

      let totalUnread = 0;

      for (const participation of participations) {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', participation.conversation_id)
          .neq('sender_id', user.id)
          .gt('created_at', participation.last_read_at || '1970-01-01');
        
        totalUnread += count || 0;
      }
      
      setUnreadCount(totalUnread);
    };

    fetchUnreadCount();

    // Subscribe to new messages
    const channel = supabase
      .channel('floating-chat-unread')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleClick = () => {
    hapticTap();
    setDrawerOpen(true);
  };

  if (isOnChatPage || !user) return null;

  return (
    <PresenceProvider>
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ 
          scale: 1, 
          opacity: 1,
          y: unreadCount > 0 ? [0, -8, 0] : 0
        }}
        transition={{
          y: {
            repeat: unreadCount > 0 ? Infinity : 0,
            repeatDelay: 2,
            duration: 0.5,
            ease: "easeInOut"
          }
        }}
        exit={{ scale: 0, opacity: 0 }}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.9 }}
        onClick={handleClick}
        className={cn(
          "fixed top-20 md:top-6 right-4 md:right-8 z-[60]",
          "h-14 w-14 md:h-16 md:w-16 rounded-full",
          "bg-gradient-to-br from-primary via-primary to-primary/70",
          "text-primary-foreground",
          "shadow-2xl shadow-primary/50",
          "flex items-center justify-center",
          "transition-all duration-300",
          "hover:shadow-primary/70 hover:shadow-2xl",
          "focus:outline-none focus:ring-4 focus:ring-primary/50 focus:ring-offset-2",
          "border-2 border-primary-foreground/30"
        )}
        aria-label="Open chat"
      >
        <MessageCircle className="h-6 w-6 md:h-7 md:w-7" strokeWidth={2.5} />

        {/* Unread badge */}
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className={cn(
                "absolute -top-1 -right-1",
                "min-w-[26px] h-[26px] px-2",
                "rounded-full",
                "bg-destructive text-destructive-foreground",
                "text-sm font-bold",
                "flex items-center justify-center",
                "border-2 border-background",
                "shadow-lg"
              )}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Pulse animation for unread */}
        {unreadCount > 0 && (
          <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-25" />
        )}

        {/* Glow effect */}
        <span className="absolute inset-0 rounded-full bg-primary/20 blur-md -z-10" />
      </motion.button>

      <ChatDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </PresenceProvider>
  );
}

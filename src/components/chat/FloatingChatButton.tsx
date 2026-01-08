import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface LatestMessage {
  content: string;
  senderName: string;
}

export default function FloatingChatButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestMessage, setLatestMessage] = useState<LatestMessage | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Don't show on chat page
  const isOnChatPage = location.pathname === '/chat';

  useEffect(() => {
    if (!user) return;

    const fetchUnreadData = async () => {
      // Get conversations the user is part of
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id);

      if (!participations || participations.length === 0) {
        setUnreadCount(0);
        setLatestMessage(null);
        return;
      }

      let totalUnread = 0;
      let newestMessage: { content: string; created_at: string; sender_id: string } | null = null;

      for (const participation of participations) {
        const { data: messages, count } = await supabase
          .from('messages')
          .select('content, created_at, sender_id', { count: 'exact' })
          .eq('conversation_id', participation.conversation_id)
          .neq('sender_id', user.id)
          .gt('created_at', participation.last_read_at || '1970-01-01')
          .order('created_at', { ascending: false })
          .limit(1);
        
        totalUnread += count || 0;
        
        if (messages && messages.length > 0) {
          if (!newestMessage || messages[0].created_at > newestMessage.created_at) {
            newestMessage = messages[0];
          }
        }
      }
      
      setUnreadCount(totalUnread);
      
      if (newestMessage) {
        // Fetch sender's name
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', newestMessage.sender_id)
          .single();
        
        setLatestMessage({
          content: newestMessage.content,
          senderName: profile?.full_name || 'Someone'
        });
      } else {
        setLatestMessage(null);
      }
    };

    fetchUnreadData();

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
          fetchUnreadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleClick = () => {
    hapticTap();
    navigate('/chat');
  };

  if (isOnChatPage || !user) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
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
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={cn(
              "fixed bottom-24 md:bottom-8 right-4 md:right-8 z-[60]",
              "h-16 w-16 md:h-[72px] md:w-[72px] rounded-full",
              "bg-gradient-to-br from-primary to-primary/80",
              "text-primary-foreground",
              "shadow-2xl shadow-primary/40",
              "flex items-center justify-center",
              "transition-all duration-300",
              "hover:shadow-primary/60 hover:shadow-2xl",
              "focus:outline-none focus:ring-4 focus:ring-primary/50 focus:ring-offset-2",
              "border-2 border-primary-foreground/20"
            )}
            aria-label="Chat with users"
          >
            <MessageCircle className="h-7 w-7 md:h-8 md:w-8" strokeWidth={2.5} />

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
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[250px]">
          {latestMessage ? (
            <div className="space-y-1">
              <p className="font-semibold text-xs text-muted-foreground">{latestMessage.senderName}</p>
              <p className="text-sm line-clamp-2">{latestMessage.content}</p>
            </div>
          ) : (
            <span className="font-medium">Chat with users</span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

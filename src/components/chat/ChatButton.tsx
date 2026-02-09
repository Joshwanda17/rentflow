import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function ChatButton() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchUnreadCount = async () => {
      // Get user's conversations
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id);

      if (!participations || participations.length === 0) {
        setUnreadCount(0);
        return;
      }

      let totalUnread = 0;

      for (const p of participations) {
        let query = supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', p.conversation_id)
          .neq('sender_id', user.id);

        if (p.last_read_at) {
          query = query.gt('created_at', p.last_read_at);
        }

        const { count } = await query;
        totalUnread += count || 0;
      }

      setUnreadCount(totalUnread);
    };

    fetchUnreadCount();

    // Subscribe to new messages
    const channel = supabase
      .channel('chat-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
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

  return (
    <Button
      variant="ghost"
      size="sm"
      className="relative h-8 w-8 p-0"
      onClick={() => navigate('/chat')}
    >
      <MessageCircle className="h-4 w-4" />
      {unreadCount > 0 && (
        <Badge className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 flex items-center justify-center text-[10px]">
          {unreadCount > 99 ? '99+' : unreadCount}
        </Badge>
      )}
    </Button>
  );
}

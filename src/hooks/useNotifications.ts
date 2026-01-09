import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { playNotificationSound, playCoinSound } from '@/lib/notificationSound';

interface NotificationMetadata {
  account_id?: string;
  supporter_id?: string;
  account_name?: string;
  rent_request_id?: string;
  user_id?: string;
  reason?: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  metadata: NotificationMetadata | null;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching notifications:', error);
      return;
    }

    const mappedData = (data || []).map(n => ({
      ...n,
      metadata: n.metadata as NotificationMetadata | null,
    }));

    setNotifications(mappedData);
    setUnreadCount(mappedData.filter(n => !n.read).length);
  }, [user]);

  const markAsRead = async (notificationId: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (!error) {
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    if (user) {
      setLoading(true);
      fetchNotifications().finally(() => setLoading(false));
    }
  }, [user, fetchNotifications]);

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('user-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const rawNotification = payload.new as { 
            id: string; 
            title: string; 
            message: string; 
            type: string; 
            read: boolean; 
            metadata: unknown; 
            created_at: string 
          };
          const newNotification: Notification = {
            ...rawNotification,
            metadata: rawNotification.metadata as NotificationMetadata | null,
          };
          setNotifications(prev => [newNotification, ...prev]);
          setUnreadCount(prev => prev + 1);

          // Play appropriate sound based on notification type (respects user preferences)
          if (newNotification.type === 'success' || newNotification.title.includes('Approved')) {
            playCoinSound();
          } else if (newNotification.type === 'earning') {
            playCoinSound();
          } else {
            playNotificationSound(); // Uses user's preferred sound type
          }

          // Show enhanced toast notification
          const toastIcon = getNotificationIcon(newNotification.type);
          
          toast(newNotification.title, {
            description: newNotification.message,
            icon: toastIcon,
            duration: 5000,
            action: newNotification.metadata?.account_id ? {
              label: 'View',
              onClick: () => {
                const section = document.getElementById('accounts-section');
                if (section) {
                  section.scrollIntoView({ behavior: 'smooth' });
                }
              }
            } : undefined,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refreshNotifications: fetchNotifications,
  };
}

function getNotificationIcon(type: string): string {
  switch (type) {
    case 'success': return '✅';
    case 'earning': return '💰';
    case 'warning': return '⚠️';
    case 'alert': return '🚨';
    case 'info': return '📊';
    case 'request': return '📨';
    default: return '🔔';
  }
}

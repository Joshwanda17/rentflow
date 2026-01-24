import { Bell, MessageCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface NotificationMetadata {
  account_id?: string;
  supporter_id?: string;
  supporter_name?: string;
  account_name?: string;
  rent_request_id?: string;
  user_id?: string;
  amount?: number;
  phone?: string;
  email?: string;
  full_name?: string;
  role?: string;
  deposit_request_id?: string;
  withdrawal_id?: string;
  mobile_money_number?: string;
}

// Notification types that should show Contact User button
const CONTACTABLE_NOTIFICATIONS = [
  'Password Reset',
  'New Deposit Request',
  'Withdrawal Request',
  'New Investment Request',
  'Rent Request',
  'New Rent Request',
];

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loadingContact, setLoadingContact] = useState<string | null>(null);
  const [userPhones, setUserPhones] = useState<Record<string, { phone: string; name: string }>>({});

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'earning': return '💰';
      case 'success': return '✅';
      case 'request': return '📨';
      case 'alert': return '⚠️';
      case 'warning': return '🔔';
      case 'investment_funding': return '💰';
      case 'info': return '🔑';
      default: return 'ℹ️';
    }
  };

  const fetchUserPhone = useCallback(async (userId: string): Promise<{ phone: string; name: string } | null> => {
    // Check cache first
    if (userPhones[userId]) {
      return userPhones[userId];
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('phone, full_name')
      .eq('id', userId)
      .single();

    if (error || !data?.phone) return null;

    const result = { phone: data.phone, name: data.full_name || '' };
    setUserPhones(prev => ({ ...prev, [userId]: result }));
    return result;
  }, [userPhones]);

  const handleContactWhatsApp = async (
    e: React.MouseEvent, 
    notificationId: string,
    metadata: NotificationMetadata | null,
    notificationTitle: string
  ) => {
    e.stopPropagation();
    
    // If we already have phone in metadata, use it directly
    if (metadata?.phone) {
      openWhatsApp(metadata.phone, metadata.full_name, notificationTitle);
      return;
    }

    // Otherwise fetch from user_id
    const userId = metadata?.user_id || metadata?.supporter_id;
    if (!userId) return;

    setLoadingContact(notificationId);
    try {
      const userInfo = await fetchUserPhone(userId);
      if (userInfo) {
        openWhatsApp(userInfo.phone, userInfo.name, notificationTitle);
      }
    } finally {
      setLoadingContact(null);
    }
  };

  const openWhatsApp = (phone: string, name?: string, title?: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    let messageText = `Hi ${name || 'there'}! `;
    
    if (title?.includes('Deposit')) {
      messageText += `I'm following up on your deposit request. How can I help you?`;
    } else if (title?.includes('Withdrawal')) {
      messageText += `I'm following up on your withdrawal request. How can I help you?`;
    } else if (title?.includes('Investment')) {
      messageText += `I'm following up on your investment request. How can I help you?`;
    } else if (title?.includes('Rent')) {
      messageText += `I'm following up on your rent request. How can I help you?`;
    } else {
      messageText += `I'm following up from Welile. How can I help you?`;
    }
    
    const message = encodeURIComponent(messageText);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const shouldShowContactButton = (title: string, metadata: NotificationMetadata | null): boolean => {
    // Check if notification title matches any contactable type
    const isContactable = CONTACTABLE_NOTIFICATIONS.some(type => title.includes(type));
    if (!isContactable) return false;
    
    // Must have either phone directly or user_id to fetch it
    return !!(metadata?.phone || metadata?.user_id || metadata?.supporter_id);
  };

  const handleNotificationClick = (notification: { 
    id: string; 
    read: boolean; 
    type: string; 
    title: string;
    metadata?: NotificationMetadata | null;
  }) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }

    const metadata = notification.metadata as NotificationMetadata | null;
    
    // Handle investment funding notification - navigate managers to investment accounts
    if (notification.type === 'investment_funding') {
      setOpen(false);
      navigate('/manager-access?tab=investments');
      return;
    }
    
    // Handle different notification types
    if (metadata?.account_id) {
      // Investment account related - scroll to accounts section
      setOpen(false);
      setTimeout(() => {
        const accountsSection = document.getElementById('accounts-section');
        if (accountsSection) {
          accountsSection.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else if (metadata?.rent_request_id) {
      // Rent request related - navigate to transactions
      setOpen(false);
      navigate('/transactions');
    } else if (notification.title.includes('Portfolio') || notification.type === 'earning') {
      // Portfolio related - scroll to portfolio section
      setOpen(false);
      setTimeout(() => {
        const portfolioSection = document.getElementById('portfolio-section');
        if (portfolioSection) {
          portfolioSection.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative h-11 w-11 min-w-[44px] min-h-[44px] text-white/90 hover:text-white hover:bg-white/15 rounded-xl touch-manipulation"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-0.5 -right-0.5 h-5 min-w-[20px] flex items-center justify-center px-1 text-xs font-bold bg-white text-primary animate-pulse"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 rounded-2xl border-2" align="end">
        <div className="flex items-center justify-between p-4 border-b bg-muted/30">
          <h4 className="font-bold text-lg">🔔 Notifications</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs font-semibold">
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {notifications.length === 0 ? (
            <div className="p-6 text-center">
              <span className="text-4xl mb-2 block">📭</span>
              <p className="text-muted-foreground font-medium">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const metadata = notification.metadata as NotificationMetadata | null;
                const showContact = shouldShowContactButton(notification.title, metadata);
                const isLoadingThisContact = loadingContact === notification.id;
                
                return (
                  <div
                    key={notification.id}
                    className={`p-4 cursor-pointer hover:bg-secondary/50 transition-colors touch-manipulation active:bg-secondary ${
                      !notification.read ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex gap-3">
                      <span className="text-2xl">{getTypeIcon(notification.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${!notification.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {notification.title}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1.5 font-medium">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </p>
                        
                        {/* Quick Contact Action for various notification types */}
                        {showContact && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 h-8 gap-1.5 text-xs"
                            disabled={isLoadingThisContact}
                            onClick={(e) => handleContactWhatsApp(e, notification.id, metadata, notification.title)}
                          >
                            {isLoadingThisContact ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <MessageCircle className="h-3.5 w-3.5" />
                            )}
                            Contact User
                          </Button>
                        )}
                      </div>
                      {!notification.read && (
                        <div className="w-2.5 h-2.5 bg-primary rounded-full mt-1.5 animate-pulse" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

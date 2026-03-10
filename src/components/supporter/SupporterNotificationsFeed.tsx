import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Bell, Check, ChevronDown, TrendingUp, Gift, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
}

const typeConfig: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  success: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  investment: { icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
  reward: { icon: Gift, color: 'text-amber-600', bg: 'bg-amber-500/10' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-500/10' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-500/10' },
  welcome: { icon: Bell, color: 'text-primary', bg: 'bg-primary/10' },
};

export function SupporterNotificationsFeed({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);

  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, title, message, type, is_read, created_at, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications((data as Notification[]) || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setNotifications(prev => [payload.new as Notification, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unread.length === 0) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  if (loading && notifications.length === 0) return null;
  if (notifications.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-border/60 shadow-sm hover:bg-accent/30 transition-colors touch-manipulation active:scale-[0.98]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center relative">
              <Bell className="h-4.5 w-4.5 text-primary" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[9px] font-bold text-destructive-foreground flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <div className="text-left">
              <span className="font-bold text-sm text-foreground">Notifications</span>
              <p className="text-[10px] text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up ✨'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                {unreadCount}
              </Badge>
            )}
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-2 space-y-1.5">
          {unreadCount > 0 && (
            <div className="flex justify-end px-1 pb-1">
              <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-muted-foreground" onClick={(e) => { e.stopPropagation(); markAllRead(); }}>
                <Check className="h-3 w-3" />
                Mark all read
              </Button>
            </div>
          )}
          {notifications.slice(0, 20).map(n => {
            const config = typeConfig[n.type] || typeConfig.info;
            const Icon = config.icon;
            return (
              <button
                key={n.id}
                onClick={() => !n.is_read && markAsRead(n.id)}
                className={cn(
                  "w-full text-left px-3 py-3 rounded-xl border transition-colors touch-manipulation",
                  n.is_read
                    ? "bg-card/50 border-border/40 opacity-70"
                    : "bg-card border-border/60 shadow-sm"
                )}
              >
                <div className="flex gap-2.5">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", config.bg)}>
                    <Icon className={cn("h-4 w-4", config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("text-sm font-semibold leading-tight", !n.is_read && "text-foreground")}>
                        {n.title}
                      </p>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line line-clamp-3">
                      {n.message}
                    </p>
                    {n.created_at && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

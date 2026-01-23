import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

/**
 * Listens for force refresh signals from managers and reloads the app
 */
export function useForceRefresh() {
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    // Check for any pending refresh signals on load
    const checkPendingSignals = async () => {
      const { data } = await supabase
        .from('force_refresh_signals')
        .select('id, message, triggered_at')
        .or(`target_user_id.eq.${user.id},target_user_id.is.null`)
        .gt('expires_at', new Date().toISOString())
        .order('triggered_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const signal = data[0];
        const lastRefreshKey = `force_refresh_${signal.id}`;
        
        // Check if we already processed this signal
        if (!localStorage.getItem(lastRefreshKey)) {
          localStorage.setItem(lastRefreshKey, 'true');
          
          toast({
            title: '🔄 Updating App...',
            description: signal.message || 'A new version is being loaded.',
          });

          // Clear all caches
          if ('caches' in window) {
            caches.keys().then(names => {
              names.forEach(name => caches.delete(name));
            });
          }

          // Force reload after short delay
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        }
      }
    };

    checkPendingSignals();

    // Subscribe to new refresh signals in realtime
    const channel = supabase
      .channel('force-refresh')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'force_refresh_signals',
        },
        (payload) => {
          const signal = payload.new as { 
            id: string; 
            target_user_id: string | null; 
            message: string | null;
          };

          // Check if this signal is for us (null = everyone, or specific to us)
          if (signal.target_user_id === null || signal.target_user_id === user.id) {
            const lastRefreshKey = `force_refresh_${signal.id}`;
            
            if (!localStorage.getItem(lastRefreshKey)) {
              localStorage.setItem(lastRefreshKey, 'true');
              
              toast({
                title: '🔄 App Update',
                description: signal.message || 'Refreshing to get the latest version...',
              });

              // Clear caches
              if ('caches' in window) {
                caches.keys().then(names => {
                  names.forEach(name => caches.delete(name));
                });
              }

              // Force reload
              setTimeout(() => {
                window.location.reload();
              }, 1500);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast]);
}

export default useForceRefresh;

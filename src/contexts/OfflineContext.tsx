import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { 
  getSyncQueue, 
  removeFromSyncQueue, 
  updateSyncQueueItem,
  clearAllOfflineData
} from '@/lib/offlineDataStorage';
import { supabase } from '@/integrations/supabase/client';

interface OfflineContextType {
  isOnline: boolean;
  isSlowConnection: boolean;
  pendingSyncCount: number;
  lastSyncTime: Date | null;
  syncNow: () => Promise<void>;
  clearOfflineData: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const syncInProgress = useRef(false);
  const reconnectToastShown = useRef(false);

  // Check connection quality
  const checkConnectionQuality = useCallback(() => {
    const connection = (navigator as any).connection;
    if (connection) {
      const isSlow = 
        connection.effectiveType === '2g' || 
        connection.effectiveType === 'slow-2g' ||
        connection.saveData === true;
      setIsSlowConnection(isSlow);
    }
  }, []);

  // Sync pending changes when online
  const syncNow = useCallback(async () => {
    if (!isOnline || syncInProgress.current) return;
    
    syncInProgress.current = true;
    
    try {
      const queue = await getSyncQueue();
      setPendingSyncCount(queue.length);
      
      if (queue.length === 0) {
        syncInProgress.current = false;
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const item of queue) {
        try {
          // Process based on type and table using raw fetch for dynamic tables
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          
          const { data: { session } } = await supabase.auth.getSession();
          const authHeader = session?.access_token 
            ? { 'Authorization': `Bearer ${session.access_token}` }
            : {};

          let response: Response;
          
          if (item.type === 'create') {
            response = await fetch(`${supabaseUrl}/rest/v1/${item.table}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                ...authHeader,
              },
              body: JSON.stringify(item.data),
            });
          } else if (item.type === 'update') {
            response = await fetch(`${supabaseUrl}/rest/v1/${item.table}?id=eq.${item.data.id}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                ...authHeader,
              },
              body: JSON.stringify(item.data),
            });
          } else if (item.type === 'delete') {
            response = await fetch(`${supabaseUrl}/rest/v1/${item.table}?id=eq.${item.data.id}`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                ...authHeader,
              },
            });
          } else {
            throw new Error(`Unknown sync type: ${item.type}`);
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
          }

          await removeFromSyncQueue(item.id);
          successCount++;
        } catch (error) {
          console.error('[OfflineSync] Failed to sync item:', item.id, error);
          
          // Increment retry count
          if (item.retryCount < 3) {
            await updateSyncQueueItem(item.id, { retryCount: item.retryCount + 1 });
          } else {
            // Remove after 3 failed attempts
            await removeFromSyncQueue(item.id);
          }
          failCount++;
        }
      }

      // Update pending count
      const remainingQueue = await getSyncQueue();
      setPendingSyncCount(remainingQueue.length);
      setLastSyncTime(new Date());

      if (successCount > 0) {
        toast.success(`Synced ${successCount} change${successCount > 1 ? 's' : ''}`);
      }
      if (failCount > 0) {
        toast.error(`Failed to sync ${failCount} change${failCount > 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error('[OfflineSync] Sync failed:', error);
    } finally {
      syncInProgress.current = false;
    }
  }, [isOnline]);

  const handleClearOfflineData = useCallback(async () => {
    await clearAllOfflineData();
    setPendingSyncCount(0);
    setLastSyncTime(null);
  }, []);

  // Online/offline handlers
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (!reconnectToastShown.current) {
        toast.success('Back online!', {
          description: 'Syncing your changes...',
          duration: 3000,
        });
        reconnectToastShown.current = true;
        setTimeout(() => { reconnectToastShown.current = false; }, 5000);
      }
      checkConnectionQuality();
      // Auto-sync when back online
      syncNow();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('You\'re offline', {
        description: 'Changes will sync when you\'re back online.',
        duration: 5000,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for connection changes
    const connection = (navigator as any).connection;
    if (connection) {
      connection.addEventListener('change', checkConnectionQuality);
    }

    // Initial check
    checkConnectionQuality();

    // DEFERRED: Load pending sync count after first paint
    const loadQueue = () => getSyncQueue().then(queue => setPendingSyncCount(queue.length));
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(loadQueue, { timeout: 3000 });
    } else {
      setTimeout(loadQueue, 1000);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener('change', checkConnectionQuality);
      }
    };
  }, [checkConnectionQuality, syncNow]);

  // Auto-sync periodically when online
  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(syncNow, 30000); // Sync every 30 seconds
    return () => clearInterval(interval);
  }, [isOnline, syncNow]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isSlowConnection,
        pendingSyncCount,
        lastSyncTime,
        syncNow,
        clearOfflineData: handleClearOfflineData,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

// Safe fallback defaults when provider hasn't loaded yet (deferred/lazy load)
const offlineFallback: OfflineContextType = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSlowConnection: false,
  pendingSyncCount: 0,
  lastSyncTime: null,
  syncNow: async () => {},
  clearOfflineData: async () => {},
};

export function useOffline() {
  const context = useContext(OfflineContext);
  // Return safe defaults if provider hasn't loaded yet (deferred loading)
  return context ?? offlineFallback;
}

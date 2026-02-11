/**
 * TEMPORARY: Disables ALL Supabase realtime subscriptions globally
 * by monkey-patching supabase.channel() to return a no-op channel.
 * 
 * This frees up database connections when the connection pool is saturated.
 * 
 * To re-enable realtime: simply remove the import of this file from App.tsx
 * or set REALTIME_DISABLED to false.
 */
import { supabase } from '@/integrations/supabase/client';

const REALTIME_DISABLED = false;

if (REALTIME_DISABLED) {
  const noopChannel: any = {
    on: () => noopChannel,
    subscribe: () => noopChannel,
    unsubscribe: () => {},
    send: () => Promise.resolve('ok'),
    track: () => Promise.resolve('ok'),
    untrack: () => Promise.resolve('ok'),
    presenceState: () => ({}),
  };

  // Patch the channel method to return no-op
  (supabase as any).channel = () => noopChannel;
  
  // Patch removeChannel to be a no-op too
  (supabase as any).removeChannel = () => {};

  console.log('[Realtime] ⚠️ ALL realtime subscriptions DISABLED to free database connections');
}

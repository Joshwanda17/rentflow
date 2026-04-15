import { supabase } from '@/integrations/supabase/client';

let cachedCfoIds: string[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch all user IDs that hold the 'cfo' role.
 * Cached for 5 minutes to avoid repeated queries.
 */
export async function getCfoUserIds(): Promise<string[]> {
  if (cachedCfoIds && Date.now() - cacheTime < CACHE_TTL) {
    return cachedCfoIds;
  }
  const { data } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'cfo');
  cachedCfoIds = (data || []).map(r => r.user_id);
  cacheTime = Date.now();
  return cachedCfoIds;
}

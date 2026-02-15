import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface UserStats {
  tenantsRegistered: number;
  landlordsRegistered: number;
  subAgentsRecruited: number;
  supportersRegistered: number;
  tenantsEarningFrom: number;
  roles: string[];
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const statsCache = new Map<string, { data: UserStats; fetchedAt: number }>();

function getCached(userId: string): UserStats | null {
  const entry = statsCache.get(userId);
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) return entry.data;
  return null;
}

export function useUserStats(userId: string | undefined) {
  const [stats, setStats] = useState<UserStats>(() => {
    if (userId) {
      const cached = getCached(userId);
      if (cached) return cached;
    }
    return { tenantsRegistered: 0, landlordsRegistered: 0, subAgentsRecruited: 0, supportersRegistered: 0, tenantsEarningFrom: 0, roles: [] };
  });
  const [loading, setLoading] = useState(() => !(userId && getCached(userId)));

  const fetchStats = useCallback(async () => {
    if (!userId) return;

    // Check cache first
    const cached = getCached(userId);
    if (cached) {
      setStats(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [
        tenantsResult, landlordsResult, subAgentsResult,
        supportersResult, earningTenantsResult, rolesResult,
      ] = await Promise.all([
        supabase.from('supporter_invites').select('id', { count: 'exact', head: true }).eq('created_by', userId).eq('role', 'tenant').eq('status', 'activated'),
        supabase.from('supporter_invites').select('id', { count: 'exact', head: true }).eq('created_by', userId).eq('role', 'landlord').eq('status', 'activated'),
        supabase.from('agent_subagents').select('id', { count: 'exact', head: true }).eq('parent_agent_id', userId),
        supabase.from('supporter_invites').select('id', { count: 'exact', head: true }).eq('created_by', userId).eq('role', 'supporter').eq('status', 'activated'),
        supabase.from('agent_earnings').select('source_user_id').eq('agent_id', userId).eq('earning_type', 'commission').not('source_user_id', 'is', null),
        supabase.from('user_roles').select('role').eq('user_id', userId).eq('enabled', true),
      ]);

      const uniqueEarningTenants = new Set((earningTenantsResult.data || []).map(e => e.source_user_id));
      const result: UserStats = {
        tenantsRegistered: tenantsResult.count || 0,
        landlordsRegistered: landlordsResult.count || 0,
        subAgentsRecruited: subAgentsResult.count || 0,
        supportersRegistered: supportersResult.count || 0,
        tenantsEarningFrom: uniqueEarningTenants.size,
        roles: (rolesResult.data || []).map(r => r.role),
      };

      statsCache.set(userId, { data: result, fetchedAt: Date.now() });
      setStats(result);
    } catch (error) {
      console.error('[useUserStats] Error:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}

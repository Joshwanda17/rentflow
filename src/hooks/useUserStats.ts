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

export function useUserStats(userId: string | undefined) {
  const [stats, setStats] = useState<UserStats>({
    tenantsRegistered: 0,
    landlordsRegistered: 0,
    subAgentsRecruited: 0,
    supportersRegistered: 0,
    tenantsEarningFrom: 0,
    roles: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    try {
      const [
        tenantsResult,
        landlordsResult,
        subAgentsResult,
        supportersResult,
        earningTenantsResult,
        rolesResult,
      ] = await Promise.all([
        // Tenants registered by this user (via supporter_invites)
        supabase
          .from('supporter_invites')
          .select('id', { count: 'exact', head: true })
          .eq('created_by', userId)
          .eq('role', 'tenant')
          .eq('status', 'activated'),

        // Landlords registered by this user (via supporter_invites)
        supabase
          .from('supporter_invites')
          .select('id', { count: 'exact', head: true })
          .eq('created_by', userId)
          .eq('role', 'landlord')
          .eq('status', 'activated'),

        // Sub-agents recruited
        supabase
          .from('agent_subagents')
          .select('id', { count: 'exact', head: true })
          .eq('parent_agent_id', userId),

        // Supporters registered (via supporter_invites with supporter role)
        supabase
          .from('supporter_invites')
          .select('id', { count: 'exact', head: true })
          .eq('created_by', userId)
          .eq('role', 'supporter')
          .eq('status', 'activated'),

        // Tenants earning from (distinct source_user_id in agent_earnings)
        supabase
          .from('agent_earnings')
          .select('source_user_id')
          .eq('agent_id', userId)
          .eq('earning_type', 'commission')
          .not('source_user_id', 'is', null),

        // User roles
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .eq('enabled', true),
      ]);

      // Count distinct source users for earning tenants
      const uniqueEarningTenants = new Set(
        (earningTenantsResult.data || []).map(e => e.source_user_id)
      );

      setStats({
        tenantsRegistered: tenantsResult.count || 0,
        landlordsRegistered: landlordsResult.count || 0,
        subAgentsRecruited: subAgentsResult.count || 0,
        supportersRegistered: supportersResult.count || 0,
        tenantsEarningFrom: uniqueEarningTenants.size,
        roles: (rolesResult.data || []).map(r => r.role),
      });
    } catch (error) {
      console.error('[useUserStats] Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}

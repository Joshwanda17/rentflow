import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MISSION_ALL_KEY, monthKey, type DashboardMission } from '@/lib/dashboardMissions';

function normalize(row: any): DashboardMission | null {
  if (!row) return null;
  let goals: string[] = [];
  if (Array.isArray(row.goals)) goals = row.goals.filter((g: unknown) => typeof g === 'string' && g.trim());
  return {
    id: row.id,
    dashboard_role: row.dashboard_role,
    period_month: row.period_month,
    mission: row.mission ?? null,
    goals,
    is_active: !!row.is_active,
    updated_at: row.updated_at,
  };
}

/**
 * Returns the active mission for the given dashboard for the current month.
 * Falls back to the company-wide ("all") mission when no role-specific one is set.
 */
export function useDashboardMission(dashboardRole: string | undefined) {
  const month = monthKey();
  return useQuery({
    queryKey: ['dashboard-mission', dashboardRole, month],
    enabled: !!dashboardRole,
    staleTime: 300000,
    queryFn: async (): Promise<DashboardMission | null> => {
      const roles = dashboardRole === MISSION_ALL_KEY
        ? [MISSION_ALL_KEY]
        : [dashboardRole as string, MISSION_ALL_KEY];
      const { data, error } = await supabase
        .from('dashboard_missions')
        .select('*')
        .in('dashboard_role', roles)
        .eq('period_month', month)
        .eq('is_active', true);
      if (error) throw error;
      const rows = (data || []).map(normalize).filter(Boolean) as DashboardMission[];
      // Prefer the role-specific mission; fall back to company-wide.
      const specific = rows.find((r) => r.dashboard_role === dashboardRole);
      const fallback = rows.find((r) => r.dashboard_role === MISSION_ALL_KEY);
      return specific || fallback || null;
    },
  });
}
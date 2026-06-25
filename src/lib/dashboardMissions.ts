/**
 * Shared definitions for the monthly Mission & Goals system.
 *
 * The CEO authors a mission + goals per dashboard, per month. Every operator
 * and executive dashboard then surfaces the active mission for its own role,
 * falling back to a company-wide "all" mission when no role-specific one exists.
 */

export interface DashboardMissionTarget {
  /** Stored value in dashboard_missions.dashboard_role */
  key: string;
  label: string;
  /** Short helper describing who sees it */
  audience: string;
}

/** Company-wide fallback key. */
export const MISSION_ALL_KEY = 'all';

/**
 * Dashboards the CEO can target. The executive keys (ceo, coo, cfo, ...) match
 * the `role` prop passed to ExecutiveDashboardLayout; the operator keys match
 * the role used by the operator dashboards.
 */
export const MISSION_DASHBOARDS: DashboardMissionTarget[] = [
  { key: MISSION_ALL_KEY, label: 'Company-wide (all dashboards)', audience: 'Everyone — used as a fallback when a dashboard has no specific mission' },
  { key: 'ceo', label: 'CEO', audience: 'Chief Executive' },
  { key: 'coo', label: 'COO', audience: 'Operations leadership' },
  { key: 'cfo', label: 'CFO', audience: 'Finance leadership' },
  { key: 'cto', label: 'CTO', audience: 'Technology leadership' },
  { key: 'cmo', label: 'CMO', audience: 'Marketing leadership' },
  { key: 'crm', label: 'CRM', audience: 'Customer relations team' },
  { key: 'hr', label: 'HR', audience: 'People & culture team' },
  { key: 'operations', label: 'Operations', audience: 'Operations staff' },
  { key: 'manager', label: 'Manager / Admin', audience: 'Managers & admins' },
  { key: 'agent', label: 'Agent', audience: 'Field agents' },
  { key: 'tenant', label: 'Tenant', audience: 'Tenants' },
  { key: 'landlord', label: 'Landlord', audience: 'Landlords' },
  { key: 'supporter', label: 'Supporter', audience: 'Supporters / partners' },
];

export function missionDashboardLabel(key: string): string {
  return MISSION_DASHBOARDS.find((d) => d.key === key)?.label ?? key;
}

/** First day of a month as `YYYY-MM-01` (local time). */
export function monthKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/** Human label for a `YYYY-MM-01` month key, e.g. "June 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Build a list of selectable months (current + previous/next few). */
export function buildMonthOptions(back = 2, forward = 3): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = -back; i <= forward; i++) {
    out.push(monthKey(new Date(now.getFullYear(), now.getMonth() + i, 1)));
  }
  return out;
}

export interface DashboardMission {
  id: string;
  dashboard_role: string;
  period_month: string;
  mission: string | null;
  goals: string[];
  is_active: boolean;
  updated_at: string;
}
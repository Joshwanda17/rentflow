import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { Eye, MousePointerClick, Lock, Wallet } from 'lucide-react';
import { subDays } from 'date-fns';

const STEPS = [
  { key: 'funder_house_repayment_terms_viewed', label: 'Viewed repayment terms', icon: Eye, color: 'bg-primary/10 text-primary' },
  { key: 'funder_house_selected', label: 'Selected a house', icon: MousePointerClick, color: 'bg-blue-500/10 text-blue-600' },
  { key: 'funder_selection_locked', label: 'Locked selection', icon: Lock, color: 'bg-amber-500/10 text-amber-600' },
  { key: 'funder_funding_started', label: 'Started funding', icon: Wallet, color: 'bg-emerald-500/10 text-emerald-600' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

type FunnelData = {
  events: Record<StepKey, number>;
  users: Record<StepKey, number>;
  /** Funders who viewed terms and later reached the given step. */
  progressed: Record<StepKey, number>;
};

const WINDOW_DAYS = 30;

export function FunderFunnelPanel() {
  const { data, isLoading } = useQuery<FunnelData>({
    queryKey: ['exec-funder-funnel-panel', WINDOW_DAYS],
    staleTime: 300_000,
    queryFn: async () => {
      const since = subDays(new Date(), WINDOW_DAYS).toISOString();
      const { data: rows, error } = await supabase
        .from('system_events')
        .select('event_type, user_id, created_at')
        .in('event_type', STEPS.map((s) => s.key))
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(20000);
      if (error) throw error;

      const events = {} as Record<StepKey, number>;
      const userSets = {} as Record<StepKey, Set<string>>;
      STEPS.forEach((s) => {
        events[s.key] = 0;
        userSets[s.key] = new Set<string>();
      });

      // First "viewed terms" timestamp per funder — later steps only count as
      // progression if they happen at or after that first view.
      const firstView: Record<string, string> = {};
      (rows || []).forEach((r: any) => {
        if (r.event_type === 'funder_house_repayment_terms_viewed' && r.user_id && !firstView[r.user_id]) {
          firstView[r.user_id] = r.created_at;
        }
      });

      const progressedSets = {} as Record<StepKey, Set<string>>;
      STEPS.forEach((s) => { progressedSets[s.key] = new Set<string>(); });

      (rows || []).forEach((r: any) => {
        const key = r.event_type as StepKey;
        if (!(key in events)) return;
        events[key]++;
        if (!r.user_id) return;
        userSets[key].add(r.user_id);
        const fv = firstView[r.user_id];
        if (fv && r.created_at >= fv) progressedSets[key].add(r.user_id);
      });

      const users = {} as Record<StepKey, number>;
      const progressed = {} as Record<StepKey, number>;
      STEPS.forEach((s) => {
        users[s.key] = userSets[s.key].size;
        progressed[s.key] = progressedSets[s.key].size;
      });

      return { events, users, progressed };
    },
  });

  const base = data?.progressed.funder_house_repayment_terms_viewed ?? 0;
  const pct = (n: number) => (base > 0 ? Math.round((n / base) * 100) : 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Funder conversion funnel</h3>
        <p className="text-[11px] text-muted-foreground">
          Funders who opened “View repayment terms” and how far they went — last {WINDOW_DAYS} days.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {STEPS.map((s) => (
          <KPICard
            key={s.key}
            title={s.label}
            value={(data?.progressed[s.key] ?? 0).toLocaleString()}
            icon={s.icon}
            color={s.color}
            loading={isLoading}
            subtitle={
              s.key === 'funder_house_repayment_terms_viewed'
                ? `${(data?.events[s.key] ?? 0).toLocaleString()} clicks`
                : `${pct(data?.progressed[s.key] ?? 0)}% of viewers`
            }
          />
        ))}
      </div>

      <div className="space-y-2">
        {STEPS.map((s, i) => {
          const value = data?.progressed[s.key] ?? 0;
          const width = base > 0 ? Math.max(4, (value / base) * 100) : 0;
          const prev = i === 0 ? null : data?.progressed[STEPS[i - 1].key] ?? 0;
          const dropOff = prev && prev > 0 ? Math.round(((prev - value) / prev) * 100) : 0;
          return (
            <div key={s.key} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium">{s.label}</span>
                <span className="text-muted-foreground">
                  {value.toLocaleString()} funder{value === 1 ? '' : 's'} · {pct(value)}%
                  {i > 0 && dropOff > 0 && (
                    <span className="text-destructive"> · −{dropOff}% vs previous</span>
                  )}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground">
        A funder counts at a step only if the action happened at or after their first
        “View repayment terms” click, so the funnel measures true progression.
      </p>
    </div>
  );
}

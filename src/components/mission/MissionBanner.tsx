import { Target, Sparkles, CheckCircle2 } from 'lucide-react';
import { useDashboardMission } from '@/hooks/useDashboardMission';
import { monthLabel, monthKey } from '@/lib/dashboardMissions';
import { cn } from '@/lib/utils';

interface MissionBannerProps {
  /** Dashboard role key, e.g. 'ceo', 'agent', 'tenant'. */
  dashboardRole: string;
  className?: string;
}

/**
 * Prominent monthly Mission & Goals banner authored by the CEO.
 * Rendered at the top of every operator and executive dashboard.
 * Renders nothing until a mission for the current month exists.
 */
export function MissionBanner({ dashboardRole, className }: MissionBannerProps) {
  const { data: mission } = useDashboardMission(dashboardRole);

  if (!mission || (!mission.mission && mission.goals.length === 0)) return null;

  return (
    <section
      aria-label="Monthly mission and goals"
      className={cn(
        'relative overflow-hidden rounded-2xl border border-primary/30 shadow-sm',
        'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent',
        className,
      )}
    >
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/10 blur-2xl" aria-hidden />
      <div className="relative p-4 sm:p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
            <Target className="h-3 w-3" />
            Mission this month
          </span>
          <span className="text-[11px] font-semibold text-muted-foreground">
            {monthLabel(mission.period_month || monthKey())}
          </span>
        </div>

        {mission.mission && (
          <p className="mt-3 text-sm sm:text-base font-semibold leading-relaxed text-foreground">
            {mission.mission}
          </p>
        )}

        {mission.goals.length > 0 && (
          <div className="mt-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Goals
            </p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {mission.goals.map((g, i) => (
                <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-foreground/90">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="leading-snug">{g}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
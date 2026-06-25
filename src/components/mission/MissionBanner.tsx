import { Target, Sparkles } from 'lucide-react';
import { useDashboardMission } from '@/hooks/useDashboardMission';
import { monthLabel, monthKey, missionFontStack } from '@/lib/dashboardMissions';
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

  const fontStack = missionFontStack(mission.font_family);

  return (
    <section
      aria-label="Monthly mission and goals"
      className={cn(
        'group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-primary/40 shadow-lg',
        'bg-gradient-to-br from-primary via-primary/90 to-primary/70 text-primary-foreground',
        className,
      )}
    >
      {/* Decorative glows */}
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-primary-foreground/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-primary-foreground/10 blur-3xl" aria-hidden />
      {/* Subtle moving shimmer */}
      <div
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary-foreground/15 to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-full"
        aria-hidden
      />

      <div className="relative p-4 sm:p-7">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/20 px-2.5 py-1 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.12em] sm:tracking-[0.18em] backdrop-blur-sm">
            <Target className="h-3.5 w-3.5" />
            Mission this month
          </span>
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wide text-primary-foreground/80">
            {monthLabel(mission.period_month || monthKey())}
          </span>
        </div>

        {mission.mission && (
          <p
            className="mt-3 sm:mt-4 text-base sm:text-2xl font-extrabold leading-snug tracking-tight drop-shadow-sm [text-wrap:balance]"
            style={fontStack ? { fontFamily: fontStack } : undefined}
          >
            {mission.mission}
          </p>
        )}

        {mission.goals.length > 0 && (
          <div className="mt-4 sm:mt-5">
            <p className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.12em] sm:tracking-[0.18em] text-primary-foreground/85">
              <Sparkles className="h-4 w-4" />
              Goals
            </p>
            <ul className="mt-2.5 sm:mt-3 grid gap-2 sm:gap-2.5 sm:grid-cols-2">
              {mission.goals.map((g, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 sm:gap-2.5 rounded-xl bg-primary-foreground/10 px-2.5 py-2 sm:px-3 sm:py-2.5 backdrop-blur-sm ring-1 ring-primary-foreground/10"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-foreground/25 text-[11px] font-extrabold">
                    {i + 1}
                  </span>
                  <span className="text-[13px] sm:text-sm font-medium leading-snug text-primary-foreground/95">{g}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
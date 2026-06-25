import { Target, Sparkles } from 'lucide-react';
import { useDashboardMission } from '@/hooks/useDashboardMission';
import { monthLabel, monthKey, missionFontStack } from '@/lib/dashboardMissions';
import { cn } from '@/lib/utils';

/** Minimal shape the banner needs to render — used for live previews of unsaved drafts. */
export interface MissionBannerData {
  mission: string | null;
  goals: string[];
  font_family?: string | null;
  period_month?: string | null;
  posted_by_name?: string | null;
}

interface MissionBannerProps {
  /** Dashboard role key, e.g. 'ceo', 'agent', 'tenant'. */
  dashboardRole: string;
  className?: string;
  /**
   * When provided, the banner renders this data instead of fetching from the
   * database. Used by the editor's live preview to show unsaved changes.
   */
  missionOverride?: MissionBannerData | null;
}

/**
 * Prominent monthly Mission & Goals banner authored by the CEO.
 * Rendered at the top of every operator and executive dashboard.
 * Renders nothing until a mission for the current month exists.
 */
export function MissionBanner({ dashboardRole, className, missionOverride }: MissionBannerProps) {
  const { data: fetched } = useDashboardMission(dashboardRole);
  const mission = missionOverride !== undefined ? missionOverride : fetched;

  if (!mission || (!mission.mission && mission.goals.length === 0)) return null;

  const fontStack = missionFontStack(mission.font_family);

  return (
    <section
      aria-label="Monthly mission and goals"
      className={cn(
        'group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-purple-400/40 shadow-lg',
        'bg-gradient-to-br from-purple-700 via-purple-600 to-purple-500 text-white',
        className,
      )}
    >
      {/* Decorative glows */}
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-white/10 blur-3xl" aria-hidden />
      {/* Subtle moving shimmer */}
      <div
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-full"
        aria-hidden
      />

      <div className="relative p-4 sm:p-7">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.12em] sm:tracking-[0.18em] backdrop-blur-sm">
            <Target className="h-3.5 w-3.5" />
            Mission this month
          </span>
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wide text-white/80">
            {monthLabel(mission.period_month || monthKey())}
          </span>
        </div>

        {mission.mission && (
          <p
            className="mt-3 sm:mt-4 text-lg sm:text-3xl font-bold leading-relaxed sm:leading-snug tracking-normal drop-shadow-sm [text-wrap:balance]"
            style={{ fontFamily: fontStack }}
          >
            {mission.mission}
          </p>
        )}

        {mission.goals.length > 0 && (
          <div className="mt-4 sm:mt-5">
            <p className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.12em] sm:tracking-[0.18em] text-white/85">
              <Sparkles className="h-4 w-4" />
              Goals
            </p>
            <ul className="mt-2.5 sm:mt-3 grid gap-2 sm:gap-2.5 sm:grid-cols-2">
              {mission.goals.map((g, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 sm:gap-2.5 rounded-xl bg-white/10 px-2.5 py-2 sm:px-3 sm:py-2.5 backdrop-blur-sm ring-1 ring-white/10"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/25 text-[11px] font-extrabold">
                    {i + 1}
                  </span>
                  <span className="text-sm sm:text-base font-semibold leading-relaxed text-white/95">{g}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
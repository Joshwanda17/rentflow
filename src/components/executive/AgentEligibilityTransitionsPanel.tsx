import { useMemo, useState } from 'react';
import { History, ArrowUpRight, ArrowDownRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  useAgentEligibilityTransitions,
  RATING_TONE,
  type EligibilityRating,
} from '@/hooks/useAgentEligibilityHistory';
import { formatUGX } from '@/lib/rentCalculations';

/**
 * Fleet-wide eligibility transitions feed: every time an agent moved between
 * Very Bad / Bad / Fair / Good / Very Good states in the last 90 days.
 * Most-recent first, filterable by agent name/phone and direction.
 */
export function AgentEligibilityTransitionsPanel({
  days = 90,
  defaultLimit = 25,
}: { days?: number; defaultLimit?: number }) {
  const [search, setSearch] = useState('');
  const [dir, setDir] = useState<'all' | 'up' | 'down'>('all');
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading } = useAgentEligibilityTransitions(days, 500);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data || []).filter((t) => {
      if (dir !== 'all' && t.direction !== dir) return false;
      if (!term) return true;
      return (
        t.agent_name.toLowerCase().includes(term) ||
        (t.agent_phone || '').toLowerCase().includes(term)
      );
    });
  }, [data, search, dir]);

  const visible = showAll ? filtered : filtered.slice(0, defaultLimit);

  const upCount = (data || []).filter(t => t.direction === 'up').length;
  const downCount = (data || []).filter(t => t.direction === 'down').length;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-3 sm:p-4 bg-gradient-to-br from-violet-500/10 via-primary/5 to-transparent border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-violet-500/15 flex items-center justify-center">
            <History className="h-4 w-4 text-violet-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-base font-bold text-foreground leading-tight">
              Eligibility Rating Transitions
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Every time an agent moved between Very Bad / Bad / Fair / Good / Very Good — last {days} days
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <Stat label="Total changes" value={(data || []).length} tone="text-violet-600" />
          <Stat label="Upgrades" value={upCount} tone="text-emerald-600" />
          <Stat label="Downgrades" value={downCount} tone="text-destructive" />
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search agent name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(['all','up','down'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDir(d)}
                className={`h-9 px-2.5 rounded-lg border text-xs font-semibold capitalize ${
                  dir === d
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-muted'
                }`}
              >
                {d === 'all' ? 'All' : d === 'up' ? '↑ Up' : '↓ Down'}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            Loading transitions…
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            No rating transitions in this window yet. (First snapshot lands tomorrow at 00:30 UTC; backfill covers prior days where data is available.)
          </div>
        ) : (
          <ul className="space-y-1.5">
            {visible.map((t, i) => (
              <li
                key={`${t.agent_id}-${t.day}-${i}`}
                className="rounded-xl border border-border bg-background p-2.5 flex items-center gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate text-foreground">{t.agent_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate tabular-nums">
                    {t.day} · {t.agent_phone || '—'} · {formatUGX(t.paid)} of {formatUGX(t.expected_daily)} ({Math.round(t.ratio * 100)}%)
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${RATING_TONE[t.previous_rating as EligibilityRating]}`}>
                    {t.previous_rating}
                  </span>
                  {t.direction === 'up'
                    ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                    : <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${RATING_TONE[t.rating as EligibilityRating]}`}>
                    {t.rating}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {filtered.length > defaultLimit && (
          <button
            type="button"
            onClick={() => setShowAll(v => !v)}
            className="w-full text-xs font-semibold text-primary py-2 hover:underline"
          >
            {showAll ? 'Show fewer' : `Show all ${filtered.length.toLocaleString()} transitions`}
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/70 p-2.5">
      <div className={`text-[10px] font-semibold uppercase tracking-wide ${tone}`}>{label}</div>
      <div className="mt-0.5 text-sm font-extrabold tabular-nums text-foreground">{value.toLocaleString()}</div>
    </div>
  );
}

export default AgentEligibilityTransitionsPanel;
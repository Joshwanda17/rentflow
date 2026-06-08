import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { HelpCircle, CheckCircle2, Calendar, Users, TrendingUp } from 'lucide-react';
import type { AgentCapacity } from '@/hooks/useAgentCapacityMap';

const TIER_RANGE: Record<AgentCapacity['tier'], string> = {
  Positive:   '≥ 70% of tenants paying daily',
  Fair:       '40–69% of tenants paying daily',
  Bad:        '10–39% of tenants paying daily',
  'Very Bad': '< 10% of tenants paying daily',
  Starter:    'No active rents yet',
};

const TIER_TONE: Record<AgentCapacity['tier'], string> = {
  Positive:   'text-emerald-700 bg-emerald-50 border-emerald-200',
  Fair:       'text-amber-700 bg-amber-50 border-amber-200',
  Bad:        'text-orange-700 bg-orange-50 border-orange-200',
  'Very Bad': 'text-destructive bg-destructive/5 border-destructive/20',
  Starter:    'text-violet-700 bg-violet-50 border-violet-200',
};

/**
 * "How to improve your 7-day rating?" — explains, in plain language, the
 * concrete actions an agent can take to lift their 7-day responsiveness tier.
 * The 7-day tier measures DAILY RESPONSE RATE: how many of your tenants made
 * at least one payment on each of the last 7 days — not the amount collected.
 */
export function Improve7DayRatingPopover({
  capacity,
  className,
}: {
  capacity: AgentCapacity;
  className?: string;
}) {
  const pct = Math.round((capacity.response_rate || 0) * 100);
  const tone = TIER_TONE[capacity.tier];
  const range = TIER_RANGE[capacity.tier];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center h-5 w-5 rounded-full border border-border bg-background hover:bg-muted transition-colors ${className || ''}`}
          aria-label="How to improve your 7-day rating?"
          title="How to improve your 7-day rating?"
          onClick={(e) => e.stopPropagation()}
        >
          <HelpCircle className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-2.5" align="end" sideOffset={4}>
        <p className="text-xs font-bold text-foreground">Improve your 7-day rating</p>

        <p className="text-[11px] text-muted-foreground leading-snug">
          This rating measures how many of your tenants pay
          <strong className="text-foreground"> something every day</strong> — not the
          amount. Even a small daily payment counts.
        </p>

        <div className={`rounded-md border px-2 py-1.5 flex items-center justify-between text-[11px] ${tone}`}>
          <span className="font-bold">Now: {capacity.tier} · {pct}%</span>
          <span className="tabular-nums text-right">{range}</span>
        </div>

        <ul className="space-y-1.5">
          <li className="flex items-start gap-2 text-[11px] text-foreground">
            <Calendar className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <span>Visit or call each tenant <strong>daily</strong> so every tenant pays at least once a day.</span>
          </li>
          <li className="flex items-start gap-2 text-[11px] text-foreground">
            <Users className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <span>Follow up first with tenants who <strong>missed yesterday</strong> — one missed day lowers your rate.</span>
          </li>
          <li className="flex items-start gap-2 text-[11px] text-foreground">
            <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <span>Encourage <strong>small, frequent payments</strong> instead of waiting for one big payment.</span>
          </li>
          <li className="flex items-start gap-2 text-[11px] text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <span>Keep it up for <strong>7 days straight</strong> — the rating uses your last 7 days.</span>
          </li>
        </ul>

        <p className="text-[10px] text-muted-foreground leading-snug">
          Reach <strong className="text-foreground">70%</strong> daily response to hit
          the top <strong className="text-foreground">Positive</strong> tier and unlock the highest rent limits.
        </p>
      </PopoverContent>
    </Popover>
  );
}

export default Improve7DayRatingPopover;

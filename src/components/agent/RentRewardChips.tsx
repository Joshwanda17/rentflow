import { Banknote, CheckCircle2, Clock, Trophy } from 'lucide-react';
import { formatUGX, EVENT_BONUSES } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

interface RentRewardChipsProps {
  /** Whether the request is linked to a listed house (gates the whole reward path) */
  isListed: boolean;
  /** Landlord verified state */
  landlordVerified: boolean;
  /** Request status (funded/disbursed/completed unlock stage 3) */
  status: string | null;
}

type StageState = 'earned' | 'pending' | 'locked';

const FUNDED_STATUSES = ['funded', 'disbursed', 'repaying', 'completed'];

/**
 * Reward progress chips for the staged agent rent rewards:
 *   Stage 1: UGX 1,000 — listed rent request posted
 *   Stage 2: UGX 4,000 — landlord verified
 *   Stage 3: UGX 5,000 — rent funded to landlord float
 * Shows what's already earned vs what's still pending for this request.
 */
export function RentRewardChips({ isListed, landlordVerified, status }: RentRewardChipsProps) {
  // The reward path only applies to listed-house rent requests.
  if (!isListed) return null;

  const fundedToFloat = FUNDED_STATUSES.includes(status || '');

  const stages: { label: string; amount: number; state: StageState }[] = [
    {
      label: 'Posted',
      amount: EVENT_BONUSES.rent_posted_listed,
      state: 'earned', // listed request exists ⇒ stage 1 already paid
    },
    {
      label: 'Verified',
      amount: EVENT_BONUSES.rent_landlord_verified,
      state: landlordVerified ? 'earned' : 'pending',
    },
    {
      label: 'Funded',
      amount: EVENT_BONUSES.rent_request_posted,
      state: fundedToFloat ? 'earned' : landlordVerified ? 'pending' : 'locked',
    },
  ];

  const earnedTotal = stages
    .filter((s) => s.state === 'earned')
    .reduce((sum, s) => sum + s.amount, 0);
  const maxTotal = stages.reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="mx-4 mb-1 rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Trophy className="h-3.5 w-3.5 text-amber-500" />
          Agent Rewards
        </span>
        <span className="text-xs font-bold text-foreground">
          {formatUGX(earnedTotal)}
          <span className="font-normal text-muted-foreground"> / {formatUGX(maxTotal)}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex flex-1 items-center gap-1.5">
            <div
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-md border px-1.5 py-1.5 text-center transition-colors',
                stage.state === 'earned' &&
                  'border-success/40 bg-success/10 text-success',
                stage.state === 'pending' &&
                  'border-warning/40 bg-warning/10 text-warning',
                stage.state === 'locked' &&
                  'border-border/60 bg-muted/40 text-muted-foreground',
              )}
            >
              {stage.state === 'earned' ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              <span className="text-[11px] font-bold leading-none">
                {formatUGX(stage.amount)}
              </span>
              <span className="text-[10px] leading-none opacity-80">{stage.label}</span>
            </div>
            {i < stages.length - 1 && (
              <span
                className={cn(
                  'text-xs font-bold',
                  stages[i + 1].state === 'earned'
                    ? 'text-success'
                    : 'text-muted-foreground/50',
                )}
              >
                →
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Banknote className="h-3 w-3 shrink-0" />
        Paid automatically to your wallet at each stage.
      </p>
    </div>
  );
}
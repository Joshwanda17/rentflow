import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Share2, Info, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatUGX } from '@/lib/rentCalculations';
import { calculateRentAccessLimit, TIER_META, type RepaymentLike } from '@/lib/rentAccessLimit';
import { cn } from '@/lib/utils';
import { RentAccessLimitShareDialog } from './RentAccessLimitShareDialog';

interface RentAccessLimitCardProps {
  tenantId: string;
  tenantName: string;
  tenantPhone: string;
  monthlyRent: number | null;
  repayments: RepaymentLike[];
  /** Optional Welile AI ID to show on the share artefacts */
  aiId?: string;
}

/**
 * Prominent, marketing-grade Rent Access Limit card for the tenant profile.
 * Recomputes on the fly — no DB writes.
 */
export function RentAccessLimitCard({
  tenantId,
  tenantName,
  tenantPhone,
  monthlyRent,
  repayments,
  aiId,
}: RentAccessLimitCardProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [showHow, setShowHow] = useState(false);

  const result = useMemo(
    () => calculateRentAccessLimit(monthlyRent, repayments),
    [monthlyRent, repayments],
  );

  // No monthly rent set → show a quiet hint instead of a misleading limit
  if (!monthlyRent || monthlyRent <= 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-4 text-center">
        <Sparkles className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">Set a monthly rent</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Add this tenant's monthly rent to unlock their Rent Access Limit.
        </p>
      </div>
    );
  }

  const tier = TIER_META[result.tier];
  const isPositive = result.netAdjustmentPct >= 0;

  return (
    <>
      <section
        aria-label="Rent Access Limit"
        className={cn(
          'relative overflow-hidden rounded-2xl border shadow-md',
          'bg-gradient-to-br from-primary/15 via-primary/5 to-background',
          'border-primary/20',
        )}
      >
        {/* Decorative orbs */}
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-10 h-28 w-28 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="relative p-4 sm:p-5 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-primary/80">
                Rent Access Limit
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Powered by Welile · Updates daily
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold',
                'bg-background/80 backdrop-blur border border-border/60',
                tier.color,
              )}
              aria-label={`Tier: ${tier.label}`}
            >
              <span aria-hidden>{tier.emoji}</span>
              {tier.label}
            </span>
          </div>

          {/* Main figure */}
          <div>
            <p className="text-3xl sm:text-4xl font-black font-mono text-foreground leading-none break-all">
              {formatUGX(result.limit)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Base: {formatUGX(result.base)} ·{' '}
              <span className={isPositive ? 'text-success font-semibold' : 'text-destructive font-semibold'}>
                {isPositive ? '+' : ''}
                {(result.netAdjustmentPct * 100).toFixed(0)}%
              </span>{' '}
              from daily payments
            </p>
          </div>

          {/* Today's change pill */}
          <div
            className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-2 border',
              result.paidToday
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-warning/10 border-warning/30 text-warning',
            )}
            role="status"
            aria-live="polite"
          >
            {result.paidToday ? (
              <TrendingUp className="h-4 w-4 shrink-0" />
            ) : (
              <TrendingDown className="h-4 w-4 shrink-0" />
            )}
            <p className="text-xs sm:text-sm font-semibold flex-1">
              {result.paidToday
                ? `+${formatUGX(result.todayChange)} earned today`
                : `Pay today to earn +${formatUGX(Math.abs(result.todayChange))}`}
            </p>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <Stat label="On-time days" value={result.paidDays} tone="success" />
            <Stat label="Missed days" value={result.missedDays} tone="destructive" />
            <Stat label="Tracked" value={result.trackedDays} tone="muted" />
          </div>

          {/* CTA row */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              size="lg"
              className="flex-1 h-11 rounded-xl font-bold shadow-sm"
              onClick={() => setShareOpen(true)}
              aria-label="Share rent access limit with tenant"
            >
              <Share2 className="h-4 w-4 mr-1.5" />
              Share with tenant
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 w-11 rounded-xl p-0 shrink-0"
              onClick={() => setShowHow(v => !v)}
              aria-expanded={showHow}
              aria-label="How is this calculated?"
            >
              <Info className="h-4 w-4" />
            </Button>
          </div>

          {/* How-it-works */}
          {showHow && (
            <div className="rounded-xl bg-background/70 backdrop-blur border border-border/50 p-3 text-xs space-y-1 animate-fade-in">
              <p className="font-bold text-foreground">How the limit is calculated</p>
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">Base</span> = monthly rent × 12
              </p>
              <p className="text-success">+5% of base for every day you pay on time</p>
              <p className="text-destructive">−5% of base for every missed day</p>
              <p className="text-muted-foreground pt-1">Pay daily, grow your limit. Miss days, it shrinks.</p>
            </div>
          )}
        </div>
      </section>

      <RentAccessLimitShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        tenantId={tenantId}
        tenantName={tenantName}
        tenantPhone={tenantPhone}
        aiId={aiId}
        result={result}
      />
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'destructive' | 'muted';
}) {
  const toneClass =
    tone === 'success' ? 'text-success' : tone === 'destructive' ? 'text-destructive' : 'text-foreground';
  return (
    <div className="rounded-lg bg-background/70 backdrop-blur border border-border/40 px-1 py-1.5">
      <p className={cn('text-base font-black font-mono leading-tight', toneClass)}>{value}</p>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

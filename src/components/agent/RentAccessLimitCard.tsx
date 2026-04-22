import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Info, Sparkles, MessageCircle, Loader2, Check, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatUGX } from '@/lib/rentCalculations';
import { calculateRentAccessLimit, TIER_META, type RepaymentLike } from '@/lib/rentAccessLimit';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RentAccessLimitShareDialog } from './RentAccessLimitShareDialog';

interface RentAccessLimitCardProps {
  tenantId: string;
  tenantName: string;
  tenantPhone: string;
  monthlyRent: number | null;
  repayments: RepaymentLike[];
  /** Optional Welile AI ID to show on the share artefacts */
  aiId?: string;
  /**
   * If set, the card shows a "auto-detected from last rent plan" pill —
   * meaning monthlyRent was inferred from prior rent_requests, not stored on profile.
   */
  detectedFromHistory?: boolean;
  /**
   * Suggested monthly rent to pre-fill the prompt with (e.g. last known rent).
   */
  suggestedRent?: number | null;
  /**
   * Called after the rent is successfully saved to profiles.monthly_rent.
   * Parent should refresh its profile state so the card re-renders with the new value.
   */
  onRentSaved?: (rent: number) => void;
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
  detectedFromHistory,
  suggestedRent,
  onRentSaved,
}: RentAccessLimitCardProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const { toast } = useToast();
  const [rentInput, setRentInput] = useState<string>(
    suggestedRent && suggestedRent > 0 ? String(suggestedRent) : '',
  );
  const [savingRent, setSavingRent] = useState(false);

  const result = useMemo(
    () => calculateRentAccessLimit(monthlyRent, repayments),
    [monthlyRent, repayments],
  );

  // No monthly rent set → actionable prompt to capture it now
  if (!monthlyRent || monthlyRent <= 0) {
    const parsed = parseInt(rentInput.replace(/[^0-9]/g, ''), 10) || 0;
    const canSave = parsed >= 10000 && !savingRent;

    const handleSaveRent = async () => {
      if (!canSave) return;
      setSavingRent(true);
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ monthly_rent: parsed })
          .eq('id', tenantId);
        if (error) throw error;
        toast({ title: 'Monthly rent saved', description: `Set to ${formatUGX(parsed)}` });
        onRentSaved?.(parsed);
      } catch (err: any) {
        toast({
          title: 'Could not save rent',
          description: err?.message || 'Please try again.',
          variant: 'destructive',
        });
      } finally {
        setSavingRent(false);
      }
    };

    return (
      <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Sparkles className="h-4.5 w-4.5 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Add monthly rent to unlock the limit</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              We couldn't auto-detect rent from past records. Ask {tenantName.split(' ')[0]} or enter it yourself —
              it powers their Rent Access Limit.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="rent-input" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Monthly rent (UGX)
          </label>
          <div className="flex gap-2">
            <Input
              id="rent-input"
              inputMode="numeric"
              placeholder="e.g. 350,000"
              value={rentInput ? Number(rentInput.replace(/[^0-9]/g, '')).toLocaleString('en-UG') : ''}
              onChange={(e) => setRentInput(e.target.value.replace(/[^0-9]/g, ''))}
              className="h-11 text-sm font-mono font-semibold"
              disabled={savingRent}
            />
            <Button
              type="button"
              onClick={handleSaveRent}
              disabled={!canSave}
              className="h-11 px-4 rounded-md font-bold shrink-0"
            >
              {savingRent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              <span className="ml-1.5">Save</span>
            </Button>
          </div>
          {parsed > 0 && parsed < 10000 && (
            <p className="text-[11px] text-destructive">Rent looks too low — minimum 10,000 UGX.</p>
          )}
        </div>
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
              {detectedFromHistory && (
                <span className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                  <Wand2 className="h-3 w-3" aria-hidden />
                  Auto-detected from rent history
                </span>
              )}
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
              className="flex-1 h-11 rounded-xl font-bold shadow-sm bg-success hover:bg-success/90 text-success-foreground"
              onClick={() => setShareOpen(true)}
              aria-label="Share on WhatsApp"
            >
              <MessageCircle className="h-4 w-4 mr-1.5" />
              Share on WhatsApp
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

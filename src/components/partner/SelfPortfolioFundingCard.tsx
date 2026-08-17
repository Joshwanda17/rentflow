import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDynamic } from '@/lib/currencyFormat';
import { toast } from 'sonner';
import { CalendarClock, ChevronLeft, ChevronRight, Home, Info, Loader2, MapPin, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';

import { SelfPortfolioDeployDialog } from './SelfPortfolioDeployDialog';
import { SelfPortfolioPlanDetailSheet } from './SelfPortfolioPlanDetailSheet';
import { PlanGpsChip } from './PlanGpsChip';

const MIN_FUNDING = 50000;
const PLANS_PER_PAGE = 4;

interface EarningsSummary {
  nextPayoutDate: string | null;
  expectedThisCycle: number;
  totalEarned: number;
  totalPaid: number;
}

const ordinal = (day: number) => {
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `${day}${suffix}`;
};

interface FundablePlan {
  rent_request_id: string;
  funding_amount: number;
  duration_days: number | null;
  daily_repayment: number | null;
  request_city: string | null;
  house_category: string | null;
  projected_end_date: string | null;
  repayment_cadence: string | null;
  tenant_first_name: string | null;
  tenant_full_name: string | null;
  tenant_location: string | null;
  tenant_avatar_url: string | null;
  tenant_has_photo?: boolean | null;
  landlord_name: string | null;
  house_image_urls: string[] | null;
  held_by: string | null;
  hold_expires_at: string | null;
  request_latitude?: number | string | null;
  request_longitude?: number | string | null;
}

/**
 * Self Portfolio Management — Phase Two
 * Partner funds approved rent plans straight from their withdrawable balance.
 * Privacy: tenant first name only, landlord name shown, no contact details ever leave the server.
 */
export function SelfPortfolioFundingCard({ partnerId }: { partnerId: string }) {
  const [plans, setPlans] = useState<FundablePlan[]>([]);
  const [available, setAvailable] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fundedIds, setFundedIds] = useState<string[]>([]);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [activeCommitmentId, setActiveCommitmentId] = useState<string | null>(null);
  const [deployOpen, setDeployOpen] = useState(false);
  const [detailPlan, setDetailPlan] = useState<FundablePlan | null>(null);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('partner_self_list_fundable_plans', {
      p_limit: 20,
      p_offset: 0,
    });
    if (error) {
      setPlans([]);
    } else {
      const payload = (data ?? {}) as { plans?: FundablePlan[]; available_balance?: number };
      setPlans(payload.plans ?? []);
      setPage(0);
      setAvailable(Number(payload.available_balance ?? 0));
    }
    setLoading(false);
  }, []);

  const loadFunded = useCallback(async () => {
    const { data } = await supabase.rpc('partner_self_portfolio', { p_partner_id: partnerId });
    const payload = (data ?? {}) as {
      lines?: { rent_request_id: string; status?: string; principal?: number }[];
      commitments?: {
        id?: string;
        status?: string;
        next_payout_at?: string | null;
        monthly_rate?: number;
        created_at?: string;
      }[];
      totals?: { total_earned?: number; total_paid?: number; active?: number };
    };
    setFundedIds((payload.lines ?? []).map((l) => l.rent_request_id));

    const activeCommitments = (payload.commitments ?? []).filter((c) => c.status === 'active');
    // Newest active portfolio is the top-up target.
    setActiveCommitmentId(
      [...activeCommitments]
        .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0]?.id ??
        null,
    );
    const nextPayoutDate = activeCommitments
      .map((c) => c.next_payout_at)
      .filter((d): d is string => !!d)
      .sort()[0] ?? null;
    const rate = Number(activeCommitments[0]?.monthly_rate ?? 15);
    const activePrincipal = Number(payload.totals?.active ?? 0);

    setEarnings({
      nextPayoutDate,
      expectedThisCycle: Math.round((activePrincipal * rate) / 100),
      totalEarned: Number(payload.totals?.total_earned ?? 0),
      totalPaid: Number(payload.totals?.total_paid ?? 0),
    });
  }, [partnerId]);

  useEffect(() => {
    void load();
    void loadFunded();
  }, [load, loadFunded]);

  const total = useMemo(
    () =>
      plans
        .filter((p) => selected.includes(p.rent_request_id))
        .reduce((sum, p) => sum + Number(p.funding_amount || 0), 0),
    [plans, selected],
  );

  const remaining = Math.max(0, available - total);
  const overBudget = total > available;

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      setSelected((prev) => prev.filter((x) => x !== id));
      return;
    }
    const plan = plans.find((p) => p.rent_request_id === id);
    const cost = Number(plan?.funding_amount || 0);
    if (cost > remaining) {
      toast.error(
        `Not enough withdrawable balance. This plan needs ${formatDynamic(cost)} and you have ${formatDynamic(remaining)} left to fund.`,
      );
      return;
    }
    setSelected((prev) => [...prev, id]);
  };

  const openDeploy = () => {
    if (total < MIN_FUNDING) {
      toast.error(`Minimum funding is ${formatDynamic(MIN_FUNDING)}.`);
      return;
    }
    if (total > available) {
      toast.error('Your withdrawable balance is not enough for this selection.');
      return;
    }
    setDeployOpen(true);
  };

  const handleDeployed = async () => {
    setSelected([]);
    await Promise.all([load(), loadFunded()]);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">Available to fund</p>
            <p className="text-lg font-black text-foreground">{formatDynamic(available)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Minimum {formatDynamic(MIN_FUNDING)} per plan
            </p>
            <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">
              You can only select plans up to your withdrawable balance —{' '}
              {formatDynamic(remaining)} left to fund
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {earnings && (earnings.nextPayoutDate || earnings.totalEarned > 0) && (
        <Card className="p-4 rounded-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">Returns this cycle</p>
              <p className="text-lg font-black text-foreground">{formatDynamic(earnings.expectedThisCycle)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Paid to date {formatDynamic(earnings.totalPaid)} of {formatDynamic(earnings.totalEarned)} earned
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                <span>Next payout</span>
              </div>
              <p className="text-sm font-bold">
                {earnings.nextPayoutDate
                  ? new Date(earnings.nextPayoutDate).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '—'}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            {earnings.nextPayoutDate
              ? `Returns pay into your withdrawable balance on the ${ordinal(new Date(earnings.nextPayoutDate).getDate())} of each month — your own contribution date.`
              : 'Returns start the day you deploy, then pay monthly on your deployment date.'}
          </p>
        </Card>
      )}

      {plans.length === 0 && (
        <Card className="p-6 rounded-2xl text-center">
          <Wallet className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-semibold">No approved plans awaiting money right now</p>
          <p className="text-xs text-muted-foreground mt-1">
            Plans appear here after approval and disappear once the landlord is paid.
          </p>
        </Card>
      )}

      {plans.length > 1 && (
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-[11px] font-semibold text-muted-foreground">
            {plans.length} tenant plan{plans.length > 1 ? 's' : ''} available
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px]"
            disabled={busy}
            onClick={() => {
              if (selected.length > 0) {
                setSelected([]);
                return;
              }
              let budget = available;
              const picked: string[] = [];
              let skipped = 0;
              for (const p of plans) {
                if (fundedIds.includes(p.rent_request_id)) continue;
                if (p.held_by && p.held_by !== partnerId) continue;
                const cost = Number(p.funding_amount || 0);
                if (cost > budget) { skipped += 1; continue; }
                budget -= cost;
                picked.push(p.rent_request_id);
              }
              setSelected(picked);
              if (skipped > 0) {
                toast.info(
                  `Selected what your withdrawable balance of ${formatDynamic(available)} covers. ${skipped} plan${skipped > 1 ? 's' : ''} skipped — add funds to include ${skipped > 1 ? 'them' : 'it'}.`,
                );
              }
            }}
          >
            {selected.length > 0 ? 'Clear selection' : 'Select what I can afford'}
          </Button>
        </div>
      )}

      {plans
        .slice(page * PLANS_PER_PAGE, page * PLANS_PER_PAGE + PLANS_PER_PAGE)
        .map((plan) => {
        const isFunded = fundedIds.includes(plan.rent_request_id);
        const heldByOther = !!plan.held_by && plan.held_by !== partnerId;
        const isSelected = selected.includes(plan.rent_request_id);
        const unaffordable = !isSelected && Number(plan.funding_amount || 0) > remaining;
        const images = (plan.house_image_urls ?? []).filter(Boolean);
        const metrics = [
          plan.daily_repayment ? `${formatDynamic(plan.daily_repayment)} daily` : null,
          `${plan.duration_days ?? 30} days`,
          plan.projected_end_date
            ? `ends ${new Date(plan.projected_end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
            : null,
          plan.repayment_cadence ? `collected ${plan.repayment_cadence}` : null,
        ].filter(Boolean) as string[];
        return (
          <Card
            key={plan.rent_request_id}
            role="button"
            tabIndex={0}
            onClick={() => setDetailPlan(plan)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDetailPlan(plan);
              }
            }}
            className={`p-2 rounded-2xl transition-colors cursor-pointer hover:bg-muted/30 ${isSelected ? 'ring-2 ring-primary/60 bg-primary/5' : ''}`}
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
              {images.length > 0 ? (
                <img
                  src={images[0]}
                  alt="House photo"
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Home className="h-7 w-7 text-muted-foreground" />
                </div>
              )}

              {(isFunded || heldByOther) && (
                <div className="absolute left-2 top-2">
                  <Badge variant="secondary" className="rounded-full bg-background/85 text-[10px] font-semibold backdrop-blur">
                    {isFunded ? 'Funded by you' : 'On hold'}
                  </Badge>
                </div>
              )}

              {!isFunded && (
                <div className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/85 backdrop-blur">
                  <Checkbox
                    checked={isSelected}
                    disabled={heldByOther || busy || unaffordable}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => toggle(plan.rent_request_id)}
                    aria-label={`Select plan for ${plan.tenant_full_name ?? plan.tenant_first_name ?? 'tenant'}`}
                  />
                </div>
              )}


              {images.length > 1 && (
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1">
                  {images.slice(0, 5).map((src, i) => (
                    <span
                      key={src + i}
                      className={`h-1.5 w-1.5 rounded-full ${i === 0 ? 'bg-background' : 'bg-background/50'}`}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="px-1.5 pb-1 pt-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-bold">
                  {plan.tenant_full_name || plan.tenant_first_name || 'Tenant'}
                </p>
                <p className="shrink-0 text-sm font-black text-foreground">
                  {formatDynamic(plan.funding_amount)}
                </p>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {plan.tenant_location || plan.request_city || 'Uganda'}
                  {plan.house_category ? ` · ${plan.house_category}` : ''}
                </span>
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                Landlord: {plan.landlord_name ?? 'Landlord'}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <PlanGpsChip
                  latitude={plan.request_latitude}
                  longitude={plan.request_longitude}
                />
              </div>
              {metrics.length > 0 && (
                <p className="mt-0.5 text-[11px] font-semibold text-foreground/80">
                  {metrics.join(' · ')}
                </p>
              )}

              {heldByOther && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Another partner is confirming this plan right now.
                </p>
              )}
              {unaffordable && !heldByOther && (
                <p className="mt-2 text-[10px] font-semibold text-destructive">
                  Needs {formatDynamic(plan.funding_amount)} — more than the {formatDynamic(remaining)}{' '}
                  you have left in your withdrawable balance.
                </p>
              )}
            </div>
          </Card>
        );
      })}

      {plans.length > PLANS_PER_PAGE && (
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[11px]"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="ml-1">Previous</span>
          </Button>
          <p className="text-[11px] font-semibold text-muted-foreground">
            Page {page + 1} of {Math.ceil(plans.length / PLANS_PER_PAGE)}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[11px]"
            disabled={page >= Math.ceil(plans.length / PLANS_PER_PAGE) - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            <span className="mr-1">Next</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {selected.length > 0 && (
        <Card className="p-4 rounded-2xl sticky bottom-4 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-muted-foreground">
                {selected.length} plan{selected.length > 1 ? 's' : ''} selected
              </p>
              <p className="text-base font-black">{formatDynamic(total)}</p>
            </div>
            <Button onClick={openDeploy} disabled={busy || total < MIN_FUNDING || overBudget}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              <span className="ml-2">{activeCommitmentId ? 'Deploy or top up' : 'Fund now'}</span>
            </Button>
          </div>
          {overBudget ? (
            <p className="text-[10px] font-semibold text-destructive mt-2">
              This selection is {formatDynamic(total - available)} more than your withdrawable balance
              of {formatDynamic(available)}. Remove a plan or add funds.
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground mt-1">
              {formatDynamic(remaining)} of your withdrawable balance still unused.
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-2">
            Money leaves your withdrawable balance and funds the company landlord float pool. Your
            capital starts earning from the day you deploy. Tenant contact stays with the agent.
          </p>
        </Card>
      )}

      <SelfPortfolioDeployDialog
        open={deployOpen}
        onOpenChange={setDeployOpen}
        activeCommitmentId={activeCommitmentId}
        selectedIds={selected}
        total={total}
        onDeployed={handleDeployed}
      />

      <SelfPortfolioPlanDetailSheet
        plan={detailPlan}
        open={!!detailPlan}
        onOpenChange={(v) => !v && setDetailPlan(null)}
        isFunded={!!detailPlan && fundedIds.includes(detailPlan.rent_request_id)}
      />
    </div>
  );
}
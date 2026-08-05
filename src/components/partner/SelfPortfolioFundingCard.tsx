import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDynamic } from '@/lib/currencyFormat';
import { toast } from 'sonner';
import { CalendarClock, Home, Loader2, Lock, MapPin, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { SelfPortfolioDeployDialog } from './SelfPortfolioDeployDialog';
import { SelfPortfolioPlanDetailSheet } from './SelfPortfolioPlanDetailSheet';

const MIN_FUNDING = 50000;

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
  landlord_name: string | null;
  house_image_urls: string[] | null;
  held_by: string | null;
  hold_expires_at: string | null;
}

/**
 * Self Portfolio Management — Phase Two
 * Partner funds approved rent plans straight from their withdrawable balance.
 * Privacy: tenant first name only, avatar blurred until the plan is funded,
 * landlord name shown, no contact details ever leave the server.
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

      {plans.map((plan) => {
        const isFunded = fundedIds.includes(plan.rent_request_id);
        const heldByOther = !!plan.held_by && plan.held_by !== partnerId;
        const isSelected = selected.includes(plan.rent_request_id);
        const unaffordable = !isSelected && Number(plan.funding_amount || 0) > remaining;
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
            className={`p-4 rounded-2xl transition-colors cursor-pointer hover:bg-muted/30 ${isSelected ? 'ring-2 ring-primary/60 bg-primary/5' : ''}`}
          >
            <div className="flex items-start gap-3">
              <div className="relative w-12 h-12 rounded-full overflow-hidden bg-muted shrink-0">
                {plan.tenant_avatar_url ? (
                  <img
                    src={plan.tenant_avatar_url}
                    alt="Tenant profile photo"
                    loading="lazy"
                    className={isFunded ? 'w-full h-full object-cover' : 'w-full h-full object-cover blur-md scale-110'}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {(plan.tenant_full_name ?? plan.tenant_first_name ?? 'T').charAt(0)}
                  </div>
                )}
                {!isFunded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/30">
                    <Lock className="h-3.5 w-3.5 text-foreground" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm truncate">
                    {plan.tenant_full_name || plan.tenant_first_name || 'Tenant'}
                  </p>
                  {isFunded && (
                    <Badge variant="secondary" className="text-[10px]">
                      Funded by you
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  Landlord: {plan.landlord_name ?? 'Landlord'}
                </p>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">
                    {plan.tenant_location || plan.request_city || 'Uganda'}
                    {plan.house_category ? ` · ${plan.house_category}` : ''}
                  </span>
                </div>
              </div>

              {!isFunded && (
                <Checkbox
                  className="mt-1"
                  checked={isSelected}
                  disabled={heldByOther || busy || unaffordable}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={() => toggle(plan.rent_request_id)}
                  aria-label={`Select plan for ${plan.tenant_full_name ?? plan.tenant_first_name ?? 'tenant'}`}
                />
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Rent needed', value: formatDynamic(plan.funding_amount), strong: true },
                { label: 'Daily repayment', value: plan.daily_repayment ? formatDynamic(plan.daily_repayment) : '—' },
                { label: 'Term', value: `${plan.duration_days ?? 30} days` },
                {
                  label: 'Ends',
                  value: plan.projected_end_date
                    ? new Date(plan.projected_end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—',
                },
              ].map((f) => (
                <div key={f.label} className="rounded-xl bg-muted/40 px-2.5 py-2 min-w-0">
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold truncate">
                    {f.label}
                  </p>
                  <p className={`text-xs mt-0.5 truncate ${f.strong ? 'font-black text-foreground' : 'font-bold text-foreground/90'}`}>
                    {f.value}
                  </p>
                </div>
              ))}
            </div>

            {plan.repayment_cadence && (
              <p className="text-[10px] text-muted-foreground mt-2">
                Repayments collected {plan.repayment_cadence}.
              </p>
            )}
            {heldByOther && (
              <p className="text-[10px] text-muted-foreground mt-2">
                Another partner is confirming this plan right now.
              </p>
            )}
            {unaffordable && !heldByOther && (
              <p className="text-[10px] font-semibold text-destructive mt-2">
                Needs {formatDynamic(plan.funding_amount)} — more than the {formatDynamic(remaining)}{' '}
                you have left in your withdrawable balance.
              </p>
            )}
          </Card>
        );
      })}

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
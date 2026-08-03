import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDynamic } from '@/lib/currencyFormat';
import { toast } from 'sonner';
import { Loader2, Lock, MapPin, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';

const MIN_FUNDING = 50000;

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
  tenant_avatar_url: string | null;
  landlord_name: string | null;
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
    const payload = (data ?? {}) as { lines?: { rent_request_id: string }[] };
    setFundedIds((payload.lines ?? []).map((l) => l.rent_request_id));
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

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const fund = async () => {
    if (total < MIN_FUNDING) {
      toast.error(`Minimum funding is ${formatDynamic(MIN_FUNDING)}.`);
      return;
    }
    if (total > available) {
      toast.error('Your withdrawable balance is not enough for this selection.');
      return;
    }
    setBusy(true);
    try {
      const { error: claimError } = await supabase.rpc('partner_self_claim_plans', {
        p_rent_request_ids: selected,
      });
      if (claimError) throw claimError;

      const { error: confirmError } = await supabase.rpc('partner_self_confirm_commitment', {
        p_rent_request_ids: selected,
        p_term_months: 12,
      });
      if (confirmError) throw confirmError;

      toast.success('Funding committed. The plan goes active once the landlord float is disbursed.');
      setSelected([]);
      await Promise.all([load(), loadFunded()]);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Funding failed';
      toast.error(message);
      await supabase.rpc('partner_self_release_claims', { p_rent_request_ids: selected });
    } finally {
      setBusy(false);
    }
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
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {plans.length === 0 && (
        <Card className="p-6 rounded-2xl text-center">
          <Wallet className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-semibold">No approved plans awaiting money right now</p>
          <p className="text-xs text-muted-foreground mt-1">
            Plans appear here after approval and disappear once the landlord is paid.
          </p>
        </Card>
      )}

      {plans.map((plan) => {
        const isFunded = fundedIds.includes(plan.rent_request_id);
        const heldByOther = !!plan.held_by && plan.held_by !== partnerId;
        const isSelected = selected.includes(plan.rent_request_id);
        return (
          <Card key={plan.rent_request_id} className="p-4 rounded-2xl">
            <div className="flex items-start gap-3">
              <div className="relative w-12 h-12 rounded-full overflow-hidden bg-muted shrink-0">
                {plan.tenant_avatar_url ? (
                  <img
                    src={plan.tenant_avatar_url}
                    alt={`${plan.tenant_first_name ?? 'Tenant'} profile photo`}
                    loading="lazy"
                    className={isFunded ? 'w-full h-full object-cover' : 'w-full h-full object-cover blur-md scale-110'}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {(plan.tenant_first_name ?? 'T').charAt(0)}
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
                  <p className="font-bold text-sm truncate">{plan.tenant_first_name ?? 'Tenant'}</p>
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
                  <span className="truncate">{plan.request_city ?? 'Uganda'}</span>
                </div>
                <p className="text-sm font-black text-foreground mt-1">
                  {formatDynamic(plan.funding_amount)}
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {' '}
                    · {plan.duration_days ?? 30} days
                  </span>
                </p>
              </div>

              {!isFunded && (
                <Checkbox
                  className="mt-1"
                  checked={isSelected}
                  disabled={heldByOther || busy}
                  onCheckedChange={() => toggle(plan.rent_request_id)}
                  aria-label={`Select plan for ${plan.tenant_first_name ?? 'tenant'}`}
                />
              )}
            </div>
            {heldByOther && (
              <p className="text-[10px] text-muted-foreground mt-2">
                Another partner is confirming this plan right now.
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
            <Button onClick={() => void fund()} disabled={busy || total < MIN_FUNDING}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              <span className="ml-2">Fund now</span>
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Money leaves your withdrawable balance and funds the landlord float. Your capital becomes
            active the moment the landlord float is disbursed. Tenant contact stays with the agent.
          </p>
        </Card>
      )}
    </div>
  );
}
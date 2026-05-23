import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/hooks/useCurrency';
import {
  ArrowDownLeft, ArrowUpRight, HandCoins, Users, X, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';

// Mirror the float bucket categories used by FloatBreakdownCard so the two
// drill-down views never disagree about which entries belong to which bucket.
const FLOAT_CATEGORIES = [
  'agent_float_deposit',
  'operational_float_deposit',
  'agent_float_topup',
  'float_received',
  'partner_float_transfer_in',
  'rent_payment_for_tenant',
  'agent_float_used_for_rent',
  'agent_float_payout',
  'float_withdrawal',
  'landlord_payout',
  'partner_float_transfer_out',
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  // float
  agent_float_deposit: 'Float deposit',
  operational_float_deposit: 'Float deposit',
  agent_float_topup: 'Float top-up',
  float_received: 'Float received',
  partner_float_transfer_in: 'Partner transfer in',
  rent_payment_for_tenant: "Paid tenant's rent",
  agent_float_used_for_rent: "Paid tenant's rent",
  agent_float_payout: 'Float payout',
  float_withdrawal: 'Float withdrawal',
  landlord_payout: 'Paid landlord',
  partner_float_transfer_out: 'Partner transfer out',
  // withdrawable / commission
  agent_rent_commission: 'Rent commission (10%)',
  rent_commission: 'Rent commission',
  agent_investment_commission: 'Investment commission',
  investment_commission: 'Investment commission',
  partner_commission: 'Partner commission (2%)',
  subagent_commission: 'Sub-agent override',
  registration_bonus: 'Registration bonus',
  verification_bonus: 'Verification bonus',
  facilitation_bonus: 'Facilitation bonus',
  listing_bonus: 'Listing bonus',
  tenant_placement_bonus: 'Tenant placement bonus',
  approval_bonus: 'Approval bonus',
  referral_bonus: 'Referral bonus',
  roi_wallet_credit: 'Investor returns',
  withdrawal: 'Withdrawal',
  agent_wallet_withdrawal: 'Withdrawal',
};

function labelFor(cat: string) {
  return CATEGORY_LABEL[cat] ?? cat.replace(/_/g, ' ');
}

interface Entry {
  id: string;
  transaction_date: string;
  category: string;
  direction: 'cash_in' | 'cash_out';
  amount: number;
  description: string | null;
}

export type BucketType = 'withdrawable' | 'float';

interface WalletBucketDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucket: BucketType;
  balance: number;
}

const COPY: Record<BucketType, {
  title: string; subtitle: string; helper: string;
  tint: string; accent: string; icon: React.ReactNode;
}> = {
  withdrawable: {
    title: 'Yours to keep',
    subtitle: 'Commission, bonuses & returns',
    helper: 'This money is yours. You can withdraw it any time.',
    tint: 'bg-emerald-500/10',
    accent: 'text-emerald-600',
    icon: <HandCoins className="h-6 w-6" />,
  },
  float: {
    title: 'Tenant collections',
    subtitle: 'Money tenants gave you',
    helper: 'This belongs to tenants. Use it to pay their rent — you cannot withdraw it.',
    tint: 'bg-sky-500/10',
    accent: 'text-sky-600',
    icon: <Users className="h-6 w-6" />,
  },
};

export function WalletBucketDetailSheet({
  open, onOpenChange, bucket, balance,
}: WalletBucketDetailSheetProps) {
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

  const copy = COPY[bucket];

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    let q = supabase
      .from('general_ledger')
      .select('id, transaction_date, category, direction, amount, description')
      .eq('user_id', user.id)
      .eq('ledger_scope', 'wallet')
      // User-facing ledger filter (per memory)
      .neq('classification', 'admin_correction')
      .neq('category', 'system_balance_correction')
      .order('transaction_date', { ascending: false })
      .limit(100);

    if (bucket === 'float') {
      q = q.in('category', FLOAT_CATEGORIES as unknown as string[]);
    } else {
      q = q.not('category', 'in', `(${(FLOAT_CATEGORIES as unknown as string[]).join(',')})`);
    }

    const { data, error } = await q;
    if (error) {
      console.error('[WalletBucketDetailSheet] load error', error);
      setEntries([]);
    } else {
      setEntries((data ?? []) as Entry[]);
    }
    setLoading(false);
  }, [user?.id, bucket]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const { totalIn, totalOut } = useMemo(() => {
    let i = 0, o = 0;
    for (const e of entries) {
      if (e.direction === 'cash_in') i += Number(e.amount || 0);
      else o += Number(e.amount || 0);
    }
    return { totalIn: i, totalOut: o };
  }, [entries]);

  // Group entries by day for an easy-to-scan timeline.
  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      const key = format(new Date(e.transaction_date), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries());
  }, [entries]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92dvh] p-0 rounded-t-3xl border-0 flex flex-col"
      >
        {/* Header */}
        <div className="safe-area-top px-5 pt-5 pb-4 border-b border-border/40 bg-background">
          <div className="flex items-start gap-3">
            <div className={`h-12 w-12 rounded-2xl ${copy.tint} ${copy.accent} flex items-center justify-center shrink-0`}>
              {copy.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {copy.subtitle}
              </p>
              <h2 className="text-xl font-black text-foreground leading-tight">{copy.title}</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full -mr-1"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Big balance */}
          <div className="mt-4">
            <p className="text-[34px] sm:text-[40px] font-black text-foreground tabular-nums leading-none truncate">
              {formatAmount(balance)}
            </p>
            <p className="text-sm text-muted-foreground mt-2 leading-snug">{copy.helper}</p>
          </div>

          {/* In / Out summary */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <ArrowDownLeft className="h-3.5 w-3.5" />
                <p className="text-[10px] font-bold uppercase tracking-wider">Money in</p>
              </div>
              <p className="text-lg font-black text-foreground tabular-nums mt-1 truncate">
                {formatAmount(totalIn)}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/50 p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ArrowUpRight className="h-3.5 w-3.5" />
                <p className="text-[10px] font-bold uppercase tracking-wider">Money out</p>
              </div>
              <p className="text-lg font-black text-foreground tabular-nums mt-1 truncate">
                {formatAmount(totalOut)}
              </p>
            </div>
          </div>
        </div>

        {/* Activity list */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain bg-muted/20"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">
              Recent activity {entries.length > 0 && `· ${entries.length}`}
            </p>

            {loading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && entries.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background p-8 text-center">
                <p className="text-sm font-semibold text-foreground">No activity yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {bucket === 'withdrawable'
                    ? 'Earn commission by allocating rent for tenants.'
                    : 'Tenant deposits will appear here.'}
                </p>
              </div>
            )}

            {!loading && grouped.map(([day, items]) => (
              <div key={day} className="mb-5">
                <p className="text-[11px] font-semibold text-muted-foreground mb-2 px-1">
                  {format(new Date(day), 'EEEE, MMM d, yyyy')}
                </p>
                <div className="rounded-2xl bg-background border border-border/50 overflow-hidden divide-y divide-border/40">
                  {items.map((e) => {
                    const isIn = e.direction === 'cash_in';
                    return (
                      <div key={e.id} className="flex items-center gap-3 p-3.5">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isIn ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                        }`}>
                          {isIn ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">
                            {labelFor(e.category)}
                          </p>
                          {e.description && (
                            <p className="text-xs text-muted-foreground truncate">{e.description}</p>
                          )}
                          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                            {format(new Date(e.transaction_date), 'h:mm a')}
                          </p>
                        </div>
                        <p className={`text-base font-black tabular-nums shrink-0 ${
                          isIn ? 'text-emerald-600' : 'text-foreground'
                        }`}>
                          {isIn ? '+' : '−'}{formatAmount(Number(e.amount || 0))}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
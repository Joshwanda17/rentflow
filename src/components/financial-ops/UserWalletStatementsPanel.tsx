import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { UserSearchPicker } from '@/components/cfo/UserSearchPicker';
import { UserDrilldownDrawer } from '@/components/ops/UserDrilldownDrawer';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import {
  Wallet, HandCoins, Banknote, Landmark, AlertTriangle, Loader2,
  ArrowDownLeft, ArrowUpRight, User, ChevronRight, Search,
} from 'lucide-react';

/**
 * Financial Ops — per-user wallet statements.
 *
 * Search any user, then read their wallet exactly the way THEY see it:
 *   • Withdrawable wallet
 *   • Operational float
 *   • Landlord payout float
 *   • Advance repayment
 *
 * Tapping the user's name opens the full profile drill-down (location,
 * contacts, roles, portfolios and every other detail).
 *
 * Ops / Fin Ops surface — read-only. Mirrors the user-facing labels &
 * plain-language reasons so the operator sees what the customer sees.
 */

type UserBrief = { id: string; full_name: string | null; phone: string | null };

const CATEGORY_LABEL: Record<string, string> = {
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
  agent_rent_commission: 'Rent commission (10%)',
  rent_commission: 'Rent commission',
  agent_commission_earned: 'Commission earned',
  agent_commission: 'Commission earned',
  agent_commission_payout: 'Commission paid out',
  agent_commission_payable: 'Commission posted',
  agent_investment_commission: 'Investment commission',
  investment_commission: 'Investment commission',
  partner_commission: 'Partner commission (2%)',
  subagent_commission: 'Sub-agent override',
  registration_bonus: 'Registration bonus',
  verification_bonus: 'Verification bonus',
  facilitation_bonus: 'Facilitation bonus',
  listing_bonus: 'Listing bonus',
  tenant_placement_bonus: 'Tenant placement bonus',
  agent_bonus: 'Bonus',
  approval_bonus: 'Approval bonus',
  referral_bonus: 'Referral bonus',
  roi_wallet_credit: 'Investor returns',
  withdrawal: 'Withdrawal',
  agent_wallet_withdrawal: 'Withdrawal',
  wallet_withdrawal: 'Withdrawal',
  deposit: 'Deposit',
  wallet_deposit: 'Deposit',
  tenant_repayment: 'Tenant repayment',
  rent_repayment: 'Rent repayment',
  rent_auto_deduction: 'Auto rent deduction',
  agent_float_settlement: 'Float settled',
  rent_float_funding: 'Rent funding',
  rent_disbursement: 'Rent disbursed to landlord',
  rent_receivable_created: 'Rent recorded',
  advance_disbursement: 'Advance disbursed',
  advance_repayment: 'Advance repayment',
  advance_recovery: 'Advance recovered',
  balance_correction: 'Wallet correction',
  historical_balance_reseed: 'Opening balance',
  wallet_transfer: 'Wallet transfer',
  transfer_in: 'Transfer received',
  transfer_out: 'Transfer sent',
  welcome_bonus: 'Welcome bonus',
};

function labelFor(cat: string | null): string {
  if (!cat) return 'Transaction';
  return CATEGORY_LABEL[cat] ?? cat.replace(/_/g, ' ');
}

function fmtTs(iso: string): string {
  try {
    return format(new Date(iso), 'd MMM yyyy, h:mm a');
  } catch {
    return iso;
  }
}

type BucketKey = 'withdrawable' | 'float' | 'advance';

interface LedgerRow {
  id: string;
  transaction_date: string;
  direction: string;
  category: string | null;
  description: string | null;
  amount: number;
}

/* ── Wallet (cache) summary ── */
function useWalletSummary(userId: string | null) {
  return useQuery({
    queryKey: ['finops-user-wallet', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: wallet }, { data: landlordFloat }] = await Promise.all([
        supabase
          .from('wallets')
          .select('withdrawable_balance, float_balance, advance_balance, balance')
          .eq('user_id', userId!)
          .maybeSingle(),
        supabase
          .from('agent_landlord_float')
          .select('balance, total_funded, total_paid_out')
          .eq('agent_id', userId!)
          .maybeSingle(),
      ]);
      return {
        withdrawable: Number(wallet?.withdrawable_balance ?? 0),
        float: Number(wallet?.float_balance ?? 0),
        advance: Number(wallet?.advance_balance ?? 0),
        landlordFloat: Number(landlordFloat?.balance ?? 0),
        landlordFunded: Number(landlordFloat?.total_funded ?? 0),
        landlordPaidOut: Number(landlordFloat?.total_paid_out ?? 0),
      };
    },
  });
}

/* ── Wallet-bucket ledger statement (withdrawable / float / advance) ── */
function BucketStatement({ userId, bucket }: { userId: string; bucket: BucketKey }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['finops-user-bucket-ledger', userId, bucket],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('general_ledger')
        .select('id, transaction_date, direction, category, description, amount')
        .eq('user_id', userId)
        .eq('ledger_scope', 'wallet')
        .eq('wallet_bucket', bucket)
        .order('transaction_date', { ascending: false })
        .limit(300);
      if (error) throw error;
      return (rows ?? []) as LedgerRow[];
    },
  });

  const { totalIn, totalOut } = useMemo(() => {
    let i = 0, o = 0;
    for (const r of data ?? []) {
      if (r.direction === 'cash_in') i += Number(r.amount || 0);
      else o += Number(r.amount || 0);
    }
    return { totalIn: i, totalOut: o };
  }, [data]);

  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading statement…
      </div>
    );
  }
  if (error) {
    return <div className="py-8 text-center text-sm text-destructive">Could not load this statement.</div>;
  }
  const rows = data ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <ArrowDownLeft className="h-3.5 w-3.5" />
            <p className="text-[10px] font-bold uppercase tracking-wider">Money in</p>
          </div>
          <p className="text-base font-black tabular-nums mt-1 truncate">{formatUGX(totalIn)}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/50 p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ArrowUpRight className="h-3.5 w-3.5" />
            <p className="text-[10px] font-bold uppercase tracking-wider">Money out</p>
          </div>
          <p className="text-base font-black tabular-nums mt-1 truncate">{formatUGX(totalOut)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-background p-8 text-center text-sm text-muted-foreground">
          No activity in this bucket yet.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background overflow-hidden divide-y divide-border/40">
          {rows.map((r) => {
            const isIn = r.direction === 'cash_in';
            return (
              <div key={r.id} className="flex items-center gap-3 p-3">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${isIn ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                  {isIn ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{labelFor(r.category)}</p>
                  {r.description && (
                    <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{r.description}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground/80 mt-0.5">{fmtTs(r.transaction_date)}</p>
                </div>
                <p className={`text-sm font-black tabular-nums shrink-0 ${isIn ? 'text-emerald-600' : 'text-destructive'}`}>
                  {isIn ? '+' : '−'}{formatUGX(Number(r.amount))}
                </p>
              </div>
            );
          })}
        </div>
      )}
      {rows.length >= 300 && (
        <p className="text-[11px] text-muted-foreground text-center">Showing the most recent 300 entries.</p>
      )}
    </div>
  );
}

/* ── Landlord payout float statement ── */
function LandlordFloatStatement({ userId, funded, paidOut, balance }: {
  userId: string; funded: number; paidOut: number; balance: number;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['finops-user-landlord-float', userId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('agent_float_withdrawals')
        .select('id, amount, landlord_name, landlord_phone, status, mobile_money_provider, created_at, notes')
        .eq('agent_id', userId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return rows ?? [];
    },
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-border/60 bg-muted/40 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Funded</p>
          <p className="text-sm font-black tabular-nums mt-1 truncate">{formatUGX(funded)}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/40 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Paid out</p>
          <p className="text-sm font-black tabular-nums mt-1 truncate">{formatUGX(paidOut)}</p>
        </div>
        <div className="rounded-xl border border-[#9234EA]/30 bg-[#9234EA]/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#9234EA]">Balance</p>
          <p className="text-sm font-black tabular-nums mt-1 truncate">{formatUGX(balance)}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading payouts…
        </div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-destructive">Could not load landlord payouts.</div>
      ) : (data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-background p-8 text-center text-sm text-muted-foreground">
          No landlord payouts yet.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background overflow-hidden divide-y divide-border/40">
          {(data ?? []).map((r: any) => (
            <div key={r.id} className="flex items-center gap-3 p-3">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-[#9234EA]/10 text-[#9234EA]">
                <Landmark className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {r.landlord_name || 'Landlord'} {r.landlord_phone ? `· ${r.landlord_phone}` : ''}
                </p>
                <p className="text-[11px] text-muted-foreground capitalize">
                  {(r.status || '').replace(/_/g, ' ')}{r.mobile_money_provider ? ` · ${r.mobile_money_provider}` : ''}
                </p>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">{fmtTs(r.created_at)}</p>
              </div>
              <p className="text-sm font-black tabular-nums shrink-0 text-destructive">
                −{formatUGX(Number(r.amount))}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function UserWalletStatementsPanel() {
  const [selected, setSelected] = useState<UserBrief | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);
  const { data: summary, isLoading: summaryLoading } = useWalletSummary(selected?.id ?? null);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2.5">
          <Wallet className="h-6 w-6 text-primary" />
          User Wallet Statements
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Search a user and read their wallet exactly as they see it. Tap the name for the full profile.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
          <Search className="h-3 w-3" /> Find any user by name or phone
        </div>
        <UserSearchPicker
          label=""
          placeholder="Search by name or phone…"
          selectedUser={selected}
          onSelect={setSelected}
        />
      </div>

      {selected && (
        <>
          {/* Tappable name → full profile drill-down */}
          <button
            type="button"
            onClick={() => setDrillOpen(true)}
            className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:bg-accent/40 transition-colors"
          >
            <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <User className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">{selected.full_name || 'Unnamed user'}</p>
              <p className="text-xs text-muted-foreground">{selected.phone || '— no phone —'}</p>
              <p className="text-[11px] text-primary mt-0.5">View full profile — location, contacts, roles & portfolios</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </button>

          {/* Balance chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              { label: 'Withdrawable', val: summary?.withdrawable ?? 0, tone: 'text-emerald-600', Icon: HandCoins },
              { label: 'Operational Float', val: summary?.float ?? 0, tone: 'text-sky-600', Icon: Banknote },
              { label: 'Landlord Float', val: summary?.landlordFloat ?? 0, tone: 'text-[#9234EA]', Icon: Landmark },
              { label: 'Advance Owed', val: summary?.advance ?? 0, tone: 'text-warning', Icon: AlertTriangle },
            ] as const).map(({ label, val, tone, Icon }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-3">
                <div className={`flex items-center gap-1.5 ${tone}`}>
                  <Icon className="h-3.5 w-3.5" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                </div>
                <p className="text-base font-black tabular-nums mt-1 truncate">
                  {summaryLoading ? '…' : formatUGX(val)}
                </p>
              </div>
            ))}
          </div>

          {/* Statements */}
          <Tabs defaultValue="withdrawable" className="w-full">
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-auto">
              <TabsTrigger value="withdrawable" className="text-xs py-2">Withdrawable</TabsTrigger>
              <TabsTrigger value="float" className="text-xs py-2">Op. Float</TabsTrigger>
              <TabsTrigger value="landlord" className="text-xs py-2">Landlord Float</TabsTrigger>
              <TabsTrigger value="advance" className="text-xs py-2">Advance</TabsTrigger>
            </TabsList>
            <TabsContent value="withdrawable" className="pt-4">
              <BucketStatement userId={selected.id} bucket="withdrawable" />
            </TabsContent>
            <TabsContent value="float" className="pt-4">
              <BucketStatement userId={selected.id} bucket="float" />
            </TabsContent>
            <TabsContent value="landlord" className="pt-4">
              <LandlordFloatStatement
                userId={selected.id}
                funded={summary?.landlordFunded ?? 0}
                paidOut={summary?.landlordPaidOut ?? 0}
                balance={summary?.landlordFloat ?? 0}
              />
            </TabsContent>
            <TabsContent value="advance" className="pt-4">
              <BucketStatement userId={selected.id} bucket="advance" />
            </TabsContent>
          </Tabs>

          <UserDrilldownDrawer
            open={drillOpen}
            onOpenChange={setDrillOpen}
            tenantId={selected.id}
            defaultTab="tenant"
          />
        </>
      )}
    </div>
  );
}
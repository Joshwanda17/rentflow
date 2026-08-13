import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CompactAmount } from '@/components/ui/CompactAmount';
import { cn } from '@/lib/utils';
import {
  Loader2, RefreshCw, ChevronRight, AlertTriangle, Banknote, Users, Home,
  Wallet, TrendingUp, TrendingDown, Target, Handshake, ClipboardList, Landmark,
} from 'lucide-react';

interface Bucket { n: number; amt: number }

export interface COOCommandCenterData {
  generated_at: string;
  today_start: string;
  collections: {
    today_amount: number; today_count: number; today_agents: number; today_tenants: number;
    yesterday_amount: number; month_amount: number; expected_daily: number; paid_today: number;
  };
  agents: { with_tenants: number; collected_today: number; idle_today: number; total_expected_tenants: number };
  tenants: { active_repaying: number; daily_expected: number; outstanding: number; no_smartphone: number };
  pipeline: Record<
    'service_center_review' | 'pending' | 'agent_ops_approved' | 'awaiting_coo' | 'awaiting_cfo'
    | 'funded' | 'new_today' | 'disbursed_today' | 'rejected_month', Bucket
  >;
  money: {
    withdrawals_pending: Bucket; withdrawals_processing: Bucket; withdrawals_paid_today: Bucket;
    landlord_payouts_open: Bucket; landlord_payouts_failed: Bucket;
    agent_float_outstanding: number; wallet_float: number; wallet_withdrawable: number;
  };
  decisions: {
    rent_approvals: number; withdrawal_approvals: number; business_advances: number;
    requisitions: number; partner_portfolios: number;
  };
  partners: { active_portfolios: number; active_capital: number; partners: number };
}

const num = (v: unknown) => Number(v ?? 0);

function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

interface Props {
  /** Navigate the COO dashboard to a tab id. */
  onNavigate: (tab: string) => void;
}

export default function COOCommandCenter({ onNavigate }: Props) {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['coo-command-center'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_coo_command_center');
      if (error) throw error;
      return data as unknown as COOCommandCenterData;
    },
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-4 border-destructive/40">
        <p className="text-sm font-semibold text-destructive">Could not load the operations summary</p>
        <p className="text-xs text-muted-foreground mt-1">{(error as Error)?.message ?? 'No data returned.'}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => refetch()}>Try again</Button>
      </Card>
    );
  }

  const c = data.collections;
  const target = num(c.expected_daily);
  const collected = num(c.today_amount);
  const hitRate = pct(collected, target);
  const dayOverDay = num(c.yesterday_amount) > 0
    ? Math.round(((collected - num(c.yesterday_amount)) / num(c.yesterday_amount)) * 100)
    : null;

  const decisionItems = [
    { label: 'Rent requests to approve', n: num(data.decisions.rent_approvals), tab: 'rent-approvals', tone: 'blue' },
    { label: 'Withdrawals to approve', n: num(data.decisions.withdrawal_approvals), tab: 'withdrawals', tone: 'red' },
    { label: 'Business advances', n: num(data.decisions.business_advances), tab: 'advance-requests', tone: 'purple' },
    { label: 'Staff requisitions', n: num(data.decisions.requisitions), tab: 'requisitions', tone: 'amber' },
    { label: 'Partner portfolios', n: num(data.decisions.partner_portfolios), tab: 'partners', tone: 'indigo' },
  ];
  const totalDecisions = decisionItems.reduce((s, d) => s + d.n, 0);

  const toneClass: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-600 border-blue-500/25',
    red: 'bg-red-500/10 text-red-600 border-red-500/25',
    purple: 'bg-purple-500/10 text-purple-600 border-purple-500/25',
    amber: 'bg-amber-500/10 text-amber-600 border-amber-500/25',
    indigo: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/25',
  };

  const pipelineRows: { label: string; b: Bucket; tab: string }[] = [
    { label: 'At service centre', b: data.pipeline.service_center_review, tab: 'rent-approvals' },
    { label: 'With Tenant / Landlord Ops', b: data.pipeline.pending, tab: 'rent-approvals' },
    { label: 'Waiting on you', b: data.pipeline.awaiting_coo, tab: 'rent-approvals' },
    { label: 'Waiting on CFO payout', b: data.pipeline.awaiting_cfo, tab: 'rent-approvals' },
    { label: 'Funded, not yet repaying', b: data.pipeline.funded, tab: 'tenants' },
  ];

  return (
    <div className="space-y-4">
      {/* Live header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Operations Command Centre</h2>
          <p className="text-[11px] text-muted-foreground">
            Live figures, Kampala time · updated {new Date(data.generated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-8">
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* 1. Decisions waiting on the COO */}
      <Card className={cn('p-3.5', totalDecisions > 0 ? 'border-amber-500/40 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5')}>
        <div className="flex items-center gap-2 mb-3">
          {totalDecisions > 0
            ? <AlertTriangle className="h-4 w-4 text-amber-600" />
            : <ClipboardList className="h-4 w-4 text-emerald-600" />}
          <p className="text-sm font-bold">
            {totalDecisions > 0 ? `${totalDecisions} decisions need you` : 'Nothing waiting on you'}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {decisionItems.map((d) => (
            <button
              key={d.tab + d.label}
              onClick={() => onNavigate(d.tab)}
              className={cn(
                'rounded-xl border p-2.5 text-left transition-all hover:shadow-md active:scale-[0.97]',
                d.n > 0 ? toneClass[d.tone] : 'bg-muted/40 text-muted-foreground border-border'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold leading-none">{d.n}</span>
                <ChevronRight className="h-3.5 w-3.5 opacity-50" />
              </div>
              <p className="text-[11px] font-medium leading-tight mt-1.5">{d.label}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* 2. Today's collection performance */}
      <Card className="p-3.5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Collected today</p>
            <p className="text-2xl font-bold mt-0.5">
              <CompactAmount value={collected} />
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              of <CompactAmount value={target} /> expected · {c.today_count} payments from {c.today_tenants} tenants
            </p>
          </div>
          <div className="text-right shrink-0">
            <Badge variant={hitRate >= 70 ? 'default' : hitRate >= 40 ? 'secondary' : 'destructive'}>{hitRate}% of target</Badge>
            {dayOverDay !== null && (
              <p className={cn('text-[11px] font-semibold mt-1.5 flex items-center gap-1 justify-end',
                dayOverDay >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                {dayOverDay >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {dayOverDay >= 0 ? '+' : ''}{dayOverDay}% vs yesterday
              </p>
            )}
          </div>
        </div>
        <Progress value={hitRate} className="h-2" />
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-[10px] text-muted-foreground">Agents collecting</p>
            <p className="text-sm font-bold">{num(data.agents.collected_today)} / {num(data.agents.with_tenants)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-[10px] text-muted-foreground">Idle agents today</p>
            <p className={cn('text-sm font-bold', num(data.agents.idle_today) > 0 && 'text-amber-600')}>{num(data.agents.idle_today)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-[10px] text-muted-foreground">Month to date</p>
            <p className="text-sm font-bold"><CompactAmount value={num(c.month_amount)} /></p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('collections')}
          className="mt-3 w-full text-[11px] font-semibold text-primary flex items-center justify-center gap-1 hover:underline"
        >
          Open agent collections <ChevronRight className="h-3 w-3" />
        </button>
      </Card>

      {/* 3. Tenant book + Money on the move */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2.5">
            <Home className="h-3.5 w-3.5" /> Tenant book
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border p-2.5">
              <p className="text-[10px] text-muted-foreground">Actively repaying</p>
              <p className="text-lg font-bold">{num(data.tenants.active_repaying)}</p>
            </div>
            <div className="rounded-lg border p-2.5">
              <p className="text-[10px] text-muted-foreground">Expected each day</p>
              <p className="text-lg font-bold"><CompactAmount value={num(data.tenants.daily_expected)} /></p>
            </div>
            <div className="rounded-lg border p-2.5">
              <p className="text-[10px] text-muted-foreground">Still owed to us</p>
              <p className="text-lg font-bold"><CompactAmount value={num(data.tenants.outstanding)} /></p>
            </div>
            <div className="rounded-lg border p-2.5">
              <p className="text-[10px] text-muted-foreground">Without a smartphone</p>
              <p className="text-lg font-bold">{num(data.tenants.no_smartphone)}</p>
            </div>
          </div>
          <button onClick={() => onNavigate('tenants')} className="mt-3 w-full text-[11px] font-semibold text-primary flex items-center justify-center gap-1 hover:underline">
            Open repayment tracker <ChevronRight className="h-3 w-3" />
          </button>
        </Card>

        <Card className="p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2.5">
            <Banknote className="h-3.5 w-3.5" /> Money on the move
          </p>
          <div className="space-y-1.5">
            {[
              { label: 'Withdrawals awaiting approval', b: data.money.withdrawals_pending, tab: 'withdrawals', warn: true },
              { label: 'Withdrawals being paid out', b: data.money.withdrawals_processing, tab: 'wallets', warn: false },
              { label: 'Paid out today', b: data.money.withdrawals_paid_today, tab: 'wallets', warn: false },
              { label: 'Landlord payments not yet delivered', b: data.money.landlord_payouts_open, tab: 'agent-activity', warn: true },
              { label: 'Landlord payments that failed', b: data.money.landlord_payouts_failed, tab: 'agent-activity', warn: true },
            ].map((row) => (
              <button
                key={row.label}
                onClick={() => onNavigate(row.tab)}
                className="w-full flex items-center justify-between gap-2 rounded-lg border p-2 text-left hover:bg-muted/50 transition-colors"
              >
                <span className="text-[11px] font-medium leading-tight">{row.label}</span>
                <span className="shrink-0 text-right">
                  <span className={cn('text-sm font-bold', row.warn && num(row.b?.n) > 0 && 'text-amber-600')}>
                    <CompactAmount value={num(row.b?.amt)} />
                  </span>
                  <span className="block text-[10px] text-muted-foreground">{num(row.b?.n)} items</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* 4. Rent pipeline */}
      <Card className="p-3.5">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" /> Rent pipeline
          </p>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>New today: <b className="text-foreground">{num(data.pipeline.new_today?.n)}</b></span>
            <span>Disbursed today: <b className="text-foreground">{num(data.pipeline.disbursed_today?.n)}</b></span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {pipelineRows.map((r) => (
            <button
              key={r.label}
              onClick={() => onNavigate(r.tab)}
              className={cn(
                'rounded-xl border p-2.5 text-left transition-all hover:shadow-md active:scale-[0.97]',
                r.label === 'Waiting on you' && num(r.b?.n) > 0 && 'border-primary/50 bg-primary/5'
              )}
            >
              <p className="text-lg font-bold leading-none">{num(r.b?.n)}</p>
              <p className="text-[10px] font-semibold text-muted-foreground mt-1">
                <CompactAmount value={num(r.b?.amt)} />
              </p>
              <p className="text-[11px] font-medium leading-tight mt-1">{r.label}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* 5. Capital position */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Handshake className="h-3 w-3" /> Partner capital deployed</p>
          <p className="text-lg font-bold mt-1"><CompactAmount value={num(data.partners.active_capital)} /></p>
          <p className="text-[10px] text-muted-foreground">{num(data.partners.active_portfolios)} portfolios · {num(data.partners.partners)} partners</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Landmark className="h-3 w-3" /> Float with agents</p>
          <p className="text-lg font-bold mt-1"><CompactAmount value={num(data.money.agent_float_outstanding)} /></p>
          <p className="text-[10px] text-muted-foreground">Landlord payout float</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> Company float in wallets</p>
          <p className="text-lg font-bold mt-1"><CompactAmount value={num(data.money.wallet_float)} /></p>
          <p className="text-[10px] text-muted-foreground">Not withdrawable</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> User cash in wallets</p>
          <p className="text-lg font-bold mt-1"><CompactAmount value={num(data.money.wallet_withdrawable)} /></p>
          <p className="text-[10px] text-muted-foreground">Withdrawable balances</p>
        </Card>
      </div>
    </div>
  );
}
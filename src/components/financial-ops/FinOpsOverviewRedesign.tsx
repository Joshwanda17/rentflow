import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowRight, ArrowRightLeft, Banknote, Bell,
  CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Clock3, FileText,
  KeyRound, Mail, Menu, RefreshCw, Search, ShieldCheck, Wallet,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { WalletOverviewCard } from './WalletOverviewCard';
import { PhoneMoneyCard } from './PhoneMoneyCard';
import { MoneyWithAgentsCard } from './MoneyWithAgentsCard';
import { MerchantBalanceDisputesPanel } from './MerchantBalanceDisputesPanel';
import { AutoCreditSuccessRateTile } from './AutoCreditSuccessRateTile';
import { WalletBreakdownReadOnly } from './WalletBreakdownReadOnly';
import { FinancialOpsPulseStrip } from './FinancialOpsPulseStrip';

type Props = {
  onView: (view: 'home' | 'deposits' | 'offline_collections') => void;
  onOpenTool: (tool: string) => void;
  onOpenMore: () => void;
  walletBreakdownOpen: boolean;
  setWalletBreakdownOpen: (open: boolean) => void;
  focusBucket: 'float' | 'withdrawable' | null;
  onClearFocus: () => void;
};

const money = (value: number) =>
  new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(value);

function QueueSkeleton() {
  return <div className="animate-pulse rounded-2xl border border-border bg-card p-5 min-h-[178px]">
    <div className="h-9 w-9 rounded-xl bg-muted mb-5" />
    <div className="h-8 w-20 rounded bg-muted mb-2" />
    <div className="h-3 w-32 rounded bg-muted" />
  </div>;
}

function QueueCard({
  title, count, label, detail, icon: Icon, onClick, tone = 'amber', loading,
}: {
  title: string; count: number; label: string; detail: string;
  icon: typeof ShieldCheck; onClick: () => void;
  tone?: 'amber' | 'slate'; loading: boolean;
}) {
  if (loading) return <QueueSkeleton />;
  const clear = count === 0;
  return <button onClick={onClick}
    className="group min-h-[178px] rounded-2xl border border-border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    <div className="flex items-start justify-between gap-3">
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${clear ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : tone === 'amber' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${clear ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}>
        {clear ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
        {clear ? 'All clear' : 'Needs attention'}
      </span>
    </div>
    <div className="mt-5 flex items-end justify-between gap-3">
      <div>
        <div className="font-mono text-3xl font-bold tracking-tight tabular-nums">{count.toLocaleString()}</div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </div>
      <ChevronRight className="mb-1 h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
    </div>
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
      <div className="min-w-0 truncate text-xs text-muted-foreground">{clear ? 'Nothing waiting right now' : detail}</div>
      <span className="shrink-0 text-xs font-semibold text-primary">{clear ? 'View' : 'Review'} <ArrowRight className="ml-1 inline h-3 w-3" /></span>
    </div>
    <span className="sr-only">{title}</span>
  </button>;
}

function QuickAction({ icon: Icon, label, onClick }: { icon: typeof KeyRound; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex min-h-11 items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-left text-xs font-semibold text-foreground transition-colors hover:border-primary/35 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    <Icon className="h-4 w-4 shrink-0 text-primary" /><span>{label}</span><ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
  </button>;
}

export function FinOpsOverviewRedesign({
  onView, onOpenTool, onOpenMore, walletBreakdownOpen, setWalletBreakdownOpen,
  focusBucket, onClearFocus,
}: Props) {
  const qc = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [walletQuery, setWalletQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const { data: queues, isLoading: queuesLoading, isError: queuesError, refetch } = useQuery({
    queryKey: ['finops-wallet-overview-queues'],
    queryFn: async () => {
      const [userDeposits, fieldDeposits, withdrawals, claims] = await Promise.all([
        supabase.from('deposit_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('field_deposit_batches').select('id', { count: 'exact', head: true }).eq('status', 'pending_finops_verification'),
        supabase.from('withdrawal_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('withdrawal_requests').select('id', { count: 'exact', head: true }).in('status', ['claimed', 'processing']),
      ]);
      const firstError = userDeposits.error || fieldDeposits.error || withdrawals.error || claims.error;
      if (firstError) throw firstError;
      return {
        depositsPending: (userDeposits.count ?? 0) + (fieldDeposits.count ?? 0),
        payoutsPending: withdrawals.count ?? 0,
        activeClaims: claims.count ?? 0,
      };
    },
    staleTime: 10_000,
    refetchInterval: autoRefresh ? 15_000 : false,
    refetchOnWindowFocus: autoRefresh,
  });

  const refresh = async () => {
    await Promise.all([
      refetch(),
      qc.invalidateQueries({ queryKey: ['finops-wallet-overview'] }),
      qc.invalidateQueries({ queryKey: ['finops-wallet-overview-queues'] }),
      qc.invalidateQueries({ queryKey: ['finops-phone-money'] }),
    ]);
    setLastUpdated(new Date());
  };

  const timeLabel = useMemo(() => lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), [lastUpdated]);

  return <div className="min-w-0 space-y-5 pb-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <span>Financial Operations</span><ChevronRight className="h-3 w-3" /><span className="text-foreground">Overview</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[30px]">Financial Operations</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          Verify deposits, approve withdrawals and keep the platform balanced.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
          <span className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {autoRefresh ? 'Live updates' : 'Data may be out of date'} · {timeLabel}
        </span>
        <button onClick={refresh} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
        <button onClick={() => setAutoRefresh(v => !v)} aria-pressed={autoRefresh} title="Turn off to keep the screen stable while you review" className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${autoRefresh ? 'border-primary/30 bg-primary/5 text-primary' : 'border-border bg-card text-muted-foreground'}`}>
          <span className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-primary' : 'bg-muted-foreground'}`} /> Auto-refresh {autoRefresh ? 'On' : 'Off'}
        </button>
      </div>
    </header>

    <section className="flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300"><ShieldCheck className="h-5 w-5" /></span>
        <div><p className="text-sm font-semibold text-foreground">Nobody is paid to an unverified number.</p><p className="mt-0.5 text-xs text-muted-foreground">Confirm payout destinations before releasing funds.</p></div>
      </div>
      <button onClick={() => onOpenTool('withdrawals')} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
        Verify payout numbers <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </section>

    <section aria-label="Action queues" className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold tracking-tight">Needs your attention</h2><span className="text-[11px] text-muted-foreground">Live operational queues</span></div>
      {queuesError ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><span className="text-muted-foreground">Queue counts could not be loaded. Other dashboard sections remain available.</span><button onClick={() => refetch()} className="font-semibold text-primary">Retry</button></div> : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <QueueCard title="Verify Deposits" count={queues?.depositsPending ?? 0} label="Pending verification" detail="User deposits and agent field collections" icon={ShieldCheck} onClick={() => onView('deposits')} loading={queuesLoading} />
        <QueueCard title="Withdrawal Approvals" count={queues?.payoutsPending ?? 0} label="Payout requests" detail="Review requests before funds are released" icon={ArrowRightLeft} onClick={() => onOpenTool('withdrawals')} loading={queuesLoading} />
        <QueueCard title="Merchant Claims" count={queues?.activeClaims ?? 0} label="Active claims" detail="Merchant cash-out settlements in progress" icon={Banknote} onClick={() => onOpenTool('merchant_claims')} loading={queuesLoading} />
      </div>
    </section>

    <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold tracking-tight">Quick actions</h2><span className="text-[11px] text-muted-foreground">Frequently used tools</span></div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <QuickAction icon={KeyRound} label="Cash Deposit Codes" onClick={() => onOpenTool('cash_codes')} />
        <QuickAction icon={Mail} label="Email Transactions" onClick={() => onOpenTool('email_tx')} />
        <QuickAction icon={Wallet} label="Wallet Buckets" onClick={() => onOpenTool('wallet_breakdown')} />
        <QuickAction icon={Banknote} label="Payout Queue" onClick={() => onOpenTool('withdrawals')} />
        <QuickAction icon={Activity} label="Merchant Float" onClick={() => onOpenTool('merchant_float')} />
      </div>
    </section>

    <section className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2" aria-label="Platform balances">
      <div className="min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4"><div className="mb-2 flex items-center justify-between px-1"><h2 className="text-sm font-semibold">Ledger total</h2><span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">Wallet overview</span></div><WalletOverviewCard onOpenReconciliation={() => onOpenTool('recon')} onOpenBreakdown={() => onOpenTool('wallet_breakdown')} onDrillBucket={onFocusBucket} /></div>
      <div className="min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4"><div className="mb-2 flex items-center justify-between px-1"><h2 className="text-sm font-semibold">Phone money</h2><span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">Provider balances</span></div><PhoneMoneyCard /></div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <button type="button" onClick={() => setWalletBreakdownOpen(!walletBreakdownOpen)} aria-expanded={walletBreakdownOpen} className="flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 sm:px-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Search className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Wallet breakdown</span><span className="block text-xs text-muted-foreground">Search by name, phone or balance range · Read only</span></span>
        <span className="hidden min-w-0 flex-1 sm:block"><input value={walletQuery} onChange={e => setWalletQuery(e.target.value)} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} placeholder="Search by name, phone or balance range" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></span>
        <span className="shrink-0 text-xs font-semibold text-primary">{walletBreakdownOpen ? 'Collapse' : 'Expand search'}</span>
        {walletBreakdownOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {walletBreakdownOpen && <div className="border-t border-border p-3 sm:p-4"><WalletBreakdownReadOnly focusBucket={focusBucket} onClearFocus={onClearFocus} /></div>}
    </section>

    <section className="space-y-4">
      <MoneyWithAgentsCard onOpenTimeline={() => onOpenTool('cashout_settlement')} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2"><MerchantBalanceDisputesPanel /><AutoCreditSuccessRateTile onClick={() => onOpenTool('auto_credit_review')} /></div>
    </section>

    <section className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-semibold">System health</h2><span className="text-[10px] text-muted-foreground">Operational signals</span></div>
      <FinancialOpsPulseStrip onSelect={(key) => {
        if (key === 'deposits') onView('deposits');
        else if (key === 'cash_out' || key === 'wallet_ops' || key === 'invest_wd') onOpenTool('withdrawals');
        else if (key === 'today') onOpenTool('audit');
      }} />
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-medium">
        <button onClick={() => onOpenTool('bridge_health')} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-muted-foreground hover:bg-muted"><Activity className="h-3.5 w-3.5" /> Deposit bridge <span className="text-primary">View status</span></button>
        <button onClick={() => onOpenTool('recon')} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-muted-foreground hover:bg-muted"><CheckCircle2 className="h-3.5 w-3.5" /> Ledger integrity <span className="text-primary">Reconcile</span></button>
        <button onClick={() => onOpenTool('stale_withdrawal_holds')} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-muted-foreground hover:bg-muted"><Clock3 className="h-3.5 w-3.5" /> Stale withdrawal holds <span className="text-primary">Review</span></button>
      </div>
    </section>

    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => onOpenTool('bridge_health')} className="text-xs font-medium text-muted-foreground hover:text-primary">Bridge health</button>
        <span className="text-muted-foreground/50">·</span>
        <button onClick={() => onOpenTool('receipt_archive')} className="text-xs font-medium text-muted-foreground hover:text-primary">Receipt archive</button>
        <span className="text-muted-foreground/50">·</span>
        <button onClick={() => onOpenTool('cashout_settlement')} className="text-xs font-medium text-muted-foreground hover:text-primary">Cash-out timeline</button>
      </div>
      <button onClick={onOpenMore} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold hover:border-primary/40 hover:text-primary"><Menu className="h-4 w-4" /> Explore tools <ArrowRight className="h-3.5 w-3.5" /></button>
    </footer>
  </div>;
}

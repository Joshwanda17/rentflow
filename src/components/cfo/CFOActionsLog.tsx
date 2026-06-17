import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Clock, Download, Search, Filter, RefreshCw, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { format } from 'date-fns';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

/**
 * Ledger-derived CFO Actions Trail.
 *
 * This trail is driven DIRECTLY from `general_ledger` via the
 * `get_cfo_ledger_trail` RPC — one row per transaction (double-entry legs
 * are collapsed). Every cash movement that posts to the ledger appears here
 * automatically; there is no allow-list of action strings to maintain.
 */

type TrailRow = {
  group_id: string;
  transaction_date: string;
  amount: number;
  direction: string;
  category: string;
  classification: string | null;
  ledger_scope: string | null;
  description: string | null;
  user_id: string | null;
  actor_name: string | null;
  wallet_bucket: string | null;
  linked_party: string | null;
  reference_id: string | null;
  source_table: string | null;
  source_id: string | null;
  leg_count: number;
  total_count: number;
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

// Human-friendly labels for the common ledger categories. Anything not listed
// is auto-humanized (snake_case → Title Case), so new categories never vanish.
const CATEGORY_LABELS: Record<string, string> = {
  access_fee_collected: 'Access Fee',
  registration_fee_collected: 'Registration Fee',
  wallet_deposit: 'Wallet Deposit',
  deposit: 'Deposit',
  tenant_repayment: 'Tenant Repayment',
  agent_repayment: 'Agent Repayment',
  partner_funding: 'Partner Funding',
  supporter_capital: 'Supporter Capital',
  share_capital: 'Share Capital',
  rent_disbursement: 'Rent Disbursement',
  rent_principal_collected: 'Rent Principal Collected',
  landlord_rent_payment: 'Landlord Rent Payment',
  roi_expense: 'ROI Payout (Expense)',
  roi_wallet_credit: 'ROI Wallet Credit',
  roi_reinvestment: 'ROI Reinvestment',
  roi_payout: 'ROI Payout',
  agent_commission_earned: 'Agent Commission',
  agent_commission: 'Agent Commission',
  agent_commission_withdrawal: 'Commission Withdrawal',
  agent_commission_used_for_rent: 'Commission Used For Rent',
  partner_commission: 'Partner Commission',
  wallet_withdrawal: 'Wallet Withdrawal',
  wallet_transfer: 'Wallet Transfer',
  wallet_deduction: 'Wallet Deduction',
  proxy_partner_withdrawal: 'Partner Withdrawal',
  system_balance_correction: 'Balance Correction',
  agent_float_deposit: 'Agent Float Deposit',
  agent_float_assignment: 'Agent Float Assignment',
  agent_float_settlement: 'Agent Float Settlement',
  agent_float_used_for_rent: 'Float Used For Rent',
  agent_advance_credit: 'Agent Advance',
  marketing_expense: 'Marketing Expense',
  payroll_expense: 'Payroll',
  general_admin_expense: 'General & Admin',
  research_development_expense: 'R&D Expense',
  tax_expense: 'Tax',
  interest_expense: 'Interest Expense',
  equipment_expense: 'Equipment',
  debt_recovery: 'Debt Recovery',
  tenant_default_charge: 'Tenant Default Penalty',
  pending_portfolio_topup: 'Portfolio Top-up',
};

const CATEGORY_ICONS: Record<string, string> = {
  wallet_deposit: '💵', deposit: '💵', partner_funding: '🏦', supporter_capital: '🏦', share_capital: '🏦',
  roi_expense: '📉', roi_payout: '📈', roi_wallet_credit: '📈', roi_reinvestment: '🔁',
  agent_commission_earned: '👤', agent_commission: '👤', partner_commission: '🤝',
  wallet_withdrawal: '💸', proxy_partner_withdrawal: '💸', wallet_transfer: '🔁',
  wallet_deduction: '🔻', system_balance_correction: '🔧',
  rent_disbursement: '🏠', landlord_rent_payment: '🏠', rent_principal_collected: '🏠',
  agent_float_deposit: '🏦', agent_float_assignment: '🏦', agent_float_settlement: '🏦',
  marketing_expense: '📣', payroll_expense: '📋', general_admin_expense: '🗂️',
  access_fee_collected: '✅', registration_fee_collected: '✅',
};

const labelFor = (cat: string) =>
  CATEGORY_LABELS[cat] ||
  cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const FILTER_GROUPS: { label: string; value: string; categories: string[] | null }[] = [
  { label: 'All Movements', value: 'all', categories: null },
  { label: 'Deposits & Funding', value: 'inflow', categories: ['wallet_deposit', 'deposit', 'partner_funding', 'supporter_capital', 'share_capital', 'tenant_repayment', 'agent_repayment'] },
  { label: 'Withdrawals', value: 'withdrawals', categories: ['wallet_withdrawal', 'proxy_partner_withdrawal', 'wallet_deduction'] },
  { label: 'ROI', value: 'roi', categories: ['roi_expense', 'roi_payout', 'roi_wallet_credit', 'roi_reinvestment'] },
  { label: 'Commissions', value: 'commissions', categories: ['agent_commission_earned', 'agent_commission', 'agent_commission_withdrawal', 'partner_commission'] },
  { label: 'Rent & Landlord', value: 'rent', categories: ['rent_disbursement', 'landlord_rent_payment', 'rent_principal_collected'] },
  { label: 'Agent Float', value: 'float', categories: ['agent_float_deposit', 'agent_float_assignment', 'agent_float_settlement', 'agent_float_used_for_rent', 'agent_advance_credit'] },
  { label: 'Expenses', value: 'expenses', categories: ['marketing_expense', 'payroll_expense', 'general_admin_expense', 'research_development_expense', 'tax_expense', 'interest_expense', 'equipment_expense'] },
  { label: 'Corrections', value: 'corrections', categories: ['system_balance_correction'] },
];

const PAGE_SIZE = 25;

export function CFOActionsLog() {
  const [filterGroup, setFilterGroup] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(0);
  const search = useDebouncedValue(searchInput.trim(), 350);

  // Reset to first page whenever the query (filter or search) changes.
  useEffect(() => {
    setPage(0);
  }, [filterGroup, search]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['cfo-ledger-trail', filterGroup, search, page],
    queryFn: async () => {
      const group = FILTER_GROUPS.find((g) => g.value === filterGroup);
      const categories = group?.categories ?? null;

      const { data, error } = await supabase.rpc('get_cfo_ledger_trail', {
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
        p_categories: categories,
        p_classification: null,
        p_search: search || null,
        p_from: null,
        p_to: null,
      });
      if (error) throw error;
      const result = (data || []) as TrailRow[];
      return {
        rows: result,
        total: result.length ? Number(result[0].total_count) || 0 : 0,
      };
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const filtered = data?.rows || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page + 1) * PAGE_SIZE);

  const handleExportCSV = () => {
    if (!filtered.length) return;
    const header = 'Date,Movement,Direction,Amount,Party,Classification,Reference,Source,Description\n';
    const csv =
      header +
      filtered
        .map((r) => {
          const cells = [
            format(new Date(r.transaction_date), 'yyyy-MM-dd HH:mm'),
            labelFor(r.category),
            r.direction === 'cash_out' || r.direction === 'debit' ? 'OUT' : 'IN',
            String(r.amount ?? ''),
            r.actor_name || '',
            r.classification || '',
            r.reference_id || '',
            r.source_table || '',
            (r.description || '').replace(/"/g, '""'),
          ];
          return cells.map((c) => `"${c}"`).join(',');
        })
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cfo-ledger-trail-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-4 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            CFO Actions Trail
            {total > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px]">{total.toLocaleString()}</Badge>
            )}
          </p>
          <div className="flex items-center gap-1">
            {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleExportCSV} disabled={!filtered.length}>
              <Download className="h-3 w-3" /> CSV
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">
          Derived directly from the general ledger — every posted cash movement appears automatically.
        </p>

        <div className="flex gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[120px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search name, description, reference…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-7 text-xs pl-7 pr-7"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Select value={filterGroup} onValueChange={setFilterGroup}>
            <SelectTrigger className="h-7 text-xs w-[160px]">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_GROUPS.map((g) => (
                <SelectItem key={g.value} value={g.value} className="text-xs">{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!filtered.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">No movements found.</p>
        ) : (
          <>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filtered.map((r) => {
              const amount = Number(r.amount) || 0;
              const isOut = r.direction === 'cash_out' || r.direction === 'debit';
              const icon = CATEGORY_ICONS[r.category] || '📋';
              const label = labelFor(r.category);
              const isCorrection = r.classification === 'admin_correction';

              return (
                <div key={r.group_id} className="flex items-start gap-3 p-2.5 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors">
                  <div className="text-lg shrink-0 mt-0.5">{icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold truncate">{label}</p>
                      {amount > 0 && (
                        <p className={`text-xs font-bold font-mono tabular-nums shrink-0 ${isOut ? 'text-destructive' : 'text-emerald-600'}`}>
                          {isOut ? '−' : '+'}{fmt(amount)}
                        </p>
                      )}
                    </div>
                    {r.actor_name && r.actor_name !== 'System' && (
                      <p className="text-[11px] text-foreground/80 truncate">{r.actor_name}</p>
                    )}
                    {r.description && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{r.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <div className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(r.transaction_date), 'MMM d, h:mm a')}
                        </p>
                      </div>
                      {r.reference_id && (
                        <span className="text-[10px] text-muted-foreground/70 font-mono truncate max-w-[140px]">
                          {r.reference_id}
                        </span>
                      )}
                      {isCorrection && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-orange-400 text-orange-600">
                          Correction
                        </Badge>
                      )}
                      {r.source_table && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground">
                          {r.source_table}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border/50">
            <span className="text-[10px] text-muted-foreground">
              {rangeStart}–{rangeEnd} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || isFetching}
              >
                <ChevronLeft className="h-3 w-3" /> Prev
              </Button>
              <span className="text-[10px] text-muted-foreground tabular-nums px-1">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || isFetching}
              >
                Next <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { CompactAmount } from '@/components/ui/CompactAmount';
import { cn } from '@/lib/utils';

interface BreakdownEntry {
  category: string;
  direction: string;
  entry_count: number;
  total_amount: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  access_fee_collected: 'Access Fees Collected',
  registration_fee_collected: 'Registration Fees',
  tenant_access_fee: 'Tenant Access Fees',
  tenant_request_fee: 'Tenant Request Fees',
  platform_service_income: 'Platform Service Income',
  landlord_platform_fee: 'Landlord Platform Fees',
  management_fee: 'Management Fees',
  access_fee: 'Access Fees',
  request_fee: 'Request Fees',
  wallet_deduction: 'Wallet Deductions',
  rent_principal_collected: 'Rent Principal Collected',
  agent_repayment: 'Agent Repayments',
  tenant_repayment: 'Tenant Repayments',
  partner_funding: 'Partner Funding',
  share_capital: 'Share Capital',
  wallet_deposit: 'Wallet Deposits',
  roi_expense: 'ROI Payouts',
  roi_wallet_credit: 'ROI Wallet Credits',
  agent_commission_earned: 'Agent Commissions',
  agent_commission_payout: 'Agent Commission Payouts',
  agent_commission: 'Agent Commissions',
  agent_payout: 'Agent Payouts',
  agent_approval_bonus: 'Agent Approval Bonuses',
  referral_bonus: 'Referral Bonuses',
  supporter_platform_rewards: 'Supporter Rewards',
  supporter_reward: 'Supporter Rewards',
  investment_reward: 'Investment Rewards',
  operational_expenses: 'Operational Expenses',
  platform_expense: 'Platform Expenses',
  transaction_platform_expenses: 'Transaction Expenses',
  system_balance_correction: 'System Corrections',
  rent_disbursement: 'Rent Disbursements',
  rent_receivable_created: 'Rent Receivables Created',
  wallet_withdrawal: 'Wallet Withdrawals',
  agent_requisition: 'Agent Requisitions',
  salary_payment: 'Salary Payments',
  employee_advance: 'Employee Advances',
  platform_expense_disbursement: 'Finance Disbursements',
};

function formatCategory(cat: string): string {
  return CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function PlatformCashBreakdown() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-cash-breakdown'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_platform_cash_breakdown');
      if (error) throw error;
      return (data as BreakdownEntry[] | null) || [];
    },
    staleTime: 300_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  const increases = data
    .filter(e => e.direction === 'cash_in')
    .sort((a, b) => b.total_amount - a.total_amount);
  const decreases = data
    .filter(e => e.direction === 'cash_out')
    .sort((a, b) => b.total_amount - a.total_amount);

  const totalIn = increases.reduce((s, e) => s + e.total_amount, 0);
  const totalOut = decreases.reduce((s, e) => s + e.total_amount, 0);

  return (
    <div className="space-y-4">
      {/* Increases */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
            What Increases Platform Cash
          </h3>
          <span className="ml-auto text-xs font-mono font-bold text-emerald-600">
            +<CompactAmount value={totalIn} />
          </span>
        </div>
        <div className="space-y-1.5">
          {increases.map(e => (
            <div key={`${e.category}-${e.direction}`} className="flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate text-foreground">{formatCategory(e.category)}</span>
                <span className="text-muted-foreground shrink-0">({e.entry_count})</span>
              </div>
              <span className="font-mono font-semibold text-emerald-600 shrink-0">
                +<CompactAmount value={e.total_amount} />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Decreases */}
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="h-4 w-4 text-destructive" />
          <h3 className="text-sm font-bold text-red-700 dark:text-red-400">
            What Decreases Platform Cash
          </h3>
          <span className="ml-auto text-xs font-mono font-bold text-destructive">
            -<CompactAmount value={totalOut} />
          </span>
        </div>
        <div className="space-y-1.5">
          {decreases.map(e => (
            <div key={`${e.category}-${e.direction}`} className="flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                <span className="truncate text-foreground">{formatCategory(e.category)}</span>
                <span className="text-muted-foreground shrink-0">({e.entry_count})</span>
              </div>
              <span className="font-mono font-semibold text-destructive shrink-0">
                -<CompactAmount value={e.total_amount} />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Net */}
      <div className={cn(
        "rounded-xl border-2 p-3 text-center",
        totalIn - totalOut >= 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"
      )}>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net Platform Cash</p>
        <p className={cn(
          "text-lg font-bold font-mono",
          totalIn - totalOut >= 0 ? "text-emerald-600" : "text-destructive"
        )}>
          <CompactAmount value={totalIn - totalOut} />
        </p>
      </div>
    </div>
  );
}

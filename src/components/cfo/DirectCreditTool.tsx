import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { extractFromErrorObject } from '@/lib/extractEdgeFunctionError';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, ArrowUpRight, ArrowDownLeft, TrendingUp, TrendingDown, Minus, Info, ChevronDown } from 'lucide-react';
import { UserSearchPicker } from './UserSearchPicker';
import { TreasuryImpactBanner } from './TreasuryImpactBanner';
import { RentDisbursementQueue } from './RentDisbursementQueue';
import { BusinessAdvanceDisbursementQueue } from './BusinessAdvanceDisbursementQueue';
import { ROIPayoutQueue } from './ROIPayoutQueue';
import { PayoutAutomationToggle } from './PayoutAutomationToggle';

type Operation = 'credit' | 'debit';
type FinancialImpact = 'expense' | 'revenue' | 'neutral';

interface SubCategory {
  id: string;
  label: string;
}

interface PayoutCategory {
  id: string;
  label: string;
  description: string;
  impact: FinancialImpact;
  walletCategory: string;
  platformCategory: string;
  allowedOps: Operation[];
  subCategories?: SubCategory[];
}

const PAYOUT_CATEGORIES: PayoutCategory[] = [
  // ── CREDIT (Platform → Wallet) ──
  {
    id: 'roi_payout',
    label: '📈 ROI Payout',
    description: 'Return on investment to a partner/supporter',
    impact: 'expense',
    walletCategory: 'roi_wallet_credit',
    platformCategory: 'roi_expense',
    allowedOps: ['credit'],
  },
  {
    id: 'rent_disbursement',
    label: '🏠 Rent Disbursement',
    description: 'Approved rent payouts to landlord wallets or agent float — earns access fees & request fees',
    impact: 'revenue',
    walletCategory: 'rent_disbursement',
    platformCategory: 'rent_disbursement',
    allowedOps: ['credit'],
  },
  {
    id: 'business_advance',
    label: '💼 Business Advance',
    description: 'COO-approved business advances paid into tenant wallets — earns 1% daily compounding interest (4% commission to originating agent)',
    impact: 'revenue',
    walletCategory: 'rent_disbursement',
    platformCategory: 'rent_disbursement',
    allowedOps: ['credit'],
  },
  {
    id: 'marketing_expenses',
    label: '📢 Marketing Expenses',
    description: 'Payments for marketing, advertising, and promotional activities',
    impact: 'expense',
    walletCategory: 'marketing_expense',
    platformCategory: 'marketing_expense',
    allowedOps: ['credit'],
    subCategories: [
      { id: 'marketing_materials', label: 'Marketing Materials' },
      { id: 'events_exhibition', label: 'Events & Exhibition' },
    ],
  },
  {
    id: 'agent_commission',
    label: '🤝 Agent Commissions',
    description: 'Commission earned by an agent for rent collection',
    impact: 'expense',
    walletCategory: 'agent_commission_earned',
    platformCategory: 'agent_commission_earned',
    allowedOps: ['credit'],
  },
  {
    id: 'research_development',
    label: '🔬 Research & Development',
    description: 'R&D expenditures, innovation costs, and technology investments',
    impact: 'expense',
    walletCategory: 'research_development_expense',
    platformCategory: 'research_development_expense',
    allowedOps: ['credit'],
    subCategories: [
      { id: 'software', label: 'Software' },
      { id: 'welile_dowry', label: 'Welile Dowry' },
    ],
  },
  {
    id: 'operational_expense',
    label: '🏢 Operational Expenses',
    description: 'Day-to-day operational costs including staff, office, and utilities',
    impact: 'expense',
    walletCategory: 'general_admin_expense',
    platformCategory: 'general_admin_expense',
    allowedOps: ['credit'],
    subCategories: [
      { id: 'salaries', label: 'Salaries' },
      { id: 'transport', label: 'Transport' },
      { id: 'food', label: 'Food' },
      { id: 'office_rent', label: 'Office Rent' },
      { id: 'internet', label: 'Internet' },
      { id: 'airtime', label: 'Airtime' },
      { id: 'stationery', label: 'Stationery' },
      { id: 'property_equipment', label: 'Property & Equipment' },
      { id: 'eviction_enforcement', label: 'Eviction & Enforcement' },
    ],
  },
  {
    id: 'payroll',
    label: '💰 Payroll',
    description: 'Staff salaries, wages, and payroll-related expenses',
    impact: 'expense',
    walletCategory: 'payroll_expense',
    platformCategory: 'payroll_expense',
    allowedOps: ['credit'],
  },
  {
    id: 'tax_payment',
    label: '🏛️ Tax Payment',
    description: 'Income tax, VAT, withholding tax, and other government levies',
    impact: 'expense',
    walletCategory: 'tax_expense',
    platformCategory: 'tax_expense',
    allowedOps: ['credit'],
  },
  {
    id: 'interest_payment',
    label: '🏦 Interest Payment',
    description: 'Interest on loans, advances, or credit facilities',
    impact: 'expense',
    walletCategory: 'interest_expense',
    platformCategory: 'interest_expense',
    allowedOps: ['credit'],
  },
  {
    id: 'equipment_purchase',
    label: '🖥️ Equipment & Assets',
    description: 'Capital expenditure on property, equipment, and fixed assets',
    impact: 'expense',
    walletCategory: 'equipment_expense',
    platformCategory: 'equipment_expense',
    allowedOps: ['credit'],
  },
  {
    id: 'correction_credit',
    label: '🔧 Balance Correction (Credit)',
    description: 'Fix an error — add missing funds to a user wallet',
    impact: 'neutral',
    walletCategory: 'system_balance_correction',
    platformCategory: 'system_balance_correction',
    allowedOps: ['credit'],
  },
  {
    id: 'wallet_transfer_out',
    label: '🔄 Internal Transfer',
    description: 'Move funds from platform to a user wallet (inter-account)',
    impact: 'neutral',
    walletCategory: 'wallet_transfer',
    platformCategory: 'wallet_transfer',
    allowedOps: ['credit'],
  },

  // ── DEBIT (Wallet → Platform) ──
  {
    id: 'fee_collection',
    label: '💰 Fee Collection',
    description: 'Collect access fee, registration fee, or service charge',
    impact: 'revenue',
    walletCategory: 'wallet_deduction',
    platformCategory: 'access_fee_collected',
    allowedOps: ['debit'],
  },
  {
    id: 'penalty',
    label: '⚠️ Penalty / Fine',
    description: 'Penalty for rule violation, late payment, or fraud',
    impact: 'revenue',
    walletCategory: 'wallet_deduction',
    platformCategory: 'wallet_deduction',
    allowedOps: ['debit'],
  },
  {
    id: 'correction_debit',
    label: '🔧 Balance Correction (Debit)',
    description: 'Fix an error — remove excess funds from a user wallet',
    impact: 'neutral',
    walletCategory: 'system_balance_correction',
    platformCategory: 'system_balance_correction',
    allowedOps: ['debit'],
  },
  {
    id: 'overpayment_recovery',
    label: '🔁 Overpayment Recovery',
    description: 'Recover funds that were credited in error or overpaid',
    impact: 'revenue',
    walletCategory: 'wallet_deduction',
    platformCategory: 'wallet_deduction',
    allowedOps: ['debit'],
  },
  {
    id: 'wallet_retraction',
    label: '🚫 Wallet Retraction',
    description: 'Retract funds paid out externally that still show in balance',
    impact: 'neutral',
    walletCategory: 'wallet_deduction',
    platformCategory: 'wallet_deduction',
    allowedOps: ['debit'],
  },
];

const IMPACT_CONFIG: Record<FinancialImpact, { label: string; color: string; icon: typeof TrendingUp }> = {
  revenue: { label: 'Revenue', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: TrendingUp },
  expense: { label: 'Expense', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: TrendingDown },
  neutral: { label: 'Neutral', color: 'text-muted-foreground bg-muted/50 border-border', icon: Minus },
};

// Map a wallet category to the wallet bucket it lands in, so the CFO knows
// whether the user can actually withdraw the credited amount.
type WalletBucket = 'withdrawable' | 'float' | 'advance';
const WALLET_BUCKET_MAP: Record<string, WalletBucket> = {
  roi_wallet_credit: 'withdrawable',
  agent_commission_earned: 'withdrawable',
  system_balance_correction: 'withdrawable',
  wallet_transfer: 'withdrawable',
  rent_disbursement: 'float',
  marketing_expense: 'withdrawable',
  research_development_expense: 'withdrawable',
  general_admin_expense: 'withdrawable',
  payroll_expense: 'withdrawable',
  tax_expense: 'withdrawable',
  interest_expense: 'withdrawable',
  equipment_expense: 'withdrawable',
};
const BUCKET_LABEL: Record<WalletBucket, { name: string; note: string; tone: string }> = {
  withdrawable: {
    name: 'Withdrawable by user',
    note: 'Lands directly in the user\u2019s withdrawable bucket — they can cash out immediately.',
    tone: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  advance: {
    name: 'Withdrawable by user (after advance recovery)',
    note: 'Sweeps any outstanding advance debt first, then the remainder lands in withdrawable. Advance balance also counts as withdrawable.',
    tone: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  float: {
    name: 'Operational Float — not withdrawable',
    note: 'Company/operational money reserved for agent/partner operations. The user CANNOT withdraw this.',
    tone: 'text-amber-700 bg-amber-50 border-amber-200',
  },
};

export function DirectCreditTool() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [operation, setOperation] = useState<Operation>('credit');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState('');
  const [automateEnabled, setAutomateEnabled] = useState(false);
  const [automateDay, setAutomateDay] = useState(1);

  const { data: rentQueueCount = 0 } = useQuery({
    queryKey: ['rent-disbursement-queue-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('rent_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'coo_approved');
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 20_000,
  });

  const { data: businessAdvanceQueueCount = 0 } = useQuery({
    queryKey: ['business-advance-disbursement-queue-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('business_advances')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'coo_approved');
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 20_000,
  });

  const { data: roiPayoutQueueCount = 0 } = useQuery({
    queryKey: ['roi-payout-queue-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('pending_wallet_operations')
        .select('id', { count: 'exact', head: true })
        .eq('category', 'roi_payout')
        .eq('status', 'coo_approved');
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 20_000,
  });

  const availableCategories = useMemo(
    () => PAYOUT_CATEGORIES.filter(c => c.allowedOps.includes(operation)),
    [operation]
  );

  const selectedCategory = useMemo(
    () => PAYOUT_CATEGORIES.find(c => c.id === selectedCategoryId),
    [selectedCategoryId]
  );

  const hasSubCategories = selectedCategory?.subCategories && selectedCategory.subCategories.length > 0;
  const needsSubCategory = hasSubCategories && !selectedSubCategoryId;

  const selectedSubCategory = useMemo(
    () => selectedCategory?.subCategories?.find(s => s.id === selectedSubCategoryId),
    [selectedCategory, selectedSubCategoryId]
  );

  const isRentDisbursement = selectedCategoryId === 'rent_disbursement';
  const isBusinessAdvance = selectedCategoryId === 'business_advance';
  const isROIPayout = selectedCategoryId === 'roi_payout';
  const isQueueCategory = isRentDisbursement || isBusinessAdvance || isROIPayout;

  const handleOperationChange = (op: Operation) => {
    setOperation(op);
    setSelectedCategoryId('');
    setSelectedSubCategoryId('');
    setAutomateEnabled(false);
  };

  const handleCategoryChange = (catId: string) => {
    setSelectedCategoryId(catId);
    setSelectedSubCategoryId('');
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) throw new Error('Invalid amount');
      if (!reason || reason.length < 10) throw new Error('Reason must be at least 10 characters');
      if (!selectedUser) throw new Error('Select a user');
      if (!selectedCategory) throw new Error('Select a payout category');
      if (hasSubCategories && !selectedSubCategoryId) throw new Error('Select a subcategory');

      const categoryLabel = selectedSubCategory
        ? `${selectedCategory.label} → ${selectedSubCategory.label}`
        : selectedCategory.label;

      const { data, error } = await supabase.functions.invoke('cfo-direct-credit', {
        body: {
          target_user_id: selectedUser.id,
          amount: amt,
          reason,
          operation,
          wallet_category: selectedCategory.walletCategory,
          platform_category: selectedCategory.platformCategory,
          financial_impact: selectedCategory.impact,
          category_label: categoryLabel,
          sub_category: selectedSubCategoryId || null,
        },
      });
      if (error) {
        const msg = await extractFromErrorObject(error, 'Something went wrong');
        if (msg.includes('Unauthorized')) throw new Error('You do not have permission. Please log in again.');
        if (msg.includes('Insufficient permissions')) throw new Error('Your role does not have CFO privileges.');
        if (msg.includes('Target user not found')) throw new Error('The selected user could not be found.');
        if (msg.includes('Invalid amount')) throw new Error('Please enter a valid amount between 1 and 50,000,000 UGX.');
        if (msg.includes('Reason must be')) throw new Error('Please provide a detailed reason (at least 10 characters).');
        if (msg.includes('Insufficient ledger balance')) throw new Error(msg);
        if (msg.includes('Ledger error')) throw new Error(msg);
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      if (automateEnabled && selectedUser) {
        const { error: schedErr } = await supabase.from('scheduled_payouts').insert({
          created_by: (await supabase.auth.getUser()).data.user?.id,
          target_user_id: selectedUser.id,
          amount: amt,
          category_id: selectedCategoryId,
          sub_category: selectedSubCategoryId || null,
          reason,
          frequency: 'monthly',
          day_of_month: automateDay,
          enabled: true,
          next_run_at: getNextRunDate(automateDay),
        });
        if (schedErr) {
          console.error('[DirectCreditTool] Failed to save schedule:', schedErr);
          toast({ title: '⚠️ Payout succeeded but schedule failed', description: schedErr.message, variant: 'destructive' });
        } else {
          toast({ title: '🔁 Recurring payout saved', description: `Will auto-pay on day ${automateDay} every month` });
        }
      }

      return data;
    },
    onSuccess: (data) => {
      toast({ title: operation === 'credit' ? '✅ Credit applied' : '✅ Debit applied', description: data?.message });
      qc.invalidateQueries({ queryKey: ['expense-transfers'] });
      qc.invalidateQueries({ queryKey: ['channel-balances'] });
      qc.invalidateQueries({ queryKey: ['treasury-cash-snapshot'] });
      qc.invalidateQueries({ queryKey: ['cfo-overview'] });
      setSelectedUser(null);
      setAmount('');
      setReason('');
      setSelectedCategoryId('');
      setSelectedSubCategoryId('');
      setAutomateEnabled(false);
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const isCredit = operation === 'credit';
  const amt = parseFloat(amount || '0');
  const impactInfo = selectedCategory ? IMPACT_CONFIG[selectedCategory.impact] : null;
  const ImpactIcon = impactInfo?.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {isCredit ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> : <ArrowDownLeft className="h-4 w-4 text-destructive" />}
          CFO Wallet Adjustment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={isCredit ? 'default' : 'outline'}
            className={isCredit ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
            onClick={() => handleOperationChange('credit')}
          >
            <ArrowUpRight className="h-4 w-4 mr-1.5 shrink-0" />
            <span className="hidden sm:inline">Platform → Wallet</span>
            <span className="sm:hidden">Credit</span>
          </Button>
          <Button
            type="button"
            variant={!isCredit ? 'default' : 'outline'}
            className={!isCredit ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : ''}
            onClick={() => handleOperationChange('debit')}
          >
            <ArrowDownLeft className="h-4 w-4 mr-1.5 shrink-0" />
            <span className="hidden sm:inline">Wallet → Platform</span>
            <span className="sm:hidden">Debit</span>
          </Button>
        </div>

        <div>
          <Label htmlFor="payout-category" className="flex items-center gap-1.5 mb-1.5">
            Payout Category
            <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <select
              id="payout-category"
              value={selectedCategoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="flex h-10 w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground transition-colors ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary/50"
            >
              <option value="">Select a category...</option>
              {availableCategories.map((cat) => {
                const impactLabel = IMPACT_CONFIG[cat.impact].label;
                let readySuffix = '';
                if (cat.id === 'rent_disbursement' && rentQueueCount > 0) {
                  readySuffix = ` • ${rentQueueCount} ready`;
                } else if (cat.id === 'business_advance' && businessAdvanceQueueCount > 0) {
                  readySuffix = ` • ${businessAdvanceQueueCount} ready`;
                } else if (cat.id === 'roi_payout' && roiPayoutQueueCount > 0) {
                  readySuffix = ` • ${roiPayoutQueueCount} ready`;
                }
                return (
                  <option key={cat.id} value={cat.id}>
                    {`${cat.label} — ${impactLabel}${readySuffix}`}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {hasSubCategories && (
          <div>
            <Label htmlFor="payout-subcategory" className="flex items-center gap-1.5 mb-1.5">
              Subcategory
              <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <select
                id="payout-subcategory"
                value={selectedSubCategoryId}
                onChange={(e) => setSelectedSubCategoryId(e.target.value)}
                className="flex h-10 w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground transition-colors ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary/50"
              >
                <option value="">Select a subcategory...</option>
                {selectedCategory?.subCategories?.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        )}

        {/* Category Impact Explanation */}

        {selectedCategory && impactInfo && ImpactIcon && !isQueueCategory && !needsSubCategory && (
          <div className={`rounded-lg border p-3 text-xs space-y-1.5 ${impactInfo.color}`}>
            <div className="flex items-center gap-2 font-semibold">
              <ImpactIcon className="h-4 w-4" />
              Financial Impact: {impactInfo.label}
            </div>
            <p className="opacity-80">{selectedCategory.description}</p>
            {selectedSubCategory && (
              <p className="font-medium">📂 Subcategory: {selectedSubCategory.label}</p>
            )}
            <div className="pt-1 border-t border-current/10 space-y-0.5 text-[10px]">
              <p><span className="font-medium">Wallet entry:</span> {selectedCategory.walletCategory.replace(/_/g, ' ')}</p>
              <p><span className="font-medium">Platform entry:</span> {selectedCategory.platformCategory.replace(/_/g, ' ')}</p>
              {selectedCategory.impact === 'expense' && (
                <p className="font-medium text-orange-700">
                  📉 This payout is a platform expense — reduces platform earnings.
                </p>
              )}
              {selectedCategory.impact === 'revenue' && (
                <p className="font-medium text-emerald-700">
                  ✅ This payout earns money for the platform — recorded as platform income.
                </p>
              )}
              {selectedCategory.impact === 'neutral' && (
                <p className="font-medium">
                  ➖ This is a balance adjustment — no effect on profit or loss.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── RENT DISBURSEMENT QUEUE ── */}
        {isRentDisbursement && (
          <RentDisbursementQueue />
        )}

        {/* ── BUSINESS ADVANCE DISBURSEMENT QUEUE ── */}
        {isBusinessAdvance && (
          <BusinessAdvanceDisbursementQueue />
        )}

        {/* ── ROI PAYOUT QUEUE ── */}
        {isROIPayout && (
          <ROIPayoutQueue />
        )}

        {/* ── MANUAL PAYOUT FORM (non-queue categories) ── */}
        {!isQueueCategory && selectedCategoryId && !needsSubCategory && (
          <>
            <UserSearchPicker
              label="Search User"
              placeholder="Name or phone..."
              selectedUser={selectedUser}
              onSelect={setSelectedUser}
            />

            <div>
              <Label>Amount (UGX)</Label>
              <Input type="number" placeholder="50000" value={amount} onChange={e => setAmount(e.target.value)} />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[10000, 50000, 100000, 200000, 500000].map(v => (
                  <Button key={v} size="sm" variant="outline" className="text-xs h-7" onClick={() => setAmount(String(v))}>
                    {(v / 1000).toFixed(0)}K
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label>Reason (min 10 chars)</Label>
              <Textarea
                placeholder={isCredit
                  ? 'e.g. ROI payout for March cycle, salary advance for agent...'
                  : 'e.g. Access fee collection, penalty for policy violation...'}
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={2}
              />
              <p className="text-[10px] text-muted-foreground mt-1">{reason.length}/10 characters minimum</p>
            </div>

            {/* Automation Toggle (credit only) */}
            {isCredit && selectedUser && (
              <PayoutAutomationToggle
                enabled={automateEnabled}
                onToggle={setAutomateEnabled}
                dayOfMonth={automateDay}
                onDayChange={setAutomateDay}
              />
            )}

            {/* Treasury Impact */}
            {amt > 0 && isCredit && (
              <TreasuryImpactBanner payoutAmount={amt} />
            )}

            {/* Summary before submit */}
            {selectedCategory && amt > 0 && selectedUser && (
              <div className="rounded-lg bg-muted/30 border p-3 text-xs space-y-1">
                <p className="font-bold text-sm flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  Double-Entry Summary
                </p>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 overflow-x-auto">
                  <span className="text-muted-foreground">Entry 1:</span>
                  <span>
                    {isCredit ? '↗ Credit' : '↘ Debit'} UGX {amt.toLocaleString()} {isCredit ? 'to' : 'from'}{' '}
                    <span className="font-medium">{selectedUser.full_name}</span>'s wallet
                    <Badge variant="outline" className="ml-1 text-[8px] px-1">{selectedCategory.walletCategory.replace(/_/g, ' ')}</Badge>
                  </span>
                  <span className="text-muted-foreground">Entry 2:</span>
                  <span>
                    {isCredit ? '↘ Debit' : '↗ Credit'} UGX {amt.toLocaleString()} {isCredit ? 'from' : 'to'} platform
                    <Badge variant="outline" className="ml-1 text-[8px] px-1">{selectedCategory.platformCategory.replace(/_/g, ' ')}</Badge>
                  </span>
                  {selectedSubCategory && (
                    <>
                      <span className="text-muted-foreground">Tag:</span>
                      <span>📂 {selectedSubCategory.label}</span>
                    </>
                  )}
                  {automateEnabled && (
                    <>
                      <span className="text-muted-foreground">Recurrence:</span>
                      <span>🔁 Monthly on day {automateDay}</span>
                    </>
                  )}
                </div>
                {isCredit && (() => {
                  const bucket = WALLET_BUCKET_MAP[selectedCategory.walletCategory] ?? 'withdrawable';
                  const meta = BUCKET_LABEL[bucket];
                  return (
                    <div className={`mt-2 rounded-md border p-2 text-[11px] ${meta.tone}`}>
                      <div className="font-semibold">
                        💼 Lands in: {meta.name} bucket
                      </div>
                      <div className="opacity-80 mt-0.5">{meta.note}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            <Button
              className={`w-full ${isCredit ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-destructive hover:bg-destructive/90'}`}
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !selectedUser || !amount || reason.length < 10 || !selectedCategoryId}
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              {isCredit ? 'Credit' : 'Debit'} UGX {amt.toLocaleString()} {isCredit ? 'to' : 'from'} {selectedUser?.full_name || '...'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function getNextRunDate(dayOfMonth: number): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (next <= now) {
    next.setMonth(next.getMonth() + 1);
  }
  return next.toISOString();
}

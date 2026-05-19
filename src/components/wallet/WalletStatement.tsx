import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  TrendingUp,
  TrendingDown,
  Users,
  CheckCircle2,
  Gift,
  ArrowDownToLine,
  Banknote,
  Calendar,
  Landmark,
  Coins,
  ArrowUpDown,
  Download,
  Loader2,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Eye
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, subDays } from 'date-fns';
// jsPDF loaded dynamically when needed
import { toast } from 'sonner';

// ── Role-based highlight config ──
// Each role sees the categories that matter most to them surfaced first,
// in a "For you" card. Falls back to a generic set for unknown roles.
const ROLE_HIGHLIGHTS: Record<string, { title: string; subtitle: string; categories: string[] }> = {
  tenant: {
    title: 'Your rent activity',
    subtitle: 'Deposits, daily rent and refunds that matter for tenants',
    categories: ['deposit', 'rent_repayment', 'rent_auto_deduction', 'transfer_in', 'wallet_withdrawal'],
  },
  agent: {
    title: 'Your earnings as an agent',
    subtitle: 'Commissions, bonuses and float movements',
    categories: ['agent_commission', 'subagent_commission', 'approval_bonus', 'referral_bonus', 'referral_first_transaction', 'wallet_withdrawal'],
  },
  proxy_agent: {
    title: 'Your earnings as an agent',
    subtitle: 'Commissions, bonuses and float movements',
    categories: ['agent_commission', 'subagent_commission', 'approval_bonus', 'referral_bonus', 'wallet_withdrawal'],
  },
  partner: {
    title: 'Partner activity',
    subtitle: 'Proxy commissions, top-ups and payouts',
    categories: ['partner_commission', 'agent_commission', 'pool_investment', 'wallet_withdrawal', 'deposit'],
  },
  supporter: {
    title: 'Your investor activity',
    subtitle: 'Returns, top-ups and payouts on your portfolio',
    categories: ['supporter_reward', 'pool_investment', 'deposit', 'wallet_withdrawal', 'transfer_in'],
  },
};

const DEFAULT_HIGHLIGHT = {
  title: 'Your wallet activity',
  subtitle: 'The main things moving in and out of your wallet',
  categories: ['deposit', 'wallet_withdrawal', 'transfer_in', 'transfer_out', 'welcome_bonus'],
};

interface LedgerEntry {
  id: string;
  date: string;
  type: 'credit' | 'debit';
  category: string;
  description: string;
  amount: number;
  reference_id?: string | null;
  linked_party?: string | null;
  balance_after?: number;
}

const CATEGORY_META: Record<string, { label: string; Icon: React.ElementType; colorClass: string; plainExplanation: string }> = {
  referral_bonus:        { label: 'Referral Bonus',          Icon: Users,          colorClass: 'text-primary bg-primary/10', plainExplanation: 'You earned this because someone you referred joined Welile.' },
  agent_commission:      { label: 'Commission Earned',        Icon: TrendingUp,     colorClass: 'text-success bg-success/10', plainExplanation: 'You earned 5% commission when a tenant you registered made a rent repayment.' },
  approval_bonus:        { label: 'Approval Bonus',           Icon: CheckCircle2,   colorClass: 'text-success bg-success/10', plainExplanation: 'You earned UGX 5,000 because a tenant you registered was approved for rent.' },
  subagent_commission:   { label: 'Sub-agent Commission',     Icon: TrendingUp,     colorClass: 'text-success bg-success/10', plainExplanation: 'You earned 1% because a sub-agent under you collected a rent repayment.' },
  referral_first_transaction: { label: 'First Transaction Bonus', Icon: Gift,      colorClass: 'text-warning bg-warning/10', plainExplanation: 'Bonus for your referred user completing their first transaction.' },
  welcome_bonus:         { label: 'Welcome Bonus',            Icon: Gift,           colorClass: 'text-warning bg-warning/10', plainExplanation: 'A one-time bonus for joining the Welile platform.' },
  deposit:               { label: 'Mobile Money Deposit',     Icon: Landmark,       colorClass: 'text-primary bg-primary/10', plainExplanation: 'Money deposited into your wallet via Mobile Money.' },
  wallet_withdrawal:     { label: 'Withdrawal',               Icon: ArrowDownToLine,colorClass: 'text-destructive bg-destructive/10', plainExplanation: 'Money you withdrew from your wallet to Mobile Money or bank.' },
  supporter_reward:      { label: 'Supporter Reward',         Icon: Coins,          colorClass: 'text-success bg-success/10', plainExplanation: 'Reward earned from your supporter investment portfolio.' },
  rent_repayment:        { label: 'Rent Repayment',           Icon: Banknote,       colorClass: 'text-primary bg-primary/10', plainExplanation: 'Daily rent deduction from your wallet to repay your rent advance.' },
  tenant_default_charge: { label: 'Tenant Default (Legacy)',   Icon: ArrowDownToLine,colorClass: 'text-destructive bg-destructive/10', plainExplanation: 'A historical charge from when agents were charged for tenant defaults. This policy has been discontinued.' },
  rent_auto_deduction:   { label: 'Auto Rent Deduction',      Icon: ArrowDownToLine,colorClass: 'text-destructive bg-destructive/10', plainExplanation: 'Your daily rent installment was automatically deducted from your wallet.' },
  transfer_out:          { label: 'Transfer Sent',            Icon: ArrowDownToLine,colorClass: 'text-destructive bg-destructive/10', plainExplanation: 'Money you sent to another Welile user.' },
  transfer_in:           { label: 'Transfer Received',        Icon: Landmark,       colorClass: 'text-primary bg-primary/10', plainExplanation: 'Money received from another Welile user.' },
  pool_investment:       { label: 'Pool Investment',          Icon: ArrowDownToLine,colorClass: 'text-primary bg-primary/10', plainExplanation: 'Money moved from your wallet to the rent management pool.' },
};

function getCategoryMeta(category: string, direction: string) {
  const meta = CATEGORY_META[category];
  if (meta) return meta;
  if (direction === 'cash_out') return { label: category.replace(/_/g, ' '), Icon: ArrowDownToLine, colorClass: 'text-destructive bg-destructive/10', plainExplanation: 'Money was deducted from your wallet.' };
  return { label: category.replace(/_/g, ' '), Icon: Banknote, colorClass: 'text-muted-foreground bg-muted', plainExplanation: 'Money was added to your wallet.' };
}

function formatAmount(amount: number): string {
  return `UGX ${amount.toLocaleString()}`;
}

export function WalletStatement() {
  const { user, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [totals, setTotals] = useState({ totalIn: 0, totalOut: 0 });
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [userName, setUserName] = useState('');
  // Filters
  const [directionFilter, setDirectionFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [rangePreset, setRangePreset] = useState<'all' | '7d' | '30d' | '90d'>('all');
  // Progressive disclosure for a calmer default view
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showCategoryFilters, setShowCategoryFilters] = useState(false);
  // Accessibility: larger text + higher contrast (persisted)
  const [a11yMode, setA11yMode] = useState<boolean>(() => {
    try { return localStorage.getItem('welile_statement_a11y') === '1'; } catch { return false; }
  });
  const [a11yHydrated, setA11yHydrated] = useState(false);

  // Load server-side preference once per user (overrides local cache)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('prefers_easy_read')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data && typeof data.prefers_easy_read === 'boolean') {
        setA11yMode(data.prefers_easy_read);
      }
      setA11yHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Persist: localStorage immediately for snappy UX, profiles row for cross-device.
  useEffect(() => {
    try { localStorage.setItem('welile_statement_a11y', a11yMode ? '1' : '0'); } catch {}
    if (!user || !a11yHydrated) return;
    supabase
      .from('profiles')
      .update({ prefers_easy_read: a11yMode })
      .eq('id', user.id)
      .then(({ error }) => {
        if (error) console.error('[WalletStatement] save easy-read pref', error);
      });
  }, [a11yMode, user, a11yHydrated]);

  useEffect(() => {
    if (open && user) {
      fetchStatement();
    }
  }, [open, user]);

  const fetchStatement = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const [{ data: ledger, error }, { data: profile }, { data: referralEarnings }] = await Promise.all([
        supabase
          .from('general_ledger')
          .select('id, transaction_date, amount, direction, category, description, reference_id, linked_party')
          .eq('user_id', user.id)
          // Hide admin/CFO reconciliation legs (admin_correction + system_balance_correction)
          // from end users — they are bookkeeping-only. Production-classified reversals must
          // remain visible so the statement matches the headline balance.
          .or('classification.neq.admin_correction,category.neq.system_balance_correction')
          .order('transaction_date', { ascending: true })
          .limit(200),
        supabase.from('profiles').select('full_name').eq('id', user.id).single(),
        supabase
          .from('agent_earnings')
          .select('id, created_at, amount, earning_type, description')
          .eq('agent_id', user.id)
          .eq('earning_type', 'referral_bonus'),
      ]);

      if (error) throw error;
      setUserName(profile?.full_name || user.email || '');

      const allEntries: LedgerEntry[] = (ledger || []).map(row => ({
        id: row.id,
        date: row.transaction_date,
        type: row.direction === 'cash_in' ? 'credit' : 'debit',
        category: row.category,
        description: row.description || getCategoryMeta(row.category, row.direction).label,
        amount: row.amount,
        reference_id: row.reference_id,
        linked_party: row.linked_party,
      }));

      for (const re of referralEarnings || []) {
        const alreadyIn = allEntries.some(e => e.category === 'referral_bonus' &&
          Math.abs(new Date(e.date).getTime() - new Date(re.created_at).getTime()) < 5000 &&
          e.amount === re.amount);
        if (!alreadyIn) {
          allEntries.push({
            id: `ae-${re.id}`,
            date: re.created_at,
            type: 'credit',
            category: 'referral_bonus',
            description: re.description || 'Referral Bonus',
            amount: re.amount,
          });
        }
      }

      allEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let runningBalance = 0;
      for (const entry of allEntries) {
        if (entry.type === 'credit') runningBalance += entry.amount;
        else runningBalance -= entry.amount;
        entry.balance_after = Math.max(0, runningBalance);
      }

      const displayEntries = [...allEntries].reverse();
      const totalIn = allEntries.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
      const totalOut = allEntries.filter(e => e.type === 'debit').reduce((s, e) => s + e.amount, 0);

      const bk: Record<string, number> = {};
      for (const e of allEntries.filter(e => e.type === 'credit')) {
        bk[e.category] = (bk[e.category] || 0) + e.amount;
      }

      setEntries(displayEntries);
      setTotals({ totalIn, totalOut });
      setBreakdown(bk);
    } catch (error) {
      console.error('[WalletStatement] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Derived: date range + filtered entries (shared by UI + exports) ──
  const rangeFrom = (() => {
    if (rangePreset === 'all') return null;
    const days = rangePreset === '7d' ? 7 : rangePreset === '30d' ? 30 : 90;
    return subDays(new Date(), days);
  })();

  const filteredEntries = entries.filter(entry => {
    if (directionFilter !== 'all' && entry.type !== directionFilter) return false;
    if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false;
    if (rangeFrom && new Date(entry.date) < rangeFrom) return false;
    return true;
  });

  const filteredTotals = filteredEntries.reduce(
    (acc, e) => {
      if (e.type === 'credit') acc.totalIn += e.amount;
      else acc.totalOut += e.amount;
      return acc;
    },
    { totalIn: 0, totalOut: 0 }
  );

  const rangeLabel =
    rangePreset === 'all' ? 'All time' :
    rangePreset === '7d' ? 'Last 7 days' :
    rangePreset === '30d' ? 'Last 30 days' : 'Last 90 days';

  const filterSummary = [
    rangeLabel,
    directionFilter !== 'all' ? (directionFilter === 'credit' ? 'Money In only' : 'Money Out only') : null,
    categoryFilter !== 'all' ? `Type: ${categoryFilter.replace(/_/g, ' ')}` : null,
  ].filter(Boolean).join(' · ');

  const exportToCSV = useCallback(() => {
    if (filteredEntries.length === 0) {
      toast.error('No transactions to export');
      return;
    }
    const escape = (val: string | number | null | undefined) => {
      const s = val == null ? '' : String(val);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Date', 'Time', 'Description', 'Category', 'Type', 'Amount (UGX)', 'Balance After (UGX)', 'Reference', 'Linked Party'];
    const rows = filteredEntries.map(e => [
      format(new Date(e.date), 'yyyy-MM-dd'),
      format(new Date(e.date), 'HH:mm:ss'),
      e.description,
      e.category,
      e.type === 'credit' ? 'IN' : 'OUT',
      (e.type === 'credit' ? '+' : '-') + e.amount,
      e.balance_after ?? '',
      e.reference_id ?? '',
      e.linked_party ?? '',
    ]);
    const meta = [
      ['Welile Wallet Statement'],
      ['Account', userName],
      ['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')],
      ['Filters', filterSummary],
      ['Total In', `+${filteredTotals.totalIn}`],
      ['Total Out', `-${filteredTotals.totalOut}`],
      ['Net', `${filteredTotals.totalIn - filteredTotals.totalOut}`],
      [],
    ];
    const csv = [...meta, header, ...rows].map(r => r.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Welile_Wallet_Statement_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  }, [filteredEntries, filteredTotals.totalIn, filteredTotals.totalOut, userName, filterSummary]);

  const exportToPDF = useCallback(async () => {
    if (filteredEntries.length === 0) {
      toast.error('No transactions to export');
      return;
    }

    setExporting(true);

    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const addNewPageIfNeeded = (needed: number) => {
        if (y + needed > pageHeight - 20) {
          doc.addPage();
          y = margin;
          return true;
        }
        return false;
      };

      // ── Header ──
      doc.setFillColor(88, 28, 135); // purple
      doc.rect(0, 0, pageWidth, 44, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Welile Wallet Statement', margin, 16);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(userName, margin, 24);
      doc.text(`Generated: ${format(new Date(), 'PPP p')}`, margin, 30);
      doc.setFontSize(8);
      doc.text(`Filters: ${filterSummary}`, margin, 37);
      y = 52;

      // ── Summary ──
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary', margin, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      // Total In
      doc.setFillColor(220, 252, 231);
      doc.roundedRect(margin, y, contentWidth / 2 - 3, 16, 2, 2, 'F');
      doc.setTextColor(22, 163, 74);
      doc.text('Total In', margin + 4, y + 6);
      doc.setFont('helvetica', 'bold');
      doc.text(`+${formatAmount(filteredTotals.totalIn)}`, margin + 4, y + 12);

      // Total Out
      doc.setFillColor(254, 226, 226);
      doc.roundedRect(margin + contentWidth / 2 + 3, y, contentWidth / 2 - 3, 16, 2, 2, 'F');
      doc.setTextColor(220, 38, 38);
      doc.text('Total Out', margin + contentWidth / 2 + 7, y + 6);
      doc.setFont('helvetica', 'bold');
      doc.text(`-${formatAmount(filteredTotals.totalOut)}`, margin + contentWidth / 2 + 7, y + 12);

      y += 22;

      // Net Balance
      const netBalance = Math.max(0, filteredTotals.totalIn - filteredTotals.totalOut);
      doc.setFillColor(240, 240, 240);
      doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Net Balance:', margin + 4, y + 8);
      doc.setTextColor(netBalance >= 0 ? 22 : 220, netBalance >= 0 ? 163 : 38, netBalance >= 0 ? 74 : 38);
      doc.text(formatAmount(netBalance), pageWidth - margin - 4, y + 8, { align: 'right' });
      y += 18;

      // ── Transaction Table ──
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Transaction History', margin, y);
      y += 6;

      // Table header
      const colWidths = [28, 62, 22, 32, 32];
      const headers = ['Date', 'Description', 'Type', 'Amount', 'Balance'];

      doc.setFillColor(88, 28, 135);
      doc.rect(margin, y, contentWidth, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');

      let xPos = margin + 2;
      headers.forEach((h, i) => {
        doc.text(h, xPos, y + 5.5);
        xPos += colWidths[i];
      });
      y += 8;

      // Table rows
      doc.setFontSize(7.5);
      const sortedEntries = [...filteredEntries]; // already newest-first

      for (let i = 0; i < sortedEntries.length; i++) {
        const entry = sortedEntries[i];
        const rowHeight = entry.linked_party && entry.linked_party !== 'platform' ? 10 : 7;
        addNewPageIfNeeded(rowHeight);

        // Alternating row color
        if (i % 2 === 0) {
          doc.setFillColor(248, 248, 248);
          doc.rect(margin, y, contentWidth, rowHeight, 'F');
        }

        doc.setTextColor(80, 80, 80);
        doc.setFont('helvetica', 'normal');

        xPos = margin + 2;

        // Date
        doc.text(format(new Date(entry.date), 'dd/MM/yy'), xPos, y + 4.5);
        xPos += colWidths[0];

        // Description (truncated) + linked party
        const desc = entry.description.length > 38
          ? entry.description.substring(0, 35) + '...'
          : entry.description;
        doc.text(desc, xPos, y + 4.5);
        if (entry.linked_party && entry.linked_party !== 'platform') {
          doc.setFontSize(6);
          doc.setTextColor(160, 120, 0);
          doc.text(`→ ${entry.linked_party}`, xPos, y + 8);
          doc.setFontSize(7.5);
        }
        xPos += colWidths[1];

        // Type
        const isCredit = entry.type === 'credit';
        doc.setTextColor(isCredit ? 22 : 220, isCredit ? 163 : 38, isCredit ? 74 : 38);
        doc.setFont('helvetica', 'bold');
        doc.text(isCredit ? 'IN' : 'OUT', xPos, y + 4.5);
        xPos += colWidths[2];

        // Amount
        doc.text(`${isCredit ? '+' : '-'}${formatAmount(entry.amount)}`, xPos, y + 4.5);
        xPos += colWidths[3];

        // Balance
        doc.setTextColor(80, 80, 80);
        doc.setFont('helvetica', 'normal');
        doc.text(formatAmount(entry.balance_after || 0), xPos, y + 4.5);

        y += rowHeight;
      }

      // ── Footer ──
      y += 6;
      addNewPageIfNeeded(20);
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.setFont('helvetica', 'normal');
      doc.text('This is an auto-generated statement from Welile Technologies Limited.', margin, y);
      doc.text(`Total entries: ${filteredEntries.length}  ·  ${format(new Date(), 'PPPp')}`, margin, y + 4);

      // Save
      const filename = `Welile_Wallet_Statement_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      doc.save(filename);
      toast.success('PDF downloaded successfully');
    } catch (err) {
      console.error('[WalletStatement] PDF export error:', err);
      toast.error('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  }, [filteredEntries, filteredTotals.totalIn, filteredTotals.totalOut, userName, filterSummary]);

  // Get unique categories for filter chips
  const uniqueCategories = [...new Set(entries.map(e => e.category))];

  const hasActiveFilters = directionFilter !== 'all' || categoryFilter !== 'all' || rangePreset !== 'all';

  // Group by date
  const groupedEntries = filteredEntries.reduce((groups, entry) => {
    const key = format(new Date(entry.date), 'yyyy-MM-dd');
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
    return groups;
  }, {} as Record<string, LedgerEntry[]>);

  const breakdownItems = Object.entries(breakdown).filter(([, v]) => v > 0);

  // ── Role-based highlights (computed from filtered entries) ──
  const highlightConfig = (role && ROLE_HIGHLIGHTS[role]) || DEFAULT_HIGHLIGHT;
  const highlightTotals = highlightConfig.categories
    .map((cat) => {
      const rows = filteredEntries.filter((e) => e.category === cat);
      if (rows.length === 0) return null;
      const inSum = rows.filter((e) => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
      const outSum = rows.filter((e) => e.type === 'debit').reduce((s, e) => s + e.amount, 0);
      const net = inSum - outSum;
      const meta = getCategoryMeta(cat, net >= 0 ? 'cash_in' : 'cash_out');
      return { cat, count: rows.length, inSum, outSum, net, ...meta };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-xs font-semibold text-[#9A4DE7] border-primary-foreground/30 hover:bg-primary-foreground/10 hover:text-white">
          <FileText className="h-3.5 w-3.5" />
          Statement
        </Button>
      </SheetTrigger>

      <SheetContent side="bottom" className={`h-[92vh] rounded-t-3xl p-0 flex flex-col ${a11yMode ? 'a11y-large' : ''}`}>
        {/* Scoped accessibility overrides: larger text + stronger contrast */}
        <style>{`
          .a11y-large { font-size: 17px; }
          .a11y-large .text-\\[10px\\] { font-size: 13px !important; line-height: 1.3 !important; }
          .a11y-large .text-\\[11px\\] { font-size: 14px !important; line-height: 1.4 !important; }
          .a11y-large .text-xs { font-size: 15px !important; line-height: 1.45 !important; }
          .a11y-large .text-sm { font-size: 16px !important; line-height: 1.5 !important; }
          .a11y-large .text-muted-foreground { color: hsl(var(--foreground) / 0.92) !important; }
          .a11y-large .text-muted-foreground\\/80,
          .a11y-large .text-muted-foreground\\/70 { color: hsl(var(--foreground) / 0.85) !important; }
          .a11y-large .border { border-color: hsl(var(--foreground) / 0.35) !important; }
          .a11y-large button, .a11y-large [role="button"] { min-height: 44px; }
        `}</style>
        <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-xl font-bold flex items-center gap-2">
                <ArrowUpDown className="h-5 w-5 text-primary" aria-hidden="true" />
                Wallet Statement
              </SheetTitle>
              <p className="text-xs text-muted-foreground">All money in & out of your wallet</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={a11yMode ? 'default' : 'outline'}
                onClick={() => setA11yMode(v => !v)}
                aria-pressed={a11yMode}
                aria-label={a11yMode ? 'Turn off larger text and higher contrast' : 'Turn on larger text and higher contrast'}
                className="gap-1.5 text-xs font-semibold"
                title={a11yMode ? 'Easy-read mode: ON' : 'Easy-read mode: OFF'}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                {a11yMode ? 'A−' : 'A+'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={exportToCSV}
                disabled={loading || filteredEntries.length === 0}
                className="gap-1.5 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10"
                title={`Download CSV · ${filterSummary}`}
                aria-label={`Download wallet statement as CSV. Filters applied: ${filterSummary}`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={exportToPDF}
                disabled={exporting || loading || filteredEntries.length === 0}
                className="gap-1.5 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10"
                title={`Download PDF · ${filterSummary}`}
                aria-label={exporting ? 'Generating PDF, please wait' : `Download wallet statement as PDF. Filters applied: ${filterSummary}`}
                aria-busy={exporting}
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
                PDF
              </Button>
            </div>
          </div>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4 p-5">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : (
          <ScrollArea className="flex-1 px-4 py-4">

            {/* ── Hero: Net Balance ── */}
            <div className="mb-4 rounded-2xl border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Net Balance</p>
              <p className={`mt-1 text-3xl font-extrabold tracking-tight tabular-nums ${
                totals.totalIn - totals.totalOut >= 0 ? 'text-foreground' : 'text-destructive'
              }`}>
                {formatUGX(Math.max(0, totals.totalIn - totals.totalOut))}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-success/10 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-success">
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide">Money In</span>
                  </div>
                  <p className="mt-0.5 text-sm font-bold text-success tabular-nums">+{formatUGX(totals.totalIn)}</p>
                </div>
                <div className="rounded-xl bg-destructive/10 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-destructive">
                    <TrendingDown className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide">Money Out</span>
                  </div>
                  <p className="mt-0.5 text-sm font-bold text-destructive tabular-nums">-{formatUGX(totals.totalOut)}</p>
                </div>
              </div>
            </div>

            {/* ── Role-based highlights ── */}
            {highlightTotals.length > 0 && (
              <div className="mb-4 rounded-2xl border bg-card p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                      {highlightConfig.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{highlightConfig.subtitle}</p>
                  </div>
                  {role && (
                    <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">
                      {role.replace(/_/g, ' ')}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {highlightTotals.map((h) => {
                    const isPositive = h.net >= 0;
                    return (
                      <button
                        key={h.cat}
                        type="button"
                        onClick={() => {
                          setCategoryFilter(h.cat === categoryFilter ? 'all' : h.cat);
                          setShowCategoryFilters(true);
                        }}
                        className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-muted/40 ${
                          categoryFilter === h.cat ? 'border-primary bg-primary/5' : 'border-border'
                        }`}
                      >
                        <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${h.colorClass}`}>
                          <h.Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">{h.label}</p>
                          <p className="text-[10px] text-muted-foreground">{h.count} {h.count === 1 ? 'entry' : 'entries'}</p>
                        </div>
                        <p className={`shrink-0 text-sm font-bold tabular-nums ${isPositive ? 'text-success' : 'text-destructive'}`}>
                          {isPositive ? '+' : '-'}{formatUGX(Math.abs(h.net))}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Income Breakdown (collapsed by default) ── */}
            {breakdownItems.length > 0 && (
              <div className="mb-4 overflow-hidden rounded-xl border">
                <button
                  type="button"
                  onClick={() => setShowBreakdown(v => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/40"
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Income Breakdown</span>
                  {showBreakdown
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {showBreakdown && (
                  <div className="divide-y divide-border/50 border-t">
                    {breakdownItems.map(([category, amount]) => {
                      const { label, Icon, colorClass } = getCategoryMeta(category, 'cash_in');
                      return (
                        <div key={category} className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`h-7 w-7 rounded-full flex items-center justify-center ${colorClass}`}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <span className="text-sm text-muted-foreground">{label}</span>
                          </div>
                          <span className="font-mono text-sm font-semibold text-success tabular-nums">+{formatUGX(amount)}</span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between bg-success/5 px-4 py-2.5 font-bold">
                      <span className="text-sm">Total Earned</span>
                      <span className="font-mono text-sm text-success tabular-nums">+{formatUGX(totals.totalIn)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Filters (calm default, advanced behind toggle) ── */}
            <div className="mb-5 space-y-2.5">
              {/* Date range presets */}
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                {[
                  { value: 'all' as const, label: 'All time' },
                  { value: '7d' as const, label: '7d' },
                  { value: '30d' as const, label: '30d' },
                  { value: '90d' as const, label: '90d' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setRangePreset(opt.value)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-all ${
                      rangePreset === opt.value
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Direction segmented control */}
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                {[
                  { value: 'all' as const, label: 'All', count: entries.length },
                  { value: 'credit' as const, label: 'In', count: entries.filter(e => e.type === 'credit').length },
                  { value: 'debit' as const, label: 'Out', count: entries.filter(e => e.type === 'debit').length },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDirectionFilter(opt.value)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-all ${
                      directionFilter === opt.value
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {opt.label} <span className="text-muted-foreground/70">· {opt.count}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowCategoryFilters(v => !v)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Filter className="h-3 w-3" />
                  {showCategoryFilters ? 'Hide types' : 'Filter by type'}
                  {showCategoryFilters
                    ? <ChevronUp className="h-3 w-3" />
                    : <ChevronDown className="h-3 w-3" />}
                </button>
                {hasActiveFilters && (
                  <button
                    onClick={() => { setDirectionFilter('all'); setCategoryFilter('all'); setRangePreset('all'); }}
                    className="flex items-center gap-1 text-[11px] font-medium text-destructive"
                  >
                    <X className="h-3 w-3" /> Clear filters
                  </button>
                )}
              </div>

              {showCategoryFilters && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    onClick={() => setCategoryFilter('all')}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all ${
                      categoryFilter === 'all'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    All types
                  </button>
                  {uniqueCategories.map(cat => {
                    const { label } = getCategoryMeta(cat, 'cash_in');
                    const count = entries.filter(e => e.category === cat).length;
                    return (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat === categoryFilter ? 'all' : cat)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all ${
                          categoryFilter === cat
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {label} · {count}
                      </button>
                    );
                  })}
                </div>
              )}

              {hasActiveFilters && (
                <p className="text-[10px] text-muted-foreground">
                  Showing {filteredEntries.length} of {entries.length} transactions
                </p>
              )}
            </div>

            {/* ── Transaction Timeline ── */}
            {Object.keys(groupedEntries).length > 0 ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Transaction History</p>
                  <span className="text-[10px] text-muted-foreground">{filteredEntries.length} entries</span>
                </div>
                {Object.entries(groupedEntries).map(([dateKey, dayEntries]) => (
                  <div key={dateKey}>
                    {/* Sticky day header */}
                    <div className="sticky top-0 z-10 -mx-4 mb-2 flex items-center justify-between bg-background/95 px-4 py-2 backdrop-blur">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground">
                          {format(new Date(dateKey), 'EEE, MMM d, yyyy')}
                        </span>
                      </div>
                      <div className="flex gap-2 text-[10px] font-medium tabular-nums">
                        {dayEntries.some(e => e.type === 'credit') && (
                          <span className="text-success">+{formatUGX(dayEntries.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0))}</span>
                        )}
                        {dayEntries.some(e => e.type === 'debit') && (
                          <span className="text-destructive">-{formatUGX(dayEntries.filter(e => e.type === 'debit').reduce((s, e) => s + e.amount, 0))}</span>
                        )}
                      </div>
                    </div>

                    {/* Entries — clean rows */}
                    <div className="overflow-hidden rounded-xl border bg-card divide-y divide-border/60">
                      {dayEntries.map((entry) => {
                        const meta = getCategoryMeta(entry.category, entry.type === 'credit' ? 'cash_in' : 'cash_out');
                        const { label, Icon, colorClass, plainExplanation } = meta;
                        const isCredit = entry.type === 'credit';
                        const showDescription = entry.description && entry.description !== label;
                        const partyNote =
                          entry.linked_party && entry.category === 'tenant_default_charge' ? `Tenant: ${entry.linked_party}` :
                          entry.linked_party && entry.linked_party !== 'platform' && entry.category === 'agent_commission' ? `From: ${entry.linked_party}` :
                          entry.linked_party && entry.linked_party !== 'platform' ? `→ ${entry.linked_party}` :
                          null;

                        return (
                          <details key={entry.id} className="group">
                            <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 hover:bg-muted/30">
                              <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-foreground">{label}</p>
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                  {format(new Date(entry.date), 'h:mm a')}
                                  {partyNote ? ` · ${partyNote}` : ''}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className={`text-sm font-bold tabular-nums ${isCredit ? 'text-success' : 'text-destructive'}`}>
                                  {isCredit ? '+' : '-'}{formatUGX(entry.amount)}
                                </p>
                                <p className="text-[10px] text-muted-foreground tabular-nums">
                                  Bal {formatUGX(entry.balance_after || 0)}
                                </p>
                              </div>
                            </summary>
                            <div className="border-t bg-muted/20 px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
                              <p>{plainExplanation}</p>
                              {showDescription && (
                                <p className="mt-1.5 italic text-foreground/70">"{entry.description}"</p>
                              )}
                              {entry.reference_id && (
                                <p className="mt-1.5 font-mono text-[10px] text-muted-foreground/80">
                                  Ref: {entry.reference_id}
                                </p>
                              )}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="font-semibold text-muted-foreground">No transactions yet</p>
                <p className="text-sm text-muted-foreground/70">Your wallet activity will appear here</p>
              </div>
            )}
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}

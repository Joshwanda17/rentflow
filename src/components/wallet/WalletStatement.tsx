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
  X
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
// jsPDF loaded dynamically when needed
import { toast } from 'sonner';

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
  tenant_default_charge: { label: 'Tenant Default Charge',    Icon: ArrowDownToLine,colorClass: 'text-destructive bg-destructive/10', plainExplanation: 'A charge applied because a tenant defaulted on rent repayment.' },
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
  const { user } = useAuth();
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

  const exportToPDF = useCallback(async () => {
    if (entries.length === 0) {
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
      doc.rect(0, 0, pageWidth, 38, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Welile Wallet Statement', margin, 16);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(userName, margin, 24);
      doc.text(`Generated: ${format(new Date(), 'PPP p')}`, margin, 30);
      y = 46;

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
      doc.text(`+${formatAmount(totals.totalIn)}`, margin + 4, y + 12);

      // Total Out
      doc.setFillColor(254, 226, 226);
      doc.roundedRect(margin + contentWidth / 2 + 3, y, contentWidth / 2 - 3, 16, 2, 2, 'F');
      doc.setTextColor(220, 38, 38);
      doc.text('Total Out', margin + contentWidth / 2 + 7, y + 6);
      doc.setFont('helvetica', 'bold');
      doc.text(`-${formatAmount(totals.totalOut)}`, margin + contentWidth / 2 + 7, y + 12);

      y += 22;

      // Net Balance
      const netBalance = Math.max(0, totals.totalIn - totals.totalOut);
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
      const sortedEntries = [...entries]; // already newest-first

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
      doc.text(`Total entries: ${entries.length}  ·  ${format(new Date(), 'PPPp')}`, margin, y + 4);

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
  }, [entries, totals, userName]);

  // Apply filters
  const filteredEntries = entries.filter(entry => {
    if (directionFilter !== 'all' && entry.type !== directionFilter) return false;
    if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false;
    return true;
  });

  // Get unique categories for filter chips
  const uniqueCategories = [...new Set(entries.map(e => e.category))];

  const hasActiveFilters = directionFilter !== 'all' || categoryFilter !== 'all';

  // Group by date
  const groupedEntries = filteredEntries.reduce((groups, entry) => {
    const key = format(new Date(entry.date), 'yyyy-MM-dd');
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
    return groups;
  }, {} as Record<string, LedgerEntry[]>);

  const breakdownItems = Object.entries(breakdown).filter(([, v]) => v > 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-xs font-semibold text-[#9A4DE7] border-primary-foreground/30 hover:bg-primary-foreground/10 hover:text-white">
          <FileText className="h-3.5 w-3.5" />
          Statement
        </Button>
      </SheetTrigger>

      <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-xl font-bold flex items-center gap-2">
                <ArrowUpDown className="h-5 w-5 text-primary" />
                Wallet Statement
              </SheetTitle>
              <p className="text-xs text-muted-foreground">All money in & out of your wallet</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={exportToPDF}
              disabled={exporting || loading || entries.length === 0}
              className="gap-1.5 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export PDF
            </Button>
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

            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="p-4 rounded-2xl bg-success/10 border border-success/20">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="h-3.5 w-3.5 text-success" />
                  <span className="text-[11px] font-semibold text-success uppercase tracking-wide">Total In</span>
                </div>
                <p className="text-lg font-bold text-success">+{formatUGX(totals.totalIn)}</p>
              </div>
              <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-[11px] font-semibold text-destructive uppercase tracking-wide">Total Out</span>
                </div>
                <p className="text-lg font-bold text-destructive">-{formatUGX(totals.totalOut)}</p>
              </div>
            </div>

            {/* Net balance */}
            <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-card border mb-5">
              <span className="text-sm font-semibold text-muted-foreground">Net Balance</span>
              <span className={`text-base font-extrabold font-mono ${totals.totalIn - totals.totalOut >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatUGX(Math.max(0, totals.totalIn - totals.totalOut))}
              </span>
            </div>

            {/* ── Income Breakdown (income statement style) ── */}
            {breakdownItems.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden mb-6">
                <div className="px-4 py-2.5 bg-muted/50 border-b">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Income Breakdown</p>
                </div>
                <div className="divide-y divide-border/50">
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
                        <span className="font-mono text-sm font-semibold text-success">+{formatUGX(amount)}</span>
                      </div>
                    );
                  })}
                  {/* Subtotal */}
                  <div className="flex justify-between px-4 py-2.5 bg-success/5 font-bold">
                    <span className="text-sm">Total Earned</span>
                    <span className="font-mono text-sm text-success">+{formatUGX(totals.totalIn)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Filter Bar ── */}
            <div className="mb-5 space-y-3">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Filter Transactions</p>
                {hasActiveFilters && (
                  <button
                    onClick={() => { setDirectionFilter('all'); setCategoryFilter('all'); }}
                    className="ml-auto flex items-center gap-1 text-[10px] text-destructive font-medium"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>

              {/* Direction filter */}
              <div className="flex gap-1.5 p-1 bg-muted rounded-lg">
                {[
                  { value: 'all' as const, label: 'All', count: entries.length },
                  { value: 'credit' as const, label: '💰 Money In', count: entries.filter(e => e.type === 'credit').length },
                  { value: 'debit' as const, label: '📤 Money Out', count: entries.filter(e => e.type === 'debit').length },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDirectionFilter(opt.value)}
                    className={`flex-1 py-2 px-2 rounded-md text-[11px] font-semibold transition-all ${
                      directionFilter === opt.value
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {opt.label} ({opt.count})
                  </button>
                ))}
              </div>

              {/* Category filter chips */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all ${
                    categoryFilter === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  All Types
                </button>
                {uniqueCategories.map(cat => {
                  const { label } = getCategoryMeta(cat, 'cash_in');
                  const count = entries.filter(e => e.category === cat).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat === categoryFilter ? 'all' : cat)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all ${
                        categoryFilter === cat
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {label} ({count})
                    </button>
                  );
                })}
              </div>

              {hasActiveFilters && (
                <p className="text-[10px] text-muted-foreground">
                  Showing {filteredEntries.length} of {entries.length} transactions
                </p>
              )}
            </div>

            {/* ── Transaction Timeline ── */}
            {Object.keys(groupedEntries).length > 0 ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Transaction History</p>
                  <span className="text-[10px] text-muted-foreground">{filteredEntries.length} entries</span>
                </div>
                {Object.entries(groupedEntries).map(([dateKey, dayEntries]) => (
                  <div key={dateKey}>
                    {/* Date header */}
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-bold text-muted-foreground">
                        {format(new Date(dateKey), 'EEEE, MMM d, yyyy')}
                      </span>
                    </div>

                    {/* Day summary */}
                    <div className="flex gap-2 mb-2">
                      {dayEntries.some(e => e.type === 'credit') && (
                        <span className="text-[10px] text-success font-medium">
                          +{formatUGX(dayEntries.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0))}
                        </span>
                      )}
                      {dayEntries.some(e => e.type === 'debit') && (
                        <span className="text-[10px] text-destructive font-medium">
                          -{formatUGX(dayEntries.filter(e => e.type === 'debit').reduce((s, e) => s + e.amount, 0))}
                        </span>
                      )}
                    </div>

                    {/* Entries */}
                    <div className="space-y-2 pl-2 border-l-2 border-muted ml-2">
                      {dayEntries.map((entry) => {
                        const meta = getCategoryMeta(entry.category, entry.type === 'credit' ? 'cash_in' : 'cash_out');
                        const { label, Icon, colorClass, plainExplanation } = meta;
                        const isCredit = entry.type === 'credit';

                        return (
                          <div key={entry.id} className="relative pl-4">
                            {/* Timeline dot */}
                            <div className={`absolute -left-[9px] top-4 h-4 w-4 rounded-full border-2 border-background ${
                              isCredit ? 'bg-success' : 'bg-destructive'
                            }`} />

                            <div className="p-3 rounded-xl bg-card border shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-semibold text-sm">{label}</p>
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] px-1.5 py-0 shrink-0 ${
                                          isCredit
                                            ? 'border-success/30 text-success'
                                            : 'border-destructive/30 text-destructive'
                                        }`}
                                      >
                                        {isCredit ? 'MONEY IN' : 'MONEY OUT'}
                                      </Badge>
                                    </div>

                                    {/* Plain-English explanation */}
                                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                      {plainExplanation}
                                    </p>

                                    {/* Show description if different from label */}
                                    {entry.description && entry.description !== label && (
                                      <p className="text-[10px] font-medium text-foreground/70 mt-0.5 italic">
                                        "{entry.description}"
                                      </p>
                                    )}

                                    {entry.linked_party && entry.category === 'tenant_default_charge' && (
                                      <p className="text-[10px] font-semibold text-warning mt-0.5">
                                        🏠 Tenant: {entry.linked_party}
                                      </p>
                                    )}
                                    {entry.linked_party && entry.linked_party !== 'platform' && entry.category === 'agent_commission' && (
                                      <p className="text-[10px] font-semibold text-success mt-0.5">
                                        👤 Tenant who paid: {entry.linked_party}
                                      </p>
                                    )}
                                    {entry.linked_party && entry.linked_party !== 'platform' && !['tenant_default_charge', 'agent_commission'].includes(entry.category) && (
                                      <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                                        → {entry.linked_party}
                                      </p>
                                    )}
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {format(new Date(entry.date), 'h:mm a')}
                                      {entry.reference_id ? ` · Ref: ${entry.reference_id.slice(0, 10)}` : ''}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className={`font-bold text-sm ${isCredit ? 'text-success' : 'text-destructive'}`}>
                                    {isCredit ? '+' : '-'}{formatUGX(entry.amount)}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    Bal: {formatUGX(entry.balance_after || 0)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
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

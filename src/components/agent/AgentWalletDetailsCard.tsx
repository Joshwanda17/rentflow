import { useState, useCallback } from 'react';
import { useAgentBalances } from '@/hooks/useAgentBalances';
import { useWalletMovementCounts } from '@/hooks/useWalletMovementCounts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2, Wallet, ArrowDownLeft, ArrowUpRight, Activity, Clock, FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface AgentWalletDetailsCardProps {
  agentId?: string;
  onOpenWallet?: () => void;
}

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

function formatAmount(amount: number): string {
  return `UGX ${amount.toLocaleString()}`;
}

export function AgentWalletDetailsCard({ agentId, onOpenWallet }: AgentWalletDetailsCardProps) {
  const {
    withdrawableBalance,
    floatBalance,
    advanceBalance,
    pendingHolds,
    isLoading: balancesLoading,
  } = useAgentBalances(agentId);

  const { counts, isLoading: countsLoading } = useWalletMovementCounts(agentId);
  const [exporting, setExporting] = useState<'pdf' | null>(null);

  const isLoading = balancesLoading || countsLoading;
  const visibleFloatBalance = floatBalance;

  const fetchLast25Entries = useCallback(async (): Promise<{ entries: LedgerEntry[]; userName: string } | null> => {
    if (!agentId) return null;
    try {
      const [{ data: ledger, error }, { data: profile }] = await Promise.all([
        supabase
          .from('general_ledger')
          .select('id, transaction_date, amount, direction, category, description, reference_id, linked_party')
          .eq('user_id', agentId)
          .eq('ledger_scope', 'wallet')
          .neq('classification', 'admin_correction')
          .neq('category', 'system_balance_correction')
          .order('transaction_date', { ascending: false })
          .limit(25),
        supabase.from('profiles').select('full_name').eq('id', agentId).single(),
      ]);

      if (error) throw error;

      const entries: LedgerEntry[] = (ledger || []).map(row => ({
        id: row.id,
        date: row.transaction_date,
        type: row.direction === 'cash_in' ? 'credit' : 'debit',
        category: row.category,
        description: row.description || row.category.replace(/_/g, ' '),
        amount: row.amount,
        reference_id: row.reference_id,
        linked_party: row.linked_party,
      }));

      // Compute running balance (oldest first)
      const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let runningBalance = 0;
      for (const entry of sorted) {
        if (entry.type === 'credit') runningBalance += entry.amount;
        else runningBalance -= entry.amount;
        entry.balance_after = Math.max(0, runningBalance);
      }

      // Return newest-first for display/export
      return { entries: sorted.reverse(), userName: profile?.full_name || '' };
    } catch (err) {
      console.error('[AgentWalletDetailsCard] fetch error:', err);
      toast.error('Failed to load entries for export');
      return null;
    }
  }, [agentId]);

  const exportToPDF = useCallback(async () => {
    if (!agentId) return;
    setExporting('pdf');
    const result = await fetchLast25Entries();
    if (!result || result.entries.length === 0) {
      toast.error('No transactions to export');
      setExporting(null);
      return;
    }
    const { entries, userName } = result;

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
      doc.setFillColor(88, 28, 135);
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
      doc.text('Scope: Last 25 entries', margin, 37);
      y = 52;

      // ── Summary ──
      const totalIn = entries.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
      const totalOut = entries.filter(e => e.type === 'debit').reduce((s, e) => s + e.amount, 0);
      const netBalance = Math.max(0, totalIn - totalOut);

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary', margin, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      doc.setFillColor(220, 252, 231);
      doc.roundedRect(margin, y, contentWidth / 2 - 3, 16, 2, 2, 'F');
      doc.setTextColor(22, 163, 74);
      doc.text('Total In', margin + 4, y + 6);
      doc.setFont('helvetica', 'bold');
      doc.text(`+${formatAmount(totalIn)}`, margin + 4, y + 12);

      doc.setFillColor(254, 226, 226);
      doc.roundedRect(margin + contentWidth / 2 + 3, y, contentWidth / 2 - 3, 16, 2, 2, 'F');
      doc.setTextColor(220, 38, 38);
      doc.text('Total Out', margin + contentWidth / 2 + 7, y + 6);
      doc.setFont('helvetica', 'bold');
      doc.text(`-${formatAmount(totalOut)}`, margin + contentWidth / 2 + 7, y + 12);

      y += 22;

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

      doc.setFontSize(7.5);
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const rowHeight = entry.linked_party && entry.linked_party !== 'platform' ? 10 : 7;
        addNewPageIfNeeded(rowHeight);

        if (i % 2 === 0) {
          doc.setFillColor(248, 248, 248);
          doc.rect(margin, y, contentWidth, rowHeight, 'F');
        }

        doc.setTextColor(80, 80, 80);
        doc.setFont('helvetica', 'normal');

        xPos = margin + 2;
        doc.text(format(new Date(entry.date), 'dd/MM/yy'), xPos, y + 4.5);
        xPos += colWidths[0];

        const desc = entry.description.length > 38 ? entry.description.substring(0, 35) + '...' : entry.description;
        doc.text(desc, xPos, y + 4.5);
        if (entry.linked_party && entry.linked_party !== 'platform') {
          doc.setFontSize(6);
          doc.setTextColor(160, 120, 0);
          doc.text(`→ ${entry.linked_party}`, xPos, y + 8);
          doc.setFontSize(7.5);
        }
        xPos += colWidths[1];

        const isCredit = entry.type === 'credit';
        doc.setTextColor(isCredit ? 22 : 220, isCredit ? 163 : 38, isCredit ? 74 : 38);
        doc.setFont('helvetica', 'bold');
        doc.text(isCredit ? 'IN' : 'OUT', xPos, y + 4.5);
        xPos += colWidths[2];

        doc.text(`${isCredit ? '+' : '-'}${formatAmount(entry.amount)}`, xPos, y + 4.5);
        xPos += colWidths[3];

        doc.setTextColor(80, 80, 80);
        doc.setFont('helvetica', 'normal');
        doc.text(formatAmount(entry.balance_after || 0), xPos, y + 4.5);

        y += rowHeight;
      }

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

      doc.save(`Welile_Wallet_Statement_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('PDF downloaded successfully');
    } catch (err) {
      console.error('[AgentWalletDetailsCard] PDF export error:', err);
      toast.error('Failed to export PDF');
    } finally {
      setExporting(null);
    }
  }, [agentId, fetchLast25Entries]);

  if (isLoading) {
    return (
      <Card className="border border-border/60 bg-card">
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const netLedger = withdrawableBalance + visibleFloatBalance;

  return (
    <Card className={cn(
      "border border-border/60 bg-card overflow-hidden",
      onOpenWallet && "cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all active:scale-[0.99] touch-manipulation"
    )}
    onClick={onOpenWallet}
    style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2 text-foreground">
            <Wallet className="h-4 w-4 text-primary" />
            Wallet Details
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={(e) => { e.stopPropagation(); exportToPDF(); }}
              disabled={!!exporting}
              title="Export last 25 as PDF"
            >
              {exporting === 'pdf' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-4">
        {/* Primary balances */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-primary/5 border border-primary/10 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 mb-1">
              Available
            </p>
            <p className={cn(
              "font-bold text-lg tabular-nums leading-tight",
              withdrawableBalance > 0 ? 'text-primary' : 'text-muted-foreground'
            )}>
              {formatUGX(withdrawableBalance)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Can withdraw now</p>
          </div>

          <div className="rounded-xl bg-muted/40 border border-border/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Ledger Balance
            </p>
            <p className="font-bold text-lg tabular-nums leading-tight text-foreground">
              {formatUGX(netLedger)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Backed by ledger</p>
          </div>
        </div>

        {/* Secondary buckets */}
        <div className="space-y-2">
          {visibleFloatBalance > 0 && (
            <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 last:border-0">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ArrowDownLeft className="h-3 w-3 text-amber-500" />
                Wallet Float
              </span>
              <span className="text-xs font-medium text-foreground tabular-nums">{formatUGX(visibleFloatBalance)}</span>
            </div>
          )}
          {advanceBalance > 0 && (
            <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 last:border-0">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ArrowUpRight className="h-3 w-3 text-destructive" />
                Advance Owed
              </span>
              <span className="text-xs font-medium text-destructive tabular-nums">{formatUGX(advanceBalance)}</span>
            </div>
          )}
          {pendingHolds > 0 && (
            <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 last:border-0">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-amber-600" />
                Pending Hold
              </span>
              <span className="text-xs font-medium text-amber-600 tabular-nums">{formatUGX(pendingHolds)}</span>
            </div>
          )}
        </div>

        {/* Movement counts */}
        <div className="rounded-xl bg-muted/30 border border-border/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            Recent Movements
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="text-sm font-bold text-foreground tabular-nums">{counts.last24h}</p>
              <p className="text-[10px] text-muted-foreground">24h</p>
            </div>
            <div className="text-center border-x border-border/30">
              <p className="text-sm font-bold text-foreground tabular-nums">{counts.last7d}</p>
              <p className="text-[10px] text-muted-foreground">7d</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-foreground tabular-nums">{counts.last30d}</p>
              <p className="text-[10px] text-muted-foreground">30d</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

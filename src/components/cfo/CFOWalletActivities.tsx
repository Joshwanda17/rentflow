import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, FileText, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { UserSearchPicker } from './UserSearchPicker';
import { formatUGX } from '@/lib/rentCalculations';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

interface UserResult {
  id: string;
  full_name: string;
  phone: string;
}

interface LedgerEntry {
  id: string;
  transaction_date: string;
  amount: number;
  direction: string;
  category: string;
  description: string | null;
  reference_id: string | null;
  linked_party: string | null;
  source_table: string;
  ledger_scope: string;
  classification: string | null;
}

const PAGE = 1000;

export function CFOWalletActivities() {
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadActivities = async (user: UserResult) => {
    setLoading(true);
    setEntries([]);
    try {
      const all: LedgerEntry[] = [];
      let from = 0;
      // CFO scope: full visibility on wallet + bridge legs (no admin_correction filter)
      while (true) {
        const { data, error } = await supabase
          .from('general_ledger')
          .select('id, transaction_date, amount, direction, category, description, reference_id, linked_party, source_table, ledger_scope, classification')
          .eq('user_id', user.id)
          .in('ledger_scope', ['wallet', 'bridge'])
          .order('transaction_date', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as LedgerEntry[]));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      setEntries(all);
    } catch (err: any) {
      console.error('[CFOWalletActivities] load failed:', err);
      toast.error(err.message || 'Failed to load wallet activities');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (u: UserResult | null) => {
    setSelectedUser(u);
    setEntries([]);
    if (u) loadActivities(u);
  };

  const totalIn = entries.filter(e => e.direction === 'cash_in').reduce((s, e) => s + Number(e.amount), 0);
  const totalOut = entries.filter(e => e.direction === 'cash_out').reduce((s, e) => s + Number(e.amount), 0);
  const netBalance = totalIn - totalOut;

  const exportPdf = async () => {
    if (!selectedUser || entries.length === 0) {
      toast.error('Nothing to export');
      return;
    }
    setExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTableMod: any = await import('jspdf-autotable');
      const autoTable = autoTableMod.default || autoTableMod;

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;

      // Header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('WELILE', margin, 10);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Wallet Activities Statement', margin, 16);
      doc.setFontSize(8);
      doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pageWidth - margin, 10, { align: 'right' });
      doc.text('CFO Export — Confidential', pageWidth - margin, 16, { align: 'right' });

      // Owner block
      doc.setTextColor(0, 0, 0);
      let y = 30;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Wallet Owner', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      y += 5;
      doc.text(`Name: ${selectedUser.full_name || '—'}`, margin, y);
      y += 5;
      doc.text(`Phone: ${selectedUser.phone || '—'}`, margin, y);
      y += 5;
      doc.text(`User ID: ${selectedUser.id}`, margin, y);
      y += 8;

      // Summary
      doc.setFont('helvetica', 'bold');
      doc.text('Summary', margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.text(`Total In:  ${formatUGX(totalIn)}`, margin, y);
      y += 5;
      doc.text(`Total Out: ${formatUGX(totalOut)}`, margin, y);
      y += 5;
      doc.text(`Net:       ${formatUGX(netBalance)}`, margin, y);
      y += 5;
      doc.text(`Entries:   ${entries.length}`, margin, y);
      y += 6;

      // Table
      const rows = entries.map(e => [
        format(parseISO(e.transaction_date), 'dd MMM yyyy HH:mm'),
        e.direction === 'cash_in' ? 'IN' : 'OUT',
        e.category.replace(/_/g, ' '),
        e.description || '—',
        formatUGX(Number(e.amount)),
      ]);

      autoTable(doc, {
        startY: y,
        head: [['Date', 'Dir', 'Category', 'Description', 'Amount']],
        body: rows,
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 12 },
          2: { cellWidth: 35 },
          3: { cellWidth: 75 },
          4: { cellWidth: 28, halign: 'right' },
        },
        margin: { left: margin, right: margin },
      });

      const safe = (selectedUser.full_name || 'wallet').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 50);
      doc.save(`wallet-activities_${safe}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
      toast.success('PDF exported');
    } catch (err: any) {
      console.error('[CFOWalletActivities] export failed:', err);
      toast.error(err.message || 'Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">📒 Wallet Activities</h1>
        <p className="text-sm text-muted-foreground">
          Search a wallet owner by name or phone to view every wallet ledger entry, then export as PDF.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <UserSearchPicker
            label="Wallet Owner"
            placeholder="Search by name or phone..."
            selectedUser={selectedUser}
            onSelect={handleSelect}
          />
        </CardContent>
      </Card>

      {selectedUser && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total In</p>
              <p className="text-lg font-bold text-success">{formatUGX(totalIn)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total Out</p>
              <p className="text-lg font-bold text-destructive">{formatUGX(totalOut)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Net</p>
              <p className={`text-lg font-bold ${netBalance >= 0 ? 'text-success' : 'text-destructive'}`}>{formatUGX(netBalance)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Entries</p>
              <p className="text-lg font-bold">{entries.length}</p>
            </CardContent></Card>
          </div>

          <div className="flex justify-end">
            <Button onClick={exportPdf} disabled={exporting || loading || entries.length === 0} size="sm">
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Export PDF
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Activities ({entries.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
                </div>
              ) : entries.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">No wallet activities found.</div>
              ) : (
                <div className="space-y-1 max-h-[600px] overflow-y-auto">
                  {entries.map(e => {
                    const isIn = e.direction === 'cash_in';
                    return (
                      <div key={e.id} className="flex items-start justify-between gap-2 p-2 rounded-lg hover:bg-muted/30 border-b last:border-0">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          {isIn
                            ? <ArrowDownLeft className="h-4 w-4 text-success shrink-0 mt-0.5" />
                            : <ArrowUpRight className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{e.description || e.category.replace(/_/g, ' ')}</p>
                            <div className="flex items-center gap-2 flex-wrap mt-0.5">
                              <span className="text-[10px] text-muted-foreground">
                                {format(parseISO(e.transaction_date), 'dd MMM yyyy HH:mm')}
                              </span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{e.category}</Badge>
                              {e.classification && e.classification !== 'production' && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{e.classification}</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className={`text-sm font-mono font-semibold shrink-0 ${isIn ? 'text-success' : 'text-destructive'}`}>
                          {isIn ? '+' : '−'}{formatUGX(Number(e.amount))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer, Download, CalendarIcon, RefreshCw, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { formatUGX } from '@/lib/rentCalculations';
import { format, startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { exportToCSV } from '@/lib/exportUtils';
import { toast } from 'sonner';

interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  category: string;
  debit: number;
  credit: number;
  balance: number;
  reference: string;
  party: string;
}

type DatePreset = 'all' | 'today' | '7days' | '30days' | 'month' | 'year';

export function GeneralLedger() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DatePreset>('30days');
  const [startDate, setStartDate] = useState<Date | undefined>(startOfDay(subDays(new Date(), 30)));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfDay(new Date()));
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLedgerData();
  }, [startDate, endDate]);

  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();
    switch (preset) {
      case 'all':
        setStartDate(undefined);
        setEndDate(undefined);
        break;
      case 'today':
        setStartDate(startOfDay(now));
        setEndDate(endOfDay(now));
        break;
      case '7days':
        setStartDate(startOfDay(subDays(now, 7)));
        setEndDate(endOfDay(now));
        break;
      case '30days':
        setStartDate(startOfDay(subDays(now, 30)));
        setEndDate(endOfDay(now));
        break;
      case 'month':
        setStartDate(startOfMonth(now));
        setEndDate(endOfDay(now));
        break;
      case 'year':
        setStartDate(startOfYear(now));
        setEndDate(endOfDay(now));
        break;
    }
  };

  const fetchLedgerData = async () => {
    setLoading(true);
    try {
      const allEntries: LedgerEntry[] = [];

      // Fetch deposits (Credits - money coming in)
      let depositsQuery = supabase.from('wallet_deposits').select('id, amount, created_at, transaction_id, user_id').eq('status', 'approved');
      if (startDate) depositsQuery = depositsQuery.gte('created_at', startDate.toISOString());
      if (endDate) depositsQuery = depositsQuery.lte('created_at', endDate.toISOString());
      const { data: deposits } = await depositsQuery.order('created_at', { ascending: true });

      deposits?.forEach(d => {
        allEntries.push({
          id: d.id,
          date: d.created_at,
          description: 'Wallet Deposit',
          category: 'Deposit',
          debit: 0,
          credit: d.amount,
          balance: 0,
          reference: d.transaction_id || '-',
          party: 'User',
        });
      });

      // Fetch withdrawals (Debits - money going out)
      let withdrawalsQuery = supabase.from('wallet_withdrawals').select('id, amount, created_at, user_id').eq('status', 'approved');
      if (startDate) withdrawalsQuery = withdrawalsQuery.gte('created_at', startDate.toISOString());
      if (endDate) withdrawalsQuery = withdrawalsQuery.lte('created_at', endDate.toISOString());
      const { data: withdrawals } = await withdrawalsQuery.order('created_at', { ascending: true });

      withdrawals?.forEach(w => {
        allEntries.push({
          id: w.id,
          date: w.created_at,
          description: 'Wallet Withdrawal',
          category: 'Withdrawal',
          debit: w.amount,
          credit: 0,
          balance: 0,
          reference: '-',
          party: 'User',
        });
      });

      // Fetch platform transactions
      let platformQuery = supabase.from('platform_transactions').select('id, amount, direction, transaction_type, description, created_at, reference_number');
      if (startDate) platformQuery = platformQuery.gte('created_at', startDate.toISOString());
      if (endDate) platformQuery = platformQuery.lte('created_at', endDate.toISOString());
      const { data: platformTx } = await platformQuery.order('created_at', { ascending: true });

      platformTx?.forEach(tx => {
        const isCredit = tx.direction === 'credit' || tx.direction === 'in';
        allEntries.push({
          id: tx.id,
          date: tx.created_at,
          description: tx.description || tx.transaction_type || 'Platform Transaction',
          category: tx.transaction_type || 'Platform',
          debit: isCredit ? 0 : tx.amount,
          credit: isCredit ? tx.amount : 0,
          balance: 0,
          reference: tx.reference_number || '-',
          party: 'Platform',
        });
      });

      // Fetch agent earnings (Debits - payouts)
      let earningsQuery = supabase.from('agent_earnings').select('id, amount, earning_type, description, created_at, agent_id');
      if (startDate) earningsQuery = earningsQuery.gte('created_at', startDate.toISOString());
      if (endDate) earningsQuery = earningsQuery.lte('created_at', endDate.toISOString());
      const { data: earnings } = await earningsQuery.order('created_at', { ascending: true });

      earnings?.forEach(e => {
        allEntries.push({
          id: e.id,
          date: e.created_at,
          description: e.description || `Agent ${e.earning_type}`,
          category: 'Agent Earning',
          debit: e.amount,
          credit: 0,
          balance: 0,
          reference: '-',
          party: 'Agent',
        });
      });

      // Fetch wallet transfers
      let transfersQuery = supabase.from('wallet_transactions').select('id, amount, description, created_at, sender_id, recipient_id');
      if (startDate) transfersQuery = transfersQuery.gte('created_at', startDate.toISOString());
      if (endDate) transfersQuery = transfersQuery.lte('created_at', endDate.toISOString());
      const { data: transfers } = await transfersQuery.order('created_at', { ascending: true });

      transfers?.forEach(t => {
        allEntries.push({
          id: t.id,
          date: t.created_at,
          description: t.description || 'Wallet Transfer',
          category: 'Transfer',
          debit: t.amount,
          credit: t.amount,
          balance: 0,
          reference: '-',
          party: 'Internal',
        });
      });

      // Sort by date
      allEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Calculate running balance
      let runningBalance = 0;
      allEntries.forEach(entry => {
        runningBalance += entry.credit - entry.debit;
        entry.balance = runningBalance;
      });

      setEntries(allEntries);
    } catch (err) {
      console.error('Failed to fetch ledger data:', err);
      toast.error('Failed to load ledger data');
    } finally {
      setLoading(false);
    }
  };

  const totalDebits = entries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredits = entries.reduce((sum, e) => sum + e.credit, 0);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>General Ledger - Welile</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { text-align: center; margin-bottom: 5px; }
          .subtitle { text-align: center; color: #666; margin-bottom: 20px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #f3f4f6; padding: 8px 6px; text-align: left; border-bottom: 2px solid #d1d5db; font-weight: 600; }
          td { padding: 6px; border-bottom: 1px solid #e5e7eb; }
          .debit { color: #dc2626; }
          .credit { color: #16a34a; }
          .total-row { font-weight: bold; border-top: 2px solid #333; background: #f9fafb; }
          .summary { display: flex; justify-content: space-between; margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px; }
          .summary-item { text-align: center; }
          .summary-label { font-size: 11px; color: #666; }
          .summary-value { font-size: 18px; font-weight: bold; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>WELILE - General Ledger</h1>
        <p class="subtitle">
          Period: ${startDate ? format(startDate, 'dd MMM yyyy') : 'All time'} - ${endDate ? format(endDate, 'dd MMM yyyy') : 'Present'}
          <br/>Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}
        </p>
        <div class="summary">
          <div class="summary-item">
            <div class="summary-label">Total Debits</div>
            <div class="summary-value debit">UGX ${totalDebits.toLocaleString()}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Total Credits</div>
            <div class="summary-value credit">UGX ${totalCredits.toLocaleString()}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Net Balance</div>
            <div class="summary-value">UGX ${(totalCredits - totalDebits).toLocaleString()}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Entries</div>
            <div class="summary-value">${entries.length}</div>
          </div>
        </div>
        <br/>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Reference</th>
              <th>Debit (UGX)</th>
              <th>Credit (UGX)</th>
              <th>Balance (UGX)</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map((e, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${format(new Date(e.date), 'dd/MM/yyyy')}</td>
                <td>${e.description}</td>
                <td>${e.category}</td>
                <td>${e.reference}</td>
                <td class="debit">${e.debit > 0 ? e.debit.toLocaleString() : '-'}</td>
                <td class="credit">${e.credit > 0 ? e.credit.toLocaleString() : '-'}</td>
                <td>${e.balance.toLocaleString()}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="5">TOTALS</td>
              <td class="debit">${totalDebits.toLocaleString()}</td>
              <td class="credit">${totalCredits.toLocaleString()}</td>
              <td>${(totalCredits - totalDebits).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const handleExportCSV = () => {
    exportToCSV({
      headers: ['#', 'Date', 'Description', 'Category', 'Reference', 'Party', 'Debit', 'Credit', 'Balance'],
      rows: entries.map((e, i) => [
        i + 1,
        format(new Date(e.date), 'dd/MM/yyyy'),
        e.description,
        e.category,
        e.reference,
        e.party,
        e.debit,
        e.credit,
        e.balance,
      ]),
    }, 'general_ledger');
    toast.success('CSV exported successfully');
  };

  const presets: { value: DatePreset; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7days', label: '7 Days' },
    { value: '30days', label: '30 Days' },
    { value: 'month', label: 'This Month' },
    { value: 'year', label: 'This Year' },
    { value: 'all', label: 'All Time' },
  ];

  return (
    <div className="space-y-4">
      {/* Date Filters */}
      <div className="flex flex-wrap gap-2">
        {presets.map(p => (
          <Button
            key={p.value}
            size="sm"
            variant={datePreset === p.value ? 'default' : 'outline'}
            onClick={() => handlePresetChange(p.value)}
            className="text-xs"
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <ArrowUpRight className="h-4 w-4 text-destructive mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Total Debits</p>
            <p className="text-sm font-bold text-destructive">{formatUGX(totalDebits)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <ArrowDownLeft className="h-4 w-4 text-success mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Total Credits</p>
            <p className="text-sm font-bold text-success">{formatUGX(totalCredits)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Net Balance</p>
            <p className={cn("text-sm font-bold", totalCredits - totalDebits >= 0 ? 'text-success' : 'text-destructive')}>
              {formatUGX(totalCredits - totalDebits)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Entries</p>
            <p className="text-sm font-bold">{entries.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button onClick={handlePrint} size="sm" className="gap-2">
          <Printer className="h-4 w-4" />
          Print Ledger
        </Button>
        <Button onClick={handleExportCSV} size="sm" variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
        <Button onClick={fetchLedgerData} size="sm" variant="ghost" className="gap-2" disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Ledger Table */}
      <div ref={printRef}>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading ledger...</div>
            ) : entries.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No transactions found for this period</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Ref</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry, i) => (
                      <TableRow key={entry.id + i}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{format(new Date(entry.date), 'dd/MM/yy')}</TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate">{entry.description}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{entry.category}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{entry.reference}</TableCell>
                        <TableCell className="text-right text-xs font-medium text-destructive">
                          {entry.debit > 0 ? formatUGX(entry.debit) : '-'}
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium text-success">
                          {entry.credit > 0 ? formatUGX(entry.credit) : '-'}
                        </TableCell>
                        <TableCell className={cn("text-right text-xs font-bold", entry.balance >= 0 ? 'text-foreground' : 'text-destructive')}>
                          {formatUGX(entry.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5} className="font-bold">TOTALS</TableCell>
                      <TableCell className="text-right font-bold text-destructive">{formatUGX(totalDebits)}</TableCell>
                      <TableCell className="text-right font-bold text-success">{formatUGX(totalCredits)}</TableCell>
                      <TableCell className={cn("text-right font-bold", totalCredits - totalDebits >= 0 ? 'text-foreground' : 'text-destructive')}>
                        {formatUGX(totalCredits - totalDebits)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

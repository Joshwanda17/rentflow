import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer, Download, RefreshCw, ArrowDownLeft, ArrowUpRight, Search, Filter } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { formatUGX } from '@/lib/rentCalculations';
import { format, startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from 'date-fns';
import { cn } from '@/lib/utils';
import { exportToCSV } from '@/lib/exportUtils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
type CategoryFilter = 'all' | 'deposit' | 'agent_commission' | 'cash_in' | 'cash_out';
type DirectionFilter = 'all' | 'debit' | 'credit';

const categoryOptions: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'agent_commission', label: 'Agent Commissions' },
  { value: 'cash_in', label: 'Cash In' },
  { value: 'cash_out', label: 'Cash Out' },
];

export function GeneralLedger() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DatePreset>('30days');
  const [startDate, setStartDate] = useState<Date | undefined>(startOfDay(subDays(new Date(), 30)));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfDay(new Date()));
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
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
      // Single query to the dedicated general_ledger table
      let query = supabase
        .from('general_ledger')
        .select('id, transaction_date, amount, direction, category, description, reference_id, linked_party, running_balance')
        .order('created_at', { ascending: true });

      if (startDate) query = query.gte('transaction_date', startDate.toISOString());
      if (endDate) query = query.lte('transaction_date', endDate.toISOString());

      const { data, error } = await query;

      if (error) throw error;

      const allEntries: LedgerEntry[] = (data || []).map(row => ({
        id: row.id,
        date: row.transaction_date,
        description: row.description || row.category || 'Transaction',
        category: row.category || 'Other',
        debit: row.direction === 'cash_out' ? Number(row.amount) : 0,
        credit: row.direction === 'cash_in' ? Number(row.amount) : 0,
        balance: Number(row.running_balance) || 0,
        reference: row.reference_id || '-',
        party: row.linked_party || '-',
      }));

      setEntries(allEntries);
    } catch (err) {
      console.error('Failed to fetch ledger data:', err);
      toast.error('Failed to load ledger data');
    } finally {
      setLoading(false);
    }
  };

  // Apply client-side filters
  const filteredEntries = entries.filter(e => {
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (directionFilter === 'debit' && e.debit === 0) return false;
    if (directionFilter === 'credit' && e.credit === 0) return false;
    if (searchTerm && !e.description.toLowerCase().includes(searchTerm.toLowerCase()) && !e.party.toLowerCase().includes(searchTerm.toLowerCase()) && !e.category.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Recalculate running balance for filtered view
  let filteredBalance = 0;
  filteredEntries.forEach(entry => {
    filteredBalance += entry.credit - entry.debit;
    entry.balance = filteredBalance;
  });

  const totalDebits = filteredEntries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredits = filteredEntries.reduce((sum, e) => sum + e.credit, 0);

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
          ${categoryFilter !== 'all' ? '<br/>Filter: ' + categoryFilter : ''}${directionFilter !== 'all' ? ' | ' + directionFilter + ' only' : ''}
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
            <div class="summary-value">${filteredEntries.length}</div>
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
            ${filteredEntries.map((e, i) => `
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
      rows: filteredEntries.map((e, i) => [
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

      {/* Category, Direction & Search Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
          <SelectTrigger className="w-[160px] h-9 text-xs">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map(c => (
              <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={directionFilter} onValueChange={(v) => setDirectionFilter(v as DirectionFilter)}>
          <SelectTrigger className="w-[140px] h-9 text-xs">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Directions</SelectItem>
            <SelectItem value="debit" className="text-xs">Debits Only</SelectItem>
            <SelectItem value="credit" className="text-xs">Credits Only</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-7 h-9 w-[180px] text-xs"
          />
        </div>

        {(categoryFilter !== 'all' || directionFilter !== 'all' || searchTerm) && (
          <Button size="sm" variant="ghost" className="text-xs h-9" onClick={() => { setCategoryFilter('all'); setDirectionFilter('all'); setSearchTerm(''); }}>
            Clear Filters
          </Button>
        )}
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
            <p className="text-sm font-bold">{filteredEntries.length}</p>
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
            ) : filteredEntries.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No transactions match the current filters</div>
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
                    {filteredEntries.map((entry, i) => (
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

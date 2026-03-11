import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { Search, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function FinancialTransactionsTable() {
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['coo-ledger-transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('general_ledger')
        .select('*')
        .order('transaction_date', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const categories = useMemo(() => {
    if (!transactions) return [];
    return [...new Set(transactions.map(t => t.category))].sort();
  }, [transactions]);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(t => {
      if (search) {
        const s = search.toLowerCase();
        const match = (t.reference_id || '').toLowerCase().includes(s) ||
          (t.linked_party || '').toLowerCase().includes(s) ||
          (t.description || '').toLowerCase().includes(s) ||
          (t.category || '').toLowerCase().includes(s);
        if (!match) return false;
      }
      if (directionFilter !== 'all' && t.direction !== directionFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      return true;
    });
  }, [transactions, search, directionFilter, categoryFilter]);

  const exportCSV = () => {
    const headers = ['Date', 'Reference', 'Category', 'Direction', 'Amount', 'Linked Party', 'Description'];
    const rows = filtered.map(t => [
      t.transaction_date, t.reference_id || '', t.category, t.direction,
      t.amount, t.linked_party || '', (t.description || '').replace(/,/g, ' '),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-lg">Financial Transactions</CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search ref, party, category..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="w-[110px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Flow</SelectItem>
                <SelectItem value="cash_in">Cash In</SelectItem>
                <SelectItem value="cash_out">Cash Out</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCSV} className="h-9">
              <Download className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Linked Party</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No transactions found</TableCell></TableRow>
                ) : filtered.slice(0, 100).map(tx => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {format(new Date(tx.transaction_date), 'MMM d, yyyy')}<br />
                      <span className="text-muted-foreground">{format(new Date(tx.transaction_date), 'HH:mm')}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{(tx.reference_id || '—').slice(0, 13)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{tx.category.replace(/_/g, ' ')}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={tx.direction === 'cash_in' ? 'default' : 'secondary'} className="text-[10px]">
                        {tx.direction === 'cash_in' ? '↓ IN' : '↑ OUT'}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-semibold whitespace-nowrap ${tx.direction === 'cash_in' ? 'text-emerald-600' : 'text-foreground'}`}>
                      {tx.direction === 'cash_in' ? '+' : '-'}{formatUGX(tx.amount)}
                    </TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{tx.linked_party || '—'}</TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate text-muted-foreground">{tx.description || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > 100 && (
              <p className="text-xs text-muted-foreground text-center py-2">Showing 100 of {filtered.length} results</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { Search, Loader2, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 50;

export default function FinancialTransactionsTable() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(0);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 400);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['coo-ledger-transactions', debouncedSearch, directionFilter, categoryFilter, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_paginated_transactions', {
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
        p_direction: directionFilter === 'all' ? null : directionFilter,
        p_category: categoryFilter === 'all' ? null : categoryFilter,
        p_search: debouncedSearch || null,
      });
      if (error) throw error;
      return data || [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const transactions = data || [];
  const totalCount = transactions.length > 0 ? Number(transactions[0].total_count) : 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Fetch categories once (lightweight)
  const { data: categories = [] } = useQuery({
    queryKey: ['ledger-categories'],
    queryFn: async () => {
      const { data } = await supabase
        .from('general_ledger')
        .select('category')
        .limit(200);
      if (!data) return [];
      return [...new Set(data.map(t => t.category))].sort();
    },
    staleTime: 10 * 60 * 1000,
  });

  const exportCSV = () => {
    const headers = ['Date', 'Reference', 'Category', 'Direction', 'Amount', 'Linked Party', 'Description'];
    const rows = transactions.map((t: any) => [
      t.transaction_date, t.reference_id || '', t.category, t.direction,
      t.amount, t.linked_party || '', (t.description || '').replace(/,/g, ' '),
    ]);
    const csv = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
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
          <div>
            <CardTitle className="text-lg">Financial Transactions</CardTitle>
            {totalCount > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalCount.toLocaleString()} total transactions
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search ref, party, category..." value={search} onChange={e => handleSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            <Select value={directionFilter} onValueChange={v => { setDirectionFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[110px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Flow</SelectItem>
                <SelectItem value="cash_in">Cash In</SelectItem>
                <SelectItem value="cash_out">Cash Out</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(0); }}>
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
          <>
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
                  {transactions.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No transactions found</TableCell></TableRow>
                  ) : transactions.map((tx: any) => (
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
            </div>
            {/* Server-side pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-xs text-muted-foreground">
                  Page {page + 1} of {totalPages.toLocaleString()} · {totalCount.toLocaleString()} records
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-8 w-8 p-0">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-8 w-8 p-0">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

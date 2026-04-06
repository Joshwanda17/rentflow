import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Banknote, Search, ArrowUpDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-warning/20 text-warning',
  approved: 'bg-success/20 text-success',
  rejected: 'bg-destructive/20 text-destructive',
  processing: 'bg-primary/20 text-primary',
  completed: 'bg-success/20 text-success',
  failed: 'bg-destructive/20 text-destructive',
};

type SortKey = 'month' | 'status' | 'amount' | 'employees' | 'created';
const PAGE_SIZE = 15;

export default function HRPayroll() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['hr-payroll-batches'],
    queryFn: async () => {
      const { data } = await supabase
        .from('payroll_batches')
        .select('*, prepared_profile:profiles!payroll_batches_prepared_by_fkey(full_name), approved_profile:profiles!payroll_batches_approved_by_fkey(full_name)')
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    let result = batches.filter((b: any) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (b.batch_month || '').toLowerCase().includes(q) ||
        (b.notes || '').toLowerCase().includes(q) ||
        (b.prepared_profile?.full_name || '').toLowerCase().includes(q) ||
        (b.approved_profile?.full_name || '').toLowerCase().includes(q);
    });

    result.sort((a: any, b: any) => {
      let cmp = 0;
      if (sortKey === 'month') cmp = (a.batch_month || '').localeCompare(b.batch_month || '');
      else if (sortKey === 'status') cmp = (a.status || '').localeCompare(b.status || '');
      else if (sortKey === 'amount') cmp = Number(a.total_amount || 0) - Number(b.total_amount || 0);
      else if (sortKey === 'employees') cmp = (a.total_employees || a.employee_count || 0) - (b.total_employees || b.employee_count || 0);
      else if (sortKey === 'created') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [batches, search, statusFilter, sortKey, sortAsc]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
    setPage(0);
  };

  // Stats
  const totalBatches = batches.length;
  const approvedCount = batches.filter((b: any) => b.status === 'approved' || b.status === 'completed').length;
  const rejectedCount = batches.filter((b: any) => b.status === 'rejected').length;
  const totalDisbursed = batches.filter((b: any) => b.status === 'approved' || b.status === 'completed').reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0);

  const handleExport = () => {
    const rows = filtered.map((b: any) => ({
      Month: b.batch_month || '',
      Status: b.status,
      Amount: b.total_amount,
      Employees: b.total_employees || b.employee_count || 0,
      'Prepared By': b.prepared_profile?.full_name || '',
      'Approved By': b.approved_profile?.full_name || '',
      Created: b.created_at,
    }));
    if (rows.length === 0) return;
    const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'payroll_batches.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">Payroll Management</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Review and manage payroll batches</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-border/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Batches</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{totalBatches}</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Approved</p>
            <p className="text-2xl font-bold text-success mt-0.5">{approvedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Rejected</p>
            <p className="text-2xl font-bold text-destructive mt-0.5">{rejectedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Disbursed</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">UGX {totalDisbursed.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search month, notes, prepared by..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs ml-auto" onClick={handleExport} disabled={filtered.length === 0}>
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Banknote className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No payroll batches found</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>
                    <button onClick={() => toggleSort('month')} className="flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                      Month <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden md:table-cell text-xs font-semibold uppercase tracking-wider">Period</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort('employees')} className="flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                      Employees <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort('amount')} className="flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                      Amount <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort('status')} className="flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                      Status <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden lg:table-cell text-xs font-semibold uppercase tracking-wider">Prepared By</TableHead>
                  <TableHead className="hidden lg:table-cell text-xs font-semibold uppercase tracking-wider">Approved By</TableHead>
                  <TableHead className="hidden md:table-cell">
                    <button onClick={() => toggleSort('created')} className="flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                      Created <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((batch: any) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium text-sm">{batch.batch_month || '—'}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {batch.period_start && batch.period_end ? `${batch.period_start} → ${batch.period_end}` : '—'}
                    </TableCell>
                    <TableCell className="text-xs">{batch.total_employees || batch.employee_count || 0}</TableCell>
                    <TableCell className="text-xs font-semibold">UGX {Number(batch.total_amount || 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={cn("text-[10px]", statusColors[batch.status] || '')}>{batch.status}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{batch.prepared_profile?.full_name || '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{batch.approved_profile?.full_name || '—'}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {format(new Date(batch.created_at), 'dd MMM yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = page < 3 ? i : page > totalPages - 3 ? totalPages - 5 + i : page - 2 + i;
                if (p < 0 || p >= totalPages) return null;
                return (
                  <Button key={p} variant={p === page ? 'default' : 'ghost'} size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setPage(p)}>
                    {p + 1}
                  </Button>
                );
              })}
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

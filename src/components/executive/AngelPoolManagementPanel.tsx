import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAngelPoolConfig } from '@/hooks/useAngelPoolConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Settings, Download, ArrowUpDown, TrendingUp, Users, PieChart, DollarSign, BarChart3, Layers } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';

interface Props {
  userRole: string;
}

interface Investor {
  investor_id: string;
  total_shares: number;
  total_amount: number;
  pool_pct: number;
  company_pct: number;
  latest_date: string;
  status: string;
  name: string;
}

export function AngelPoolManagementPanel({ userRole }: Props) {
  const { config, isLoading: configLoading, updateConfig } = useAngelPoolConfig();
  const [editOpen, setEditOpen] = useState(false);
  const [editValues, setEditValues] = useState({ total_pool_ugx: 0, total_shares: 0, price_per_share: 0, pool_equity_percent: 0 });
  const [sortKey, setSortKey] = useState<keyof Investor>('total_shares');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  // Fetch investments joined with profiles
  const { data: investments = [], isLoading: investLoading } = useQuery({
    queryKey: ['angel-pool-management-investors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('angel_pool_investments')
        .select('investor_id, shares, amount, pool_ownership_percent, company_ownership_percent, created_at, status')
        .eq('status', 'confirmed');
      if (error) throw error;

      // aggregate by investor
      const map = new Map<string, { total_shares: number; total_amount: number; pool_pct: number; company_pct: number; latest_date: string; status: string }>();
      for (const r of data ?? []) {
        const e = map.get(r.investor_id);
        if (e) {
          e.total_shares += r.shares;
          e.total_amount += r.amount;
          e.pool_pct += r.pool_ownership_percent;
          e.company_pct += r.company_ownership_percent;
          if (r.created_at > e.latest_date) e.latest_date = r.created_at;
        } else {
          map.set(r.investor_id, { total_shares: r.shares, total_amount: r.amount, pool_pct: r.pool_ownership_percent, company_pct: r.company_ownership_percent, latest_date: r.created_at, status: r.status });
        }
      }

      // fetch names
      const ids = Array.from(map.keys());
      if (!ids.length) return [];
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const nameMap = new Map((profiles ?? []).map(p => [p.id, p.full_name || 'Unknown']));

      return ids.map(id => {
        const v = map.get(id)!;
        return { investor_id: id, ...v, name: nameMap.get(id) || 'Unknown' } as Investor;
      });
    },
  });

  const totalRaised = investments.reduce((s, i) => s + i.total_amount, 0);
  const sharesSold = investments.reduce((s, i) => s + i.total_shares, 0);
  const sharesRemaining = config.total_shares - sharesSold;
  const fillPct = config.total_shares > 0 ? (sharesSold / config.total_shares) * 100 : 0;
  const equityAllocated = config.total_shares > 0 ? (sharesSold / config.total_shares) * config.pool_equity_percent : 0;

  // sorting
  const sorted = useMemo(() => {
    return [...investments].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [investments, sortKey, sortDir]);

  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const toggleSort = (key: keyof Investor) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  // chart data — top 10
  const chartData = useMemo(() => {
    return [...investments].sort((a, b) => b.total_shares - a.total_shares).slice(0, 10).map(i => ({
      name: i.name.length > 12 ? i.name.slice(0, 12) + '…' : i.name,
      shares: i.total_shares,
    }));
  }, [investments]);

  const exportCSV = () => {
    const headers = ['#', 'Name', 'Shares', 'Amount (USh)', 'Pool %', 'Company %', 'Date', 'Status'];
    const rows = sorted.map((inv, i) => [
      i + 1, inv.name, inv.total_shares, inv.total_amount, inv.pool_pct.toFixed(4),
      inv.company_pct.toFixed(4), format(new Date(inv.latest_date), 'yyyy-MM-dd'), inv.status,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `angel-pool-shareholders-${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const openEdit = () => {
    setEditValues({
      total_pool_ugx: config.total_pool_ugx,
      total_shares: config.total_shares,
      price_per_share: config.price_per_share,
      pool_equity_percent: config.pool_equity_percent,
    });
    setEditOpen(true);
  };

  const handleSave = () => {
    updateConfig.mutate(editValues, { onSuccess: () => setEditOpen(false) });
  };

  const fmt = (n: number) => n.toLocaleString('en-UG');
  const isLoading = configLoading || investLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Angel Pool Management</h1>
        </div>
        {userRole === 'ceo' && (
          <Button onClick={openEdit} variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-1" /> Edit Pool Settings
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="h-3.5 w-3.5" /> Total Raised</div>
            <p className="text-lg font-bold">USh {fmt(totalRaised)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingUp className="h-3.5 w-3.5" /> Pool Target</div>
            <p className="text-lg font-bold">USh {fmt(config.total_pool_ugx)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><BarChart3 className="h-3.5 w-3.5" /> Shares Sold</div>
            <p className="text-lg font-bold">{fmt(sharesSold)} <span className="text-xs text-muted-foreground font-normal">/ {fmt(config.total_shares)}</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><PieChart className="h-3.5 w-3.5" /> Pool Fill</div>
            <p className="text-lg font-bold mb-1">{fillPct.toFixed(1)}%</p>
            <Progress value={fillPct} className="h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Users className="h-3.5 w-3.5" /> Shareholders</div>
            <p className="text-lg font-bold">{investments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><PieChart className="h-3.5 w-3.5" /> Equity Allocated</div>
            <p className="text-lg font-bold">{equityAllocated.toFixed(4)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="h-3.5 w-3.5" /> Share Price</div>
            <p className="text-lg font-bold">USh {fmt(config.price_per_share)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><BarChart3 className="h-3.5 w-3.5" /> Shares Left</div>
            <p className="text-lg font-bold">{fmt(sharesRemaining)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top 10 Shareholders by Shares</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [fmt(v), 'Shares']} />
                <Bar dataKey="shares" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">All Shareholders</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-3.5 w-3.5 mr-1" /> Export CSV</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('name')}>Name <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('total_shares')}>Shares <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                  <TableHead className="cursor-pointer text-right hidden sm:table-cell" onClick={() => toggleSort('total_amount')}>Amount <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                  <TableHead className="text-right hidden md:table-cell">Pool %</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Company %</TableHead>
                  <TableHead className="hidden lg:table-cell">Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{isLoading ? 'Loading...' : 'No shareholders yet'}</TableCell></TableRow>
                )}
                {paginated.map((inv, i) => (
                  <TableRow key={inv.investor_id}>
                    <TableCell className="text-muted-foreground">{page * PAGE_SIZE + i + 1}</TableCell>
                    <TableCell className="font-medium">{inv.name}</TableCell>
                    <TableCell className="text-right">{fmt(inv.total_shares)}</TableCell>
                    <TableCell className="text-right hidden sm:table-cell">USh {fmt(inv.total_amount)}</TableCell>
                    <TableCell className="text-right hidden md:table-cell">{inv.pool_pct.toFixed(4)}%</TableCell>
                    <TableCell className="text-right hidden md:table-cell">{inv.company_pct.toFixed(4)}%</TableCell>
                    <TableCell className="hidden lg:table-cell">{format(new Date(inv.latest_date), 'dd MMM yyyy')}</TableCell>
                    <TableCell className="hidden sm:table-cell"><span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{inv.status}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
              <span>Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog — CEO only */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Angel Pool Settings</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Pool Target (UGX)</Label><Input type="number" value={editValues.total_pool_ugx} onChange={e => setEditValues(v => ({ ...v, total_pool_ugx: Number(e.target.value) }))} /></div>
            <div><Label>Total Shares</Label><Input type="number" value={editValues.total_shares} onChange={e => setEditValues(v => ({ ...v, total_shares: Number(e.target.value) }))} /></div>
            <div><Label>Price Per Share (UGX)</Label><Input type="number" value={editValues.price_per_share} onChange={e => setEditValues(v => ({ ...v, price_per_share: Number(e.target.value) }))} /></div>
            <div><Label>Company Equity %</Label><Input type="number" step="0.01" value={editValues.pool_equity_percent} onChange={e => setEditValues(v => ({ ...v, pool_equity_percent: Number(e.target.value) }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateConfig.isPending}>{updateConfig.isPending ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Scale, AlertTriangle, CheckCircle2, RefreshCw, Loader2, Search, Download, Filter } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

interface ReconciliationRow {
  userId: string;
  userName: string;
  walletBalance: number;
  ledgerBalance: number;
  discrepancy: number;
}

type FilterType = 'all' | 'matched' | 'mismatched';

/** Format large numbers compactly: 3.5M, 120K, etc. Full value on hover. */
function compactAmount(amount: number): { display: string; full: string; needsTooltip: boolean } {
  const full = formatUGX(amount);
  const abs = Math.abs(amount);
  if (abs < 100_000) return { display: full, full, needsTooltip: false };
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return { display: `${sign}UGX ${(abs / 1_000_000_000).toFixed(1)}B`, full, needsTooltip: true };
  }
  if (abs >= 1_000_000) {
    return { display: `${sign}UGX ${(abs / 1_000_000).toFixed(1)}M`, full, needsTooltip: true };
  }
  return { display: `${sign}UGX ${(abs / 1_000).toFixed(0)}K`, full, needsTooltip: true };
}

function CompactCurrency({ amount, className }: { amount: number; className?: string }) {
  const { display, full, needsTooltip } = compactAmount(amount);
  if (!needsTooltip) return <span className={className}>{display}</span>;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('cursor-help underline decoration-dotted', className)}>{display}</span>
        </TooltipTrigger>
        <TooltipContent side="top"><p className="font-mono text-xs">{full}</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function exportCSV(rows: ReconciliationRow[]) {
  const header = 'User,Wallet Balance,Ledger Balance,Discrepancy,Status\n';
  const body = rows.map(r =>
    `"${r.userName}",${r.walletBalance},${r.ledgerBalance},${r.discrepancy},${Math.abs(r.discrepancy) > 1 ? 'Mismatch' : 'OK'}`
  ).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reconciliation_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CFOReconciliationPanel() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['cfo-reconciliation'],
    queryFn: async () => {
      const { data: rpcData, error } = await supabase.rpc('get_wallet_reconciliation' as any);
      if (error) throw error;

      const rows = rpcData as any[];
      return (rows || []).map((r: any) => ({
        userId: r.user_id,
        userName: r.user_name || 'Unknown',
        walletBalance: Number(r.wallet_balance) || 0,
        ledgerBalance: Number(r.ledger_balance) || 0,
        discrepancy: Number(r.discrepancy) || 0,
      })) as ReconciliationRow[];
    },
    staleTime: 60_000,
  });

  const allRows = data || [];

  const filtered = useMemo(() => {
    let result = allRows;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r => r.userName.toLowerCase().includes(q));
    }
    if (filter === 'matched') result = result.filter(r => Math.abs(r.discrepancy) <= 1);
    if (filter === 'mismatched') result = result.filter(r => Math.abs(r.discrepancy) > 1);
    return result;
  }, [allRows, search, filter]);

  const mismatchCount = allRows.filter(r => Math.abs(r.discrepancy) > 1).length;
  const matchCount = allRows.length - mismatchCount;
  const totalDiscrepancy = allRows.reduce((s, r) => s + Math.abs(r.discrepancy), 0);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-2">
          <CardContent className="p-4 text-center min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Users</p>
            <p className="text-2xl font-bold truncate">{allRows.length}</p>
          </CardContent>
        </Card>
        <Card className="border-2">
          <CardContent className="p-4 text-center min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Matched</p>
            <p className="text-2xl font-bold text-success truncate">{matchCount}</p>
          </CardContent>
        </Card>
        <Card className={cn('border-2', mismatchCount > 0 ? 'border-destructive/30' : '')}>
          <CardContent className="p-4 text-center min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Mismatched</p>
            <p className={cn('text-2xl font-bold truncate', mismatchCount > 0 ? 'text-destructive' : 'text-success')}>{mismatchCount}</p>
          </CardContent>
        </Card>
        <Card className="border-2">
          <CardContent className="p-4 text-center min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Gap</p>
            <CompactCurrency amount={totalDiscrepancy} className="text-lg font-bold font-mono" />
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary shrink-0" />
              Wallet vs Ledger Reconciliation
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)} disabled={filtered.length === 0}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          {/* Search & Filter row */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
              <SelectTrigger className="w-full sm:w-[140px] h-8 text-sm">
                <Filter className="h-3 w-3 mr-1 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({allRows.length})</SelectItem>
                <SelectItem value="matched">Matched ({matchCount})</SelectItem>
                <SelectItem value="mismatched">Mismatched ({mismatchCount})</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground pt-1">
            Showing {filtered.length} of {allRows.length} users. Compares wallet balances against ledger totals.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-success" />
              <p className="font-semibold">{search || filter !== 'all' ? 'No results' : 'All Balanced'}</p>
              <p className="text-sm">{search ? 'Try a different search term.' : 'No discrepancies found.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left py-2 px-3">User</th>
                    <th className="text-right py-2 px-3">Wallet</th>
                    <th className="text-right py-2 px-3">Ledger</th>
                    <th className="text-right py-2 px-3">Gap</th>
                    <th className="text-center py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map((row) => {
                    const hasMismatch = Math.abs(row.discrepancy) > 1;
                    return (
                      <tr key={row.userId} className={cn('border-b last:border-0', hasMismatch && 'bg-destructive/5')}>
                        <td className="py-2.5 px-3 font-medium truncate max-w-[140px]">{row.userName}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs">
                          <CompactCurrency amount={row.walletBalance} />
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs">
                          <CompactCurrency amount={row.ledgerBalance} />
                        </td>
                        <td className={cn('py-2.5 px-3 text-right font-mono text-xs font-bold', hasMismatch ? 'text-destructive' : 'text-muted-foreground')}>
                          {row.discrepancy > 0 ? '+' : ''}
                          <CompactCurrency amount={row.discrepancy} />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {hasMismatch ? (
                            <Badge variant="destructive" className="text-[10px]">
                              <AlertTriangle className="h-3 w-3 mr-1" />Gap
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-success border-success/30">
                              <CheckCircle2 className="h-3 w-3 mr-1" />OK
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length > 200 && (
                <p className="text-xs text-muted-foreground text-center py-2">Showing 200 of {filtered.length} results. Use search to narrow down.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

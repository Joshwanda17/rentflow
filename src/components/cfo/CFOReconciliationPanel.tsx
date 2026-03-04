import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Scale, AlertTriangle, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

interface ReconciliationRow {
  userId: string;
  userName: string;
  walletBalance: number;
  ledgerBalance: number;
  discrepancy: number;
}

export default function CFOReconciliationPanel() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['cfo-reconciliation'],
    queryFn: async () => {
      // Step 1: Get wallet balances (stored/cached balances)
      const { data: wallets, error: wErr } = await supabase
        .from('wallets')
        .select('user_id, balance')
        .gt('balance', 0);

      if (wErr) throw wErr;

      // Step 2: Get computed balances from general_ledger
      // For each user, sum cash_in - cash_out to get the computed balance
      const { data: ledgerIn, error: lInErr } = await supabase
        .from('general_ledger')
        .select('user_id, amount')
        .not('user_id', 'is', null)
        .eq('direction', 'cash_in');

      const { data: ledgerOut, error: lOutErr } = await supabase
        .from('general_ledger')
        .select('user_id, amount')
        .not('user_id', 'is', null)
        .eq('direction', 'cash_out');

      if (lInErr || lOutErr) throw lInErr || lOutErr;

      // Compute ledger balance per user: sum(cash_in) - sum(cash_out)
      const ledgerBalances = new Map<string, number>();
      for (const entry of ledgerIn || []) {
        if (entry.user_id) {
          ledgerBalances.set(entry.user_id, (ledgerBalances.get(entry.user_id) || 0) + entry.amount);
        }
      }
      for (const entry of ledgerOut || []) {
        if (entry.user_id) {
          ledgerBalances.set(entry.user_id, (ledgerBalances.get(entry.user_id) || 0) - entry.amount);
        }
      }

      // Wallet balance map
      const walletBalances = new Map<string, number>();
      for (const w of wallets || []) {
        walletBalances.set(w.user_id, w.balance);
      }

      // Collect all user IDs that have either a wallet or ledger balance
      const allUserIds = new Set([...walletBalances.keys(), ...ledgerBalances.keys()]);

      // Step 3: Fetch profile names only for users we need
      const userIdsArray = Array.from(allUserIds);
      const profileMap = new Map<string, string>();

      // Batch fetch profiles in chunks of 200 to avoid URL length limits
      for (let i = 0; i < userIdsArray.length; i += 200) {
        const chunk = userIdsArray.slice(i, i + 200);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', chunk);

        for (const p of profiles || []) {
          profileMap.set(p.id, p.full_name);
        }
      }

      // Step 4: Build reconciliation rows
      const rows: ReconciliationRow[] = [];

      for (const userId of allUserIds) {
        const walletBal = walletBalances.get(userId) || 0;
        const ledgerBal = ledgerBalances.get(userId) || 0;
        const disc = ledgerBal - walletBal;

        // Only include rows where there's something to show
        if (walletBal > 0 || ledgerBal > 0 || Math.abs(disc) > 0) {
          rows.push({
            userId,
            userName: profileMap.get(userId) || 'Unknown',
            walletBalance: walletBal,
            ledgerBalance: ledgerBal,
            discrepancy: disc,
          });
        }
      }

      // Sort by discrepancy magnitude (biggest mismatches first)
      rows.sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy));

      const mismatchCount = rows.filter(r => Math.abs(r.discrepancy) > 1).length;
      const matchCount = rows.length - mismatchCount;
      const totalDiscrepancy = rows.reduce((sum, r) => sum + Math.abs(r.discrepancy), 0);

      return { rows: rows.slice(0, 100), totalDiscrepancy, matchCount, mismatchCount, totalRows: rows.length };
    },
    staleTime: 60_000,
  });

  const stats = data || { rows: [], totalDiscrepancy: 0, matchCount: 0, mismatchCount: 0, totalRows: 0 };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-2">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Users</p>
            <p className="text-2xl font-bold">{stats.totalRows}</p>
          </CardContent>
        </Card>
        <Card className="border-2">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Matched</p>
            <p className="text-2xl font-bold text-success">{stats.matchCount}</p>
          </CardContent>
        </Card>
        <Card className={cn('border-2', stats.mismatchCount > 0 ? 'border-destructive/30' : '')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Mismatched</p>
            <p className={cn('text-2xl font-bold', stats.mismatchCount > 0 ? 'text-destructive' : 'text-success')}>
              {stats.mismatchCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-2">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Gap</p>
            <p className="text-lg font-bold font-mono">{formatUGX(stats.totalDiscrepancy)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              Wallet vs Ledger Reconciliation
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Compares stored wallet balances against computed general ledger totals (cash_in − cash_out). Top 100 shown.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : stats.rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-success" />
              <p className="font-semibold">All Balanced</p>
              <p className="text-sm">No discrepancies found between wallet and ledger balances.</p>
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
                  {stats.rows.map((row) => {
                    const hasMismatch = Math.abs(row.discrepancy) > 1;
                    return (
                      <tr key={row.userId} className={cn('border-b last:border-0', hasMismatch && 'bg-destructive/5')}>
                        <td className="py-2.5 px-3 font-medium truncate max-w-[140px]">{row.userName}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs">{formatUGX(row.walletBalance)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs">{formatUGX(row.ledgerBalance)}</td>
                        <td className={cn('py-2.5 px-3 text-right font-mono text-xs font-bold', hasMismatch ? 'text-destructive' : 'text-muted-foreground')}>
                          {row.discrepancy > 0 ? '+' : ''}{formatUGX(row.discrepancy)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {hasMismatch ? (
                            <Badge variant="destructive" className="text-[10px]">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Gap
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-success border-success/30">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              OK
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

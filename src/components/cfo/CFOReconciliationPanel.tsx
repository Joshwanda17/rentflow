import { useState } from 'react';
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
      // Fetch wallet balances from profiles (stored balance)
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name');

      if (pErr) throw pErr;

      // Fetch ledger account balances (computed)
      const { data: accounts, error: aErr } = await supabase
        .from('ledger_accounts')
        .select('account_id, account_code, owner_id, group_id')
        .eq('group_id', (await supabase.from('ledger_account_groups').select('group_id').eq('group_code', 'USER_OWNED').single()).data?.group_id || '');

      // Fetch ledger entries to compute balances
      const accountIds = accounts?.map(a => a.account_id) || [];
      
      if (accountIds.length === 0) {
        return { rows: [] as ReconciliationRow[], totalDiscrepancy: 0, matchCount: 0, mismatchCount: 0 };
      }

      const { data: entries } = await supabase
        .from('ledger_entries')
        .select('account_id, amount, direction')
        .in('account_id', accountIds);

      // Compute ledger balances per account
      const ledgerBalances = new Map<string, number>();
      for (const entry of entries || []) {
        const current = ledgerBalances.get(entry.account_id) || 0;
        ledgerBalances.set(
          entry.account_id,
          entry.direction === 'credit'
            ? current + entry.amount
            : current - entry.amount
        );
      }

      // Map owner_id to ledger balance
      const ownerLedgerBalance = new Map<string, number>();
      for (const acc of accounts || []) {
        if (acc.owner_id) {
          ownerLedgerBalance.set(acc.owner_id, ledgerBalances.get(acc.account_id) || 0);
        }
      }

      // Fetch wallet balances from general_ledger (legacy running balances)
      const { data: walletData } = await supabase
        .from('general_ledger')
        .select('user_id, running_balance')
        .not('user_id', 'is', null)
        .order('created_at', { ascending: false });

      // Get latest running_balance per user
      const walletBalances = new Map<string, number>();
      for (const w of walletData || []) {
        if (w.user_id && !walletBalances.has(w.user_id)) {
          walletBalances.set(w.user_id, w.running_balance || 0);
        }
      }

      // Build reconciliation rows - only for users with either balance
      const rows: ReconciliationRow[] = [];
      const allUserIds = new Set([...ownerLedgerBalance.keys(), ...walletBalances.keys()]);
      
      const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

      for (const userId of allUserIds) {
        const ledgerBal = ownerLedgerBalance.get(userId) || 0;
        const walletBal = walletBalances.get(userId) || 0;
        const disc = Math.abs(ledgerBal - walletBal);
        
        if (disc > 0 || ledgerBal > 0 || walletBal > 0) {
          rows.push({
            userId,
            userName: profileMap.get(userId) || 'Unknown',
            walletBalance: walletBal,
            ledgerBalance: ledgerBal,
            discrepancy: ledgerBal - walletBal,
          });
        }
      }

      // Sort by discrepancy magnitude
      rows.sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy));

      const mismatchCount = rows.filter(r => Math.abs(r.discrepancy) > 1).length;
      const matchCount = rows.length - mismatchCount;
      const totalDiscrepancy = rows.reduce((sum, r) => sum + Math.abs(r.discrepancy), 0);

      return { rows: rows.slice(0, 50), totalDiscrepancy, matchCount, mismatchCount };
    },
    staleTime: 60_000,
  });

  const stats = data || { rows: [], totalDiscrepancy: 0, matchCount: 0, mismatchCount: 0 };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
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
              Ledger vs Wallet Reconciliation
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          </div>
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
              <p className="text-sm">No discrepancies found between ledger and wallet balances.</p>
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

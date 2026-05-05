import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, ShieldCheck, Wand2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';

interface DryRunResult {
  batch_id: string;
  dry_run: boolean;
  users_processed: number;
  total_deficit_cleared: number;
}

/**
 * Permanent fix for users whose strict wallet ledger is negative.
 * Posts a balanced (reseed cash_in / write-off cash_out) pair per user.
 * The cached wallet is NOT changed — only the ledger is brought to zero.
 */
export function NegativeWalletReconciliationPanel() {
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [lastRun, setLastRun] = useState<DryRunResult | null>(null);

  const runDryRun = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc('reconcile_negative_wallets', {
        p_dry_run: true,
        p_max_users: 100000,
      });
      if (error) throw error;
      setPreview(data as unknown as DryRunResult);
    } catch (e: any) {
      toast.error(e.message || 'Dry-run failed');
    } finally {
      setRunning(false);
    }
  };

  const execute = async () => {
    if (!preview) return;
    if (!confirm(
      `Reconcile ${preview.users_processed} users and clear ${formatUGX(preview.total_deficit_cleared)} of negative ledger balance? This is irreversible (audit-logged).`
    )) return;
    setExecuting(true);
    try {
      const { data, error } = await supabase.rpc('reconcile_negative_wallets', {
        p_dry_run: false,
        p_max_users: 100000,
      });
      if (error) throw error;
      setLastRun(data as unknown as DryRunResult);
      setPreview(null);
      toast.success('Negative wallets reconciled');
    } catch (e: any) {
      toast.error(e.message || 'Reconciliation failed');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Negative Wallet Reconciliation
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          One-shot ledger fix for users whose strict wallet ledger is negative
          (over-withdrawals against historical admin-correction credits).
          Posts a transparent reseed + platform write-off pair per user.
          The user's visible wallet balance is NOT changed.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={runDryRun} disabled={running} variant="outline" size="sm">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <AlertTriangle className="h-3.5 w-3.5 mr-2" />}
            Preview impact (dry-run)
          </Button>
          <Button onClick={execute} disabled={!preview || executing} size="sm">
            {executing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Wand2 className="h-3.5 w-3.5 mr-2" />}
            Execute reconciliation
          </Button>
        </div>

        {preview && (
          <div className="rounded-lg border bg-amber-500/5 border-amber-500/30 p-3 text-sm">
            <p className="font-medium text-amber-700 mb-1">Dry-run preview</p>
            <p>Users to reconcile: <span className="font-bold">{preview.users_processed.toLocaleString()}</span></p>
            <p>Total deficit to clear: <span className="font-bold">{formatUGX(preview.total_deficit_cleared)}</span></p>
            <p className="text-[11px] text-muted-foreground mt-1">No data has been changed yet.</p>
          </div>
        )}

        {lastRun && (
          <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/30 p-3 text-sm">
            <p className="font-medium text-emerald-700 mb-1 flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">Done</Badge>
              Reconciliation complete
            </p>
            <p>Users reconciled: <span className="font-bold">{lastRun.users_processed.toLocaleString()}</span></p>
            <p>Deficit cleared: <span className="font-bold">{formatUGX(lastRun.total_deficit_cleared)}</span></p>
            <p className="text-[11px] text-muted-foreground mt-1 break-all">Batch: {lastRun.batch_id}</p>
          </div>
        )}

        <div className="text-[11px] text-muted-foreground border-t pt-3">
          <p className="font-semibold mb-1">What this does</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Wallet leg: <code>historical_balance_reseed</code> (cash_in) for the deficit amount.</li>
            <li>Platform leg: <code>platform_loss_writeoff</code> (cash_out) for the same amount.</li>
            <li>Cached wallet buckets are not touched (skip_bucket_sync).</li>
            <li>Each reconciliation is logged to <code>wallet_negative_reconciliation_log</code>.</li>
            <li>A new ledger trigger now blocks any future write that would push a user negative.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default NegativeWalletReconciliationPanel;
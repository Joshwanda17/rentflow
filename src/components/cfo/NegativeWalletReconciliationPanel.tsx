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
  anchor_ts?: string;
  users_credited: number;
  total_credited: number;
  users_debited: number;
  total_debited: number;
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
      const { data, error } = await supabase.rpc('reseed_wallets_to_cached_balance', {
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
    const totalUsers = preview.users_credited + preview.users_debited;
    if (!confirm(
      `Anchor ${totalUsers} users' ledger to their cached balance at 00:00 EAT?\n\n` +
      `Credit ${preview.users_credited} users with ${formatUGX(preview.total_credited)}\n` +
      `Debit ${preview.users_debited} users by ${formatUGX(preview.total_debited)}\n\n` +
      `This is irreversible (audit-logged).`
    )) return;
    setExecuting(true);
    try {
      const { data, error } = await supabase.rpc('reseed_wallets_to_cached_balance', {
        p_dry_run: false,
        p_max_users: 100000,
      });
      if (error) throw error;
      setLastRun(data as unknown as DryRunResult);
      setPreview(null);
      toast.success('Wallets anchored to cached balance');
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
          Wallet Ledger Anchor (00:00 EAT)
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          One-shot anchor that posts a single ledger entry dated today 00:00 EAT
          so each user's strict ledger equals their currently displayed wallet
          balance. After this you can post manual retractions per the withdrawal
          history. The user's visible wallet balance is NOT changed.
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
            Anchor ledger now
          </Button>
        </div>

        {preview && (
          <div className="rounded-lg border bg-amber-500/5 border-amber-500/30 p-3 text-sm">
            <p className="font-medium text-amber-700 mb-1">Dry-run preview</p>
            <p>Anchor timestamp: <span className="font-mono text-xs">{preview.anchor_ts || 'today 00:00 EAT'}</span></p>
            <p>Credit ledger up: <span className="font-bold">{preview.users_credited.toLocaleString()}</span> users · <span className="font-bold">{formatUGX(preview.total_credited)}</span></p>
            <p>Debit ledger down: <span className="font-bold">{preview.users_debited.toLocaleString()}</span> users · <span className="font-bold">{formatUGX(preview.total_debited)}</span></p>
            <p className="text-[11px] text-muted-foreground mt-1">No data has been changed yet.</p>
          </div>
        )}

        {lastRun && (
          <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/30 p-3 text-sm">
            <p className="font-medium text-emerald-700 mb-1 flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">Done</Badge>
              Anchor complete
            </p>
            <p>Credited: <span className="font-bold">{lastRun.users_credited.toLocaleString()}</span> · {formatUGX(lastRun.total_credited)}</p>
            <p>Debited: <span className="font-bold">{lastRun.users_debited.toLocaleString()}</span> · {formatUGX(lastRun.total_debited)}</p>
            <p className="text-[11px] text-muted-foreground mt-1 break-all">Batch: {lastRun.batch_id}</p>
          </div>
        )}

        <div className="text-[11px] text-muted-foreground border-t pt-3">
          <p className="font-semibold mb-1">What this does</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Cache &gt; ledger: posts <code>historical_balance_reseed</code> (cash_in) + <code>platform_loss_writeoff</code> (cash_out).</li>
            <li>Ledger &gt; cache: posts <code>wallet_deduction_general_adjustment</code> (cash_out) + <code>system_balance_correction</code> (cash_in).</li>
            <li>All entries dated <strong>today 00:00 Africa/Kampala</strong>.</li>
            <li>Cached wallet buckets are not touched (skip_bucket_sync).</li>
            <li>Each reconciliation is logged to <code>wallet_negative_reconciliation_log</code>.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default NegativeWalletReconciliationPanel;
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

type Report = {
  total_completed: number;
  with_proof: number;
  missing_proof: number;
  legacy_records: number;
  invalid_references: number;
  expired_url_legacy: number;
  storage_objects: number;
  orphaned_storage_files: number;
  missing_storage_objects: number;
  generated_at: string;
};

type Alert = {
  id: string;
  issue_type: string;
  severity: string;
  withdrawal_id: string | null;
  storage_path: string | null;
  created_at: string;
};

const sevTone = (s: string) =>
  s === 'critical' || s === 'high'
    ? 'bg-destructive/10 text-destructive border-destructive/30'
    : s === 'medium'
    ? 'bg-amber-500/10 text-amber-700 border-amber-500/30'
    : 'bg-muted text-muted-foreground border-border';

/**
 * Proof-of-payment integrity dashboard — read-only reconciliation between
 * storage objects, withdrawal records and the Receipt Archive. Never mutates
 * financial data.
 */
export function PayoutProofIntegrityPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [{ data, error: rpcErr }, { data: alertRows }] = await Promise.all([
        supabase.rpc('get_payout_proof_integrity_report' as any),
        supabase
          .from('payout_proof_integrity_alerts' as any)
          .select('id,issue_type,severity,withdrawal_id,storage_path,created_at')
          .eq('resolved', false)
          .order('created_at', { ascending: false })
          .limit(25),
      ]);
      if (rpcErr) throw rpcErr;
      setReport(data as unknown as Report);
      setAlerts((alertRows ?? []) as unknown as Alert[]);
    } catch (e: any) {
      setError(e?.message || 'Failed to load proof integrity report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tiles: Array<{ label: string; value: number; warn?: boolean }> = report
    ? [
        { label: 'Completed payouts', value: report.total_completed },
        { label: 'With proof', value: report.with_proof },
        { label: 'Missing proof', value: report.missing_proof, warn: report.missing_proof > 0 },
        { label: 'Legacy records', value: report.legacy_records },
        { label: 'Storage objects', value: report.storage_objects },
        { label: 'Orphaned files', value: report.orphaned_storage_files, warn: report.orphaned_storage_files > 0 },
        { label: 'Invalid references', value: report.invalid_references, warn: report.invalid_references > 0 },
        { label: 'Expired URLs (legacy)', value: report.expired_url_legacy },
        { label: 'Missing storage objects', value: report.missing_storage_objects, warn: report.missing_storage_objects > 0 },
      ]
    : [];

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Proof of Payment integrity
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Storage object → withdrawal request → receipt archive reconciliation.
              Read-only; no financial records are touched.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
        ) : !report ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {tiles.map((t) => (
                <div
                  key={t.label}
                  className={`rounded-lg border p-3 ${t.warn ? 'border-destructive/30 bg-destructive/5' : 'bg-muted/30'}`}
                >
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.label}</div>
                  <div className={`text-xl font-bold tabular-nums ${t.warn ? 'text-destructive' : ''}`}>
                    {t.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Generated {format(new Date(report.generated_at), 'MMM d, yyyy HH:mm')} · automated check runs daily.
            </p>

            {alerts.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  Open integrity alerts ({alerts.length})
                </div>
                <div className="max-h-64 overflow-y-auto divide-y rounded-lg border">
                  {alerts.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                      <Badge variant="outline" className={`text-[10px] ${sevTone(a.severity)}`}>{a.severity}</Badge>
                      <span className="font-medium">{a.issue_type.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-[10px] text-muted-foreground truncate">
                        {a.withdrawal_id?.slice(0, 8) || a.storage_path || ''}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
                        {format(new Date(a.created_at), 'MMM d')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default PayoutProofIntegrityPanel;
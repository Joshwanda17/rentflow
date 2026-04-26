import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatUGX } from '@/lib/rentCalculations';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Loader2,
  RefreshCw,
  Inbox,
  History,
  CheckCircle2,
  XCircle,
  User as UserIcon,
  Download,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useFinOpsAutoRefresh } from '@/hooks/useFinOpsAutoRefresh';
import { downloadCsv, csvTimestamp } from '@/lib/csvExport';
import { toast } from 'sonner';

/**
 * Compact audit trail of the most recent user-deposit verifications
 * (approved or rejected). Shown under the TID search so an operator can
 * confirm at a glance who acted on a deposit and when — and clearly
 * distinguish approved vs rejected outcomes via a status indicator.
 */
interface Row {
  id: string;
  amount: number;
  status: 'approved' | 'rejected';
  resolved_at: string | null;
  processed_by_id: string | null;
  processed_by_name: string | null;
  rejection_reason: string | null;
}

interface Props {
  source: 'user';
  limit?: number;
  /** When set, only show deposits resolved by this operator user_id. */
  verifierId?: string;
  /** Export-only — start of the verification window (ISO). Filters CSV rows
   *  by approved_at/rejected_at >= this timestamp. Live table is unaffected. */
  exportFromIso?: string;
  /** Export-only — end of the verification window (ISO), inclusive. */
  exportToIso?: string;
}

export function RecentlyVerifiedList({ limit = 10, verifierId, exportFromIso, exportToIso }: Props) {
  const autoRefresh = useFinOpsAutoRefresh();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      let q = supabase
        .from('deposit_requests')
        .select(
          'id, amount, status, approved_at, rejected_at, processed_by, rejection_reason',
        )
        .in('status', ['approved', 'rejected'])
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (verifierId) q = q.eq('processed_by', verifierId);
      const { data, error } = await q;
      if (error) throw error;

      const list = (data ?? []) as any[];
      const ids = Array.from(
        new Set(list.map((r) => r.processed_by).filter(Boolean)),
      );
      const nameMap = new Map<string, string | null>();
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids);
        for (const p of (profs ?? []) as any[]) nameMap.set(p.id, p.full_name);
      }

      setRows(
        list.map((r) => ({
          id: r.id,
          amount: Number(r.amount || 0),
          status: r.status === 'approved' ? 'approved' : 'rejected',
          resolved_at: r.status === 'approved' ? r.approved_at : r.rejected_at,
          processed_by_id: r.processed_by ?? null,
          processed_by_name: r.processed_by ? nameMap.get(r.processed_by) ?? null : null,
          rejection_reason: r.rejection_reason ?? null,
        })),
      );
    } catch {
      // Silent — this list is auxiliary; don't disrupt the verify flow.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [limit, verifierId]);

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [load, autoRefresh]);

  /**
   * On-demand audit export — pulls up to 1000 resolved user deposits with
   * the same audit fields shown in the table (verifier, timestamp,
   * rejection reason) so reconciliation teams have a complete record.
   */
  const handleExport = async () => {
    setExporting(true);
    try {
      let q = supabase
        .from('deposit_requests')
        .select(
          'id, amount, status, approved_at, rejected_at, processed_by, rejection_reason, user_id',
        )
        .in('status', ['approved', 'rejected'])
        .order('updated_at', { ascending: false })
        .limit(1000);
      // Apply the export-only date window. We filter on updated_at because
      // it always carries the resolution moment for both approved & rejected
      // rows (vs approved_at/rejected_at which split by outcome).
      if (exportFromIso) q = q.gte('updated_at', exportFromIso);
      if (exportToIso) q = q.lte('updated_at', exportToIso);
      const { data, error } = await q;
      if (error) throw error;
      const list = (data ?? []) as any[];

      if (list.length === 0) {
        toast.info('Nothing to export — no resolved deposits yet.');
        return;
      }

      const ids = Array.from(
        new Set([
          ...list.map((r) => r.processed_by).filter(Boolean),
          ...list.map((r) => r.user_id).filter(Boolean),
        ]),
      );
      const nameMap = new Map<string, string | null>();
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids);
        for (const p of (profs ?? []) as any[]) nameMap.set(p.id, p.full_name);
      }

      downloadCsv(
        `user-deposits-audit-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'Deposit ID',
          'Depositor ID',
          'Depositor name',
          'Amount (UGX)',
          'Outcome',
          'Verified by (ID)',
          'Verified by',
          'Verified at',
          'Rejection reason',
        ],
        list.map((r) => [
          r.id,
          r.user_id ?? '',
          nameMap.get(r.user_id) ?? '',
          Number(r.amount || 0),
          r.status === 'approved' ? 'Approved' : 'Rejected',
          r.processed_by ?? '',
          nameMap.get(r.processed_by) ?? '',
          csvTimestamp(r.status === 'approved' ? r.approved_at : r.rejected_at),
          r.rejection_reason ?? '',
        ]),
      );
      toast.success(`Exported ${list.length} deposit${list.length === 1 ? '' : 's'} to CSV.`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to export audit log');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            Recently verified
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
              className="h-7 gap-1 text-[11px]"
              title="Download verified & rejected deposits for audit reconciliation"
            >
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => load(false)}
              disabled={refreshing}
              className="h-7"
            >
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Audit trail — who approved or rejected each user deposit.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-6 flex flex-col items-center text-center text-muted-foreground">
            <Inbox className="h-6 w-6 mb-1.5 opacity-50" />
            <p className="text-xs">No deposits verified yet.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[40vh]">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground sticky top-0 z-10">
                <tr>
                  <th className="text-left font-medium px-2 py-2">Status</th>
                  <th className="text-right font-medium px-2 py-2">Amount</th>
                  <th className="text-left font-medium px-2 py-2">Verified by</th>
                  <th className="text-left font-medium px-2 py-2 whitespace-nowrap">Verified at</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const approved = r.status === 'approved';
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-2 py-2 align-top">
                        {approved ? (
                          <Badge className="text-[9px] h-4 px-1 gap-0.5 bg-success text-success-foreground hover:bg-success">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Approved
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[9px] h-4 px-1 gap-0.5">
                            <XCircle className="h-2.5 w-2.5" /> Rejected
                          </Badge>
                        )}
                        {!approved && r.rejection_reason && (
                          <div
                            className="mt-1 text-[10px] text-muted-foreground italic line-clamp-2 max-w-[160px]"
                            title={r.rejection_reason}
                          >
                            {r.rejection_reason}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top text-right font-mono font-semibold tabular-nums">
                        {formatUGX(r.amount)}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {r.processed_by_name ? (
                          <div className="flex items-center gap-1">
                            <UserIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate max-w-[120px]">
                              {r.processed_by_name}
                            </span>
                          </div>
                        ) : r.processed_by_id ? (
                          <span className="text-muted-foreground font-mono">
                            {r.processed_by_id.slice(0, 8)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">System</span>
                        )}
                      </td>
                      <td
                        className="px-2 py-2 align-top text-muted-foreground tabular-nums whitespace-nowrap"
                      >
                        {r.resolved_at ? (
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                                  {formatDistanceToNow(new Date(r.resolved_at), { addSuffix: true })}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent variant="dark" className="text-xs">
                                <div className="flex items-center gap-1.5 font-semibold">
                                  {approved ? (
                                    <>
                                      <CheckCircle2 className="h-3 w-3 text-success" />
                                      Approved
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="h-3 w-3 text-destructive" />
                                      Rejected
                                    </>
                                  )}
                                </div>
                                <div className="mt-0.5 tabular-nums opacity-90">
                                  {format(new Date(r.resolved_at), 'PPpp')}
                                </div>
                                {r.processed_by_name && (
                                  <div className="mt-0.5 opacity-75">
                                    by {r.processed_by_name}
                                  </div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
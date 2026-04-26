import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { format, formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2,
  XCircle,
  History,
  Loader2,
  RefreshCw,
  User as UserIcon,
} from 'lucide-react';
import { useFinOpsAutoRefresh } from '@/hooks/useFinOpsAutoRefresh';

/**
 * Compact list of the most recently verified or rejected deposits.
 *
 * Surfaces three audit columns in plain language:
 *  - amount + outcome
 *  - "Verified by" — the operator who acted
 *  - "Verified at" — when (relative + absolute on hover)
 *
 * Two source tables are supported via `source`:
 *   user  → public.deposit_requests
 *   field → public.field_deposit_batches
 *
 * We keep this read-only and intentionally small so it can sit under each
 * pending queue without competing for attention.
 */

interface ResolvedRow {
  id: string;
  amount: number;
  outcome: 'approved' | 'rejected';
  resolved_at: string;
  resolved_by_id: string | null;
  resolved_by_name: string | null;
  subject: string; // depositor / agent name for context
  rejection_reason: string | null;
}

interface Props {
  source: 'user' | 'field';
  /** How many rows to fetch. Default 8 — enough to glance, not enough to overwhelm. */
  limit?: number;
}

export function RecentlyVerifiedList({ source, limit = 8 }: Props) {
  const autoRefresh = useFinOpsAutoRefresh();
  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      let resolved: ResolvedRow[] = [];

      if (source === 'user') {
        // Pull the most recently approved OR rejected deposits.
        const { data, error } = await supabase
          .from('deposit_requests')
          .select('id, amount, status, approved_at, rejected_at, processed_by, rejection_reason, user_id')
          .in('status', ['approved', 'rejected'])
          .not('processed_by', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(limit);
        if (error) throw error;

        const list = (data ?? []) as any[];
        const userIds = Array.from(
          new Set(
            [
              ...list.map((r) => r.processed_by).filter(Boolean),
              ...list.map((r) => r.user_id).filter(Boolean),
            ],
          ),
        );
        const profileMap = new Map<string, { full_name: string | null }>();
        if (userIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);
          for (const p of (profs ?? []) as any[]) profileMap.set(p.id, p);
        }

        resolved = list.map((r) => {
          const outcome: 'approved' | 'rejected' = r.status === 'approved' ? 'approved' : 'rejected';
          const ts = outcome === 'approved' ? r.approved_at : r.rejected_at;
          return {
            id: r.id,
            amount: Number(r.amount ?? 0),
            outcome,
            resolved_at: ts ?? new Date().toISOString(),
            resolved_by_id: r.processed_by ?? null,
            resolved_by_name: profileMap.get(r.processed_by)?.full_name ?? null,
            subject: profileMap.get(r.user_id)?.full_name ?? 'Unknown depositor',
            rejection_reason: r.rejection_reason ?? null,
          };
        });
      } else {
        const { data, error } = await supabase
          .from('field_deposit_batches')
          .select('id, declared_total, status, finops_verified_at, finops_verified_by, rejection_reason, agent_id')
          .in('status', ['verified', 'rejected'])
          .not('finops_verified_by', 'is', null)
          .order('finops_verified_at', { ascending: false })
          .limit(limit);
        if (error) throw error;

        const list = (data ?? []) as any[];
        const userIds = Array.from(
          new Set(
            [
              ...list.map((r) => r.finops_verified_by).filter(Boolean),
              ...list.map((r) => r.agent_id).filter(Boolean),
            ],
          ),
        );
        const profileMap = new Map<string, { full_name: string | null }>();
        if (userIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);
          for (const p of (profs ?? []) as any[]) profileMap.set(p.id, p);
        }

        resolved = list.map((r) => ({
          id: r.id,
          amount: Number(r.declared_total ?? 0),
          outcome: r.status === 'verified' ? 'approved' : 'rejected',
          resolved_at: r.finops_verified_at ?? new Date().toISOString(),
          resolved_by_id: r.finops_verified_by ?? null,
          resolved_by_name: profileMap.get(r.finops_verified_by)?.full_name ?? null,
          subject: profileMap.get(r.agent_id)?.full_name ?? 'Unknown agent',
          rejection_reason: r.rejection_reason ?? null,
        }));
      }

      setRows(resolved);
    } catch {
      // Silent failure — this is a secondary, non-critical surface.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [source, limit]);

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [load, autoRefresh]);

  return (
    <div className="rounded-lg border bg-background">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          Recently verified
          <span className="text-[10px] font-normal text-muted-foreground">
            (last {limit})
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => load(false)}
          disabled={refreshing}
          aria-label="Refresh"
        >
          {refreshing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </Button>
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-6">
          Nothing verified yet — approved and rejected deposits will appear here with the operator's name and timestamp.
        </p>
      ) : (
        <ScrollArea className="max-h-[40vh]">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-1.5">Deposit</th>
                <th className="text-left font-medium px-3 py-1.5">Verified by</th>
                <th className="text-left font-medium px-3 py-1.5">Verified at</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-1.5 align-top">
                    <div className="flex items-center gap-1.5">
                      {r.outcome === 'approved' ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 text-destructive shrink-0" />
                      )}
                      <span className="font-mono font-semibold tabular-nums">
                        {formatUGX(r.amount)}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] h-4 px-1 ${
                          r.outcome === 'approved'
                            ? 'border-emerald-300 text-emerald-700'
                            : 'border-destructive/40 text-destructive'
                        }`}
                      >
                        {r.outcome === 'approved' ? 'Approved' : 'Rejected'}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[200px]">
                      {r.subject}
                    </div>
                    {r.outcome === 'rejected' && r.rejection_reason && (
                      <div
                        className="text-[10px] text-destructive/80 mt-0.5 truncate max-w-[260px]"
                        title={r.rejection_reason}
                      >
                        “{r.rejection_reason}”
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 align-top">
                    <div className="flex items-center gap-1">
                      <UserIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate max-w-[140px]">
                        {r.resolved_by_name ?? 'Unknown operator'}
                      </span>
                    </div>
                  </td>
                  <td
                    className="px-3 py-1.5 align-top text-muted-foreground tabular-nums"
                    title={format(new Date(r.resolved_at), 'PPpp')}
                  >
                    {formatDistanceToNow(new Date(r.resolved_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  );
}

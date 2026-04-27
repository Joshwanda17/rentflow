import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, ArrowDownToLine, Plus, ChevronRight } from 'lucide-react';

/**
 * One row in the pending strip. We normalise deposits and withdrawals
 * into a single shape so the UI doesn't branch per kind. `status` keeps
 * the raw DB value for tooltips, while `stage` is the user-facing label.
 */
interface PendingMove {
  id: string;
  kind: 'deposit' | 'withdrawal';
  amount: number;
  status: string;
  stage: string;
  created_at: string;
}

/** Map a raw DB status to a short user-facing stage label. */
function stageLabel(kind: 'deposit' | 'withdrawal', status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'pending') return kind === 'deposit' ? 'Verifying' : 'Submitted';
  if (s === 'reviewed' || s === 'under_review') return 'In review';
  if (s === 'approved') return 'Approved · awaiting payout';
  if (s === 'processing') return 'Processing';
  if (s === 'rejected') return 'Rejected';
  return status || 'Pending';
}

/**
 * Live-updating strip showing the user's open deposits/withdrawals on the
 * wallet widget. Subscribes to both `deposit_requests` and
 * `withdrawal_requests` filtered by user_id so new submissions appear and
 * resolved ones disappear without a manual refresh.
 *
 * Hidden when there is nothing pending — keeps the wallet clean for the
 * 95% case where users have no in-flight money movements.
 */
export function PendingMovesStrip() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [moves, setMoves] = useState<PendingMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Statuses we still consider "in-flight" — anything else (success,
  // disbursed, fully_paid, cancelled) drops off the strip automatically.
  const OPEN_STATUSES = useMemo(
    () => ['pending', 'reviewed', 'under_review', 'approved', 'processing'],
    [],
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const [depRes, wdRes] = await Promise.all([
        supabase
          .from('deposit_requests')
          .select('id, amount, status, created_at')
          .eq('user_id', user.id)
          .in('status', OPEN_STATUSES)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('withdrawal_requests')
          .select('id, amount, status, created_at')
          .eq('user_id', user.id)
          .in('status', OPEN_STATUSES)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      if (cancelled) return;
      const merged: PendingMove[] = [
        ...(depRes.data ?? []).map((d: any) => ({
          id: `d-${d.id}`,
          kind: 'deposit' as const,
          amount: Number(d.amount ?? 0),
          status: d.status,
          stage: stageLabel('deposit', d.status),
          created_at: d.created_at,
        })),
        ...(wdRes.data ?? []).map((w: any) => ({
          id: `w-${w.id}`,
          kind: 'withdrawal' as const,
          amount: Number(w.amount ?? 0),
          status: w.status,
          stage: stageLabel('withdrawal', w.status),
          created_at: w.created_at,
        })),
      ].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setMoves(merged);
      setLoading(false);
    };

    load();

    // Realtime: any insert/update/delete on either pending table for this
    // user triggers a fresh load. Cheaper to refetch the small window than
    // to merge payloads in-place and risk drift.
    const channel = supabase
      .channel(`wallet-pending-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deposit_requests',
          filter: `user_id=eq.${user.id}`,
        },
        () => load(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawal_requests',
          filter: `user_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, OPEN_STATUSES]);

  if (loading || moves.length === 0) return null;

  const headline = moves[0];
  const remaining = moves.length - 1;

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 overflow-hidden">
      <button
        type="button"
        onClick={() => (moves.length > 1 ? setExpanded((v) => !v) : navigate('/transactions'))}
        className="w-full flex items-center gap-2.5 p-2.5 text-left hover:bg-warning/10 transition-colors"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-warning" />
        </span>
        <div className="p-1.5 rounded-lg bg-background border border-warning/30 shrink-0">
          {headline.kind === 'deposit' ? (
            <Plus className="h-3.5 w-3.5 text-success" />
          ) : (
            <ArrowDownToLine className="h-3.5 w-3.5 text-warning" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground truncate">
            {headline.kind === 'deposit' ? 'Deposit' : 'Withdrawal'} ·{' '}
            {headline.amount >= 1000
              ? `${(headline.amount / 1000).toFixed(0)}K`
              : headline.amount}{' '}
            UGX
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {headline.stage}
            {remaining > 0 && ` · +${remaining} more pending`}
          </p>
        </div>
        {moves.length > 1 ? (
          <ChevronRight
            className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        ) : (
          <Loader2 className="h-3.5 w-3.5 text-warning animate-spin" />
        )}
      </button>

      {expanded && moves.length > 1 && (
        <ul className="border-t border-warning/30 divide-y divide-warning/20">
          {moves.slice(1, 6).map((m) => (
            <li key={m.id} className="flex items-center gap-2 px-2.5 py-1.5">
              <div className="p-1 rounded bg-background border border-border/60 shrink-0">
                {m.kind === 'deposit' ? (
                  <Plus className="h-3 w-3 text-success" />
                ) : (
                  <ArrowDownToLine className="h-3 w-3 text-warning" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium truncate">
                  {m.kind === 'deposit' ? 'Deposit' : 'Withdrawal'} ·{' '}
                  {m.amount >= 1000 ? `${(m.amount / 1000).toFixed(0)}K` : m.amount} UGX
                </p>
                <p className="text-[9px] text-muted-foreground truncate">{m.stage}</p>
              </div>
            </li>
          ))}
          {moves.length > 6 && (
            <li className="px-2.5 py-1.5 text-center">
              <button
                type="button"
                onClick={() => navigate('/transactions')}
                className="text-[10px] font-semibold text-primary hover:underline"
              >
                View all {moves.length} pending →
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
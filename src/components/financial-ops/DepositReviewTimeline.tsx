import { useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  CheckCircle2,
  XCircle,
  Pencil,
  Send,
  Flag,
  Clock,
  Receipt,
  Copy,
  CheckCheck,
  Users,
  RotateCcw,
  Ban,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Mini review timeline for a single deposit_request row — designed for
 * the operational-float detail surface in Financial Ops, but works for
 * any deposit. We derive every event from the row itself plus its
 * `purpose_audit` JSON breadcrumb (no extra log table is involved), so:
 *
 *   - 'Submitted'        ← created_at, by the depositing user (the agent)
 *   - 'Edited by agent'  ← purpose_audit.last_edited_at  (if present)
 *   - 'Approved'         ← approved_at + processed_by
 *   - 'Changes requested'/'Rejected' ← rejected_at + rejection_reason + processed_by
 *   - 'Flagged for audit'← audit_flagged
 *
 * The whole strip is anchored to the TID/receipt header so a reviewer
 * scanning the sheet immediately sees "this is the chain of events for
 * THIS reference number".
 */

interface DepositLike {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  processed_by?: string | null;
  user_id?: string | null;
  transaction_id?: string | null;
  audit_flagged?: boolean | null;
  purpose_audit?: Record<string, any> | null;
  status?: string | null;
  amount?: number | null;
  /** Optional — for cash deposits with a printed receipt instead of a TID. */
  receipt_number?: string | null;
}

type EventKind =
  | 'submitted'
  | 'edited'
  | 'approved'
  | 'rejected'
  | 'flagged'
  | 'breakdown_created'
  | 'breakdown_edited'
  | 'reopened'
  | 'voided';

interface TimelineEvent {
  kind: EventKind;
  at: string;
  actorId?: string | null;
  detail?: string | null;
  linkedVoidedId?: string | null;
  linkedVoidedTid?: string | null;
  linkedVoidedSource?: string | null;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  phone: string | null;
}

const KIND_META: Record<
  EventKind,
  { icon: React.ComponentType<{ className?: string }>; label: string; tone: string; ring: string }
> = {
  submitted: {
    icon: Send,
    label: 'Submitted',
    tone: 'text-primary',
    ring: 'bg-primary/10 ring-primary/30',
  },
  edited: {
    icon: Pencil,
    label: 'Edited by agent',
    tone: 'text-muted-foreground',
    ring: 'bg-muted ring-border',
  },
  approved: {
    icon: CheckCircle2,
    label: 'Approved by Financial Ops',
    tone: 'text-emerald-600',
    ring: 'bg-emerald-500/10 ring-emerald-500/30',
  },
  rejected: {
    icon: XCircle,
    label: 'Changes requested / rejected',
    tone: 'text-destructive',
    ring: 'bg-destructive/10 ring-destructive/30',
  },
  flagged: {
    icon: Flag,
    label: 'Flagged for audit',
    tone: 'text-warning',
    ring: 'bg-warning/10 ring-warning/30',
  },
  breakdown_created: {
    icon: Users,
    label: 'Breakdown captured',
    tone: 'text-primary',
    ring: 'bg-primary/10 ring-primary/30',
  },
  breakdown_edited: {
    icon: Users,
    label: 'Breakdown edited',
    tone: 'text-warning',
    ring: 'bg-warning/10 ring-warning/30',
  },
  reopened: {
    icon: RotateCcw,
    label: 'Request reopened',
    tone: 'text-primary',
    ring: 'bg-primary/10 ring-primary/30',
  },
  voided: {
    icon: Ban,
    label: 'Orphan duplicate voided',
    tone: 'text-destructive',
    ring: 'bg-destructive/10 ring-destructive/30',
  },
};

function buildEvents(row: DepositLike): TimelineEvent[] {
  const out: TimelineEvent[] = [];

  if (row.created_at) {
    out.push({ kind: 'submitted', at: row.created_at, actorId: row.user_id ?? null });
  }

  // last_edited_at is stamped by the agent's "Edit allocations" flow.
  const editedAt = row.purpose_audit?.last_edited_at;
  if (editedAt) {
    out.push({ kind: 'edited', at: String(editedAt), actorId: row.user_id ?? null });
  }

  if (row.approved_at) {
    out.push({ kind: 'approved', at: row.approved_at, actorId: row.processed_by ?? null });
  }

  if (row.rejected_at) {
    out.push({
      kind: 'rejected',
      at: row.rejected_at,
      actorId: row.processed_by ?? null,
      detail: row.rejection_reason || null,
    });
  }

  if (row.audit_flagged) {
    // No dedicated timestamp for flagging — anchor it to updated_at if
    // we have nothing better, so it still slots into the chronology.
    out.push({
      kind: 'flagged',
      at: row.updated_at || row.created_at || new Date().toISOString(),
      actorId: row.processed_by ?? null,
    });
  }

  return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

interface Props {
  request: DepositLike | null | undefined;
}

export function DepositReviewTimeline({ request }: Props) {
  const [actors, setActors] = useState<Map<string, ProfileLite>>(new Map());
  const [copied, setCopied] = useState(false);
  const [auditEvents, setAuditEvents] = useState<TimelineEvent[]>([]);
  const [adminEvents, setAdminEvents] = useState<TimelineEvent[]>([]);

  const baseEvents = request ? buildEvents(request) : [];
  const events = [...baseEvents, ...auditEvents, ...adminEvents].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  const reference =
    (request?.transaction_id || request?.receipt_number || '').toString().trim();

  // Pull the durable breakdown audit trail for this deposit. Every edit
  // to the per-tenant allocations is captured server-side via the
  // operational_float_audit_log trigger, so reviewers can trace changes
  // by transaction_id without trusting the client.
  useEffect(() => {
    if (!request?.id) {
      setAuditEvents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('operational_float_audit_log')
        .select('action, changed_at, changed_by, changed_fields, previous_amount, new_amount')
        .eq('deposit_request_id', request.id)
        .order('changed_at', { ascending: true });
      if (cancelled) return;
      if (error || !data) {
        setAuditEvents([]);
        return;
      }
      const mapped: TimelineEvent[] = data.map((row: any) => {
        const fields: string[] = Array.isArray(row.changed_fields) ? row.changed_fields : [];
        const detailParts: string[] = [];
        if (fields.includes('amount') && row.previous_amount != null && row.new_amount != null) {
          detailParts.push(
            `Amount: UGX ${Number(row.previous_amount).toLocaleString()} → UGX ${Number(row.new_amount).toLocaleString()}`,
          );
        }
        if (fields.includes('allocations')) detailParts.push('Per-tenant breakdown updated');
        if (fields.includes('transaction_id')) detailParts.push('Reference / TID updated');
        return {
          kind: row.action === 'created' ? 'breakdown_created' : 'breakdown_edited',
          at: row.changed_at,
          actorId: row.changed_by ?? null,
          detail: detailParts.length ? detailParts.join(' · ') : null,
        };
      });
      // The 'created' audit row duplicates the 'submitted' card we
      // already render — drop it to keep the strip tight.
      setAuditEvents(mapped.filter((e) => e.kind !== 'breakdown_created'));
    })();
    return () => {
      cancelled = true;
    };
  }, [request?.id]);

  // Pull admin/CFO reconciliation events from audit_logs for this
  // specific deposit_request. Covers the Option A flow where an
  // orphan Gmail-imported row was voided and the agent's real
  // submission was reopened — reviewers need to see WHY a previously
  // rejected request is back in their queue.
  useEffect(() => {
    if (!request?.id) {
      setAdminEvents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('action_type, created_at, user_id, metadata')
        .eq('table_name', 'deposit_requests')
        .eq('record_id', request.id)
        .in('action_type', ['deposit_request_reopened', 'deposit_request_voided'])
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error || !data) {
        setAdminEvents([]);
        return;
      }
      const mapped: TimelineEvent[] = data.map((row: any) => {
        const meta = (row.metadata || {}) as Record<string, any>;
        const detailParts: string[] = [];
        if (meta.reason) detailParts.push(String(meta.reason));
        if (meta.superseded_by) {
          detailParts.push(`Superseded by ${String(meta.superseded_by).slice(0, 8)}…`);
        }
        if (meta.tid) detailParts.push(`TID ${meta.tid}`);
        return {
          kind: row.action_type === 'deposit_request_reopened' ? 'reopened' : 'voided',
          at: row.created_at,
          actorId: row.user_id ?? null,
          detail: detailParts.length ? detailParts.join(' · ') : null,
          linkedVoidedId: meta.voided_duplicate_id ?? null,
          linkedVoidedTid: meta.voided_duplicate_tid ?? null,
          linkedVoidedSource: meta.voided_duplicate_source ?? null,
        };
      });
      setAdminEvents(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, [request?.id]);

  // Resolve actor names in a single round trip — covers both the
  // submitting user and any reviewer recorded in processed_by.
  useEffect(() => {
    const ids = new Set<string>();
    for (const e of events) if (e.actorId) ids.add(e.actorId);
    if (ids.size === 0) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', Array.from(ids));
      if (cancelled) return;
      if (error) {
        // Non-fatal — we'll just show shortened IDs.
        return;
      }
      const map = new Map<string, ProfileLite>();
      for (const p of data || []) map.set(p.id, p as ProfileLite);
      setActors(map);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id]);

  if (!request || events.length === 0) return null;

  const copyRef = () => {
    if (!reference) return;
    navigator.clipboard.writeText(reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success('Reference copied');
  };

  const actorLabel = (actorId?: string | null) => {
    if (!actorId) return 'system';
    const hit = actors.get(actorId);
    if (hit?.full_name) return hit.full_name;
    return `${actorId.slice(0, 8)}…`;
  };

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-primary" />
          Review timeline
        </p>
        {reference ? (
          <button
            type="button"
            onClick={copyRef}
            className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-mono hover:bg-muted transition-colors max-w-[60%]"
            aria-label="Copy reference"
          >
            <Receipt className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="truncate">{reference}</span>
            {copied ? (
              <CheckCheck className="h-3 w-3 text-emerald-600 shrink-0" />
            ) : (
              <Copy className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
          </button>
        ) : (
          <span className="text-[10px] italic text-muted-foreground">no reference</span>
        )}
      </div>

      <ol className="relative ml-1 space-y-3 border-l border-border pl-4">
        {events.map((e, i) => {
          const meta = KIND_META[e.kind];
          const Icon = meta.icon;
          return (
            <li key={`${e.kind}-${i}-${e.at}`} className="relative">
              <span
                className={`absolute -left-[22px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ${meta.ring}`}
              >
                <Icon className={`h-2.5 w-2.5 ${meta.tone}`} />
              </span>
              <div className="space-y-0.5">
                <p className={`text-xs font-semibold ${meta.tone}`}>{meta.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  by {actorLabel(e.actorId)} · {format(new Date(e.at), 'MMM d, HH:mm')} ·{' '}
                  {formatDistanceToNow(new Date(e.at), { addSuffix: true })}
                </p>
                {e.detail && (
                  <p className="text-[11px] mt-0.5 rounded-md bg-muted/40 border border-border px-2 py-1 text-muted-foreground">
                    "{e.detail}"
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default DepositReviewTimeline;
import { useState } from 'react';
import {
  useAgentInactivations,
  useInactivationReview,
  type AgentInactivationRow,
} from '@/hooks/useAgentInactivations';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Phone,
  MapPin,
  UserX,
  Check,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  opsUserId: string | null;
  onOpenBehavior?: (tenantId: string) => void;
}

/**
 * Prominent Tenant Ops alert: tenants an agent recently flagged as "not paying".
 * Realtime — appears the moment an agent marks a tenant inactive.
 */
export function AgentInactiveAlertBanner({ opsUserId, onOpenBehavior }: Props) {
  const { data } = useAgentInactivations(opsUserId);
  const [expanded, setExpanded] = useState(true);

  const rows = data ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 overflow-hidden animate-fade-in">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-destructive/10 transition-colors"
      >
        <div className="p-2 rounded-lg bg-destructive/15 shrink-0">
          <UserX className="h-5 w-5 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-destructive flex items-center gap-2">
            {rows.length} tenant{rows.length > 1 ? 's' : ''} flagged inactive by agents
            <Badge variant="destructive" className="h-5">Action needed</Badge>
          </p>
          <p className="text-xs text-muted-foreground">Agents marked these tenants as not paying. Review and follow up.</p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <ul className="divide-y divide-destructive/15 border-t border-destructive/20">
          {rows.map((row) => (
            <InactivationRow key={row.rent_request_id} row={row} onOpenBehavior={onOpenBehavior} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InactivationRow({
  row,
  onOpenBehavior,
}: {
  row: AgentInactivationRow;
  onOpenBehavior?: (tenantId: string) => void;
}) {
  const { toast } = useToast();
  const { acknowledge, resolve } = useInactivationReview();
  const [resolving, setResolving] = useState(false);
  const [notes, setNotes] = useState('');
  const isAcknowledged = row.review_status === 'acknowledged';
  const busy = acknowledge.isPending || resolve.isPending;

  const handleAcknowledge = async () => {
    try {
      await acknowledge.mutateAsync({ rentRequestId: row.rent_request_id });
      toast({ title: 'Marked as reviewed' });
    } catch (e: any) {
      toast({ title: 'Could not acknowledge', description: e?.message, variant: 'destructive' });
    }
  };

  const handleResolve = async () => {
    if (notes.trim().length < 10) {
      toast({ title: 'Add resolution notes', description: 'At least 10 characters required.', variant: 'destructive' });
      return;
    }
    try {
      await resolve.mutateAsync({ rentRequestId: row.rent_request_id, notes });
      toast({ title: 'Marked as resolved' });
    } catch (e: any) {
      toast({ title: 'Could not resolve', description: e?.message, variant: 'destructive' });
    }
  };

  return (
    <li className="p-3.5 flex flex-col gap-2 bg-card/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate flex items-center gap-2">
            {row.tenant_name ?? 'Unknown tenant'}
            {isAcknowledged && (
              <Badge variant="secondary" className="h-5 gap-1">
                <Check className="h-3 w-3" /> Reviewed
              </Badge>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
            {row.tenant_phone && (
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{row.tenant_phone}</span>
            )}
            {row.tenant_city && (
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{row.tenant_city}</span>
            )}
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(row.marked_at)}</span>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/15 p-2">
        <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
        <p className="text-xs text-foreground/80">
          <span className="text-muted-foreground">By {row.agent_name ?? 'agent'}:</span>{' '}
          {row.reason ?? 'No reason provided'}
        </p>
      </div>

      {isAcknowledged && (row.review_notes || row.reviewer_name) && (
        <p className="text-[11px] text-muted-foreground">
          {row.reviewer_name && <span>Reviewed by {row.reviewer_name}</span>}
          {row.acknowledged_at && <span> · {timeAgo(row.acknowledged_at)}</span>}
          {row.review_notes && <span className="block text-foreground/70 mt-0.5">“{row.review_notes}”</span>}
        </p>
      )}

      {resolving ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was done to resolve this? (required, min 10 characters)"
            rows={2}
            className="text-xs resize-none"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-8" onClick={handleResolve} disabled={busy}>
              {resolve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirm resolved
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setResolving(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {onOpenBehavior && (
            <Button variant="outline" size="sm" className="h-8" onClick={() => onOpenBehavior(row.tenant_id)}>
              Open tenant
            </Button>
          )}
          {!isAcknowledged && (
            <Button variant="secondary" size="sm" className="h-8 gap-1" onClick={handleAcknowledge} disabled={busy}>
              {acknowledge.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Acknowledge
            </Button>
          )}
          <Button size="sm" className="h-8 gap-1" onClick={() => setResolving(true)} disabled={busy}>
            <CheckCircle2 className="h-4 w-4" /> Resolve
          </Button>
        </div>
      )}
    </li>
  );
}

export default AgentInactiveAlertBanner;
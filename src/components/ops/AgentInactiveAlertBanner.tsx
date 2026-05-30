import { useState } from 'react';
import { useAgentInactivations, type AgentInactivationRow } from '@/hooks/useAgentInactivations';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ChevronDown, ChevronUp, Phone, MapPin, UserX } from 'lucide-react';

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
  return (
    <li className="p-3.5 flex flex-col gap-2 bg-card/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{row.tenant_name ?? 'Unknown tenant'}</p>
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

      {onOpenBehavior && (
        <Button
          variant="outline"
          size="sm"
          className="self-start h-8"
          onClick={() => onOpenBehavior(row.tenant_id)}
        >
          Open tenant
        </Button>
      )}
    </li>
  );
}

export default AgentInactiveAlertBanner;
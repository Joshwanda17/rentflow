import { CheckCircle2, Clock, AlertTriangle, Circle, Briefcase, Banknote } from 'lucide-react';
import { formatUGX } from '@/lib/businessAdvanceCalculations';
import { format } from 'date-fns';

export type AdvanceStatusRow = {
  id: string;
  status: string;
  business_name: string | null;
  principal: number | string;
  outstanding_balance?: number | string | null;
  reason?: string | null;
  agent_name?: string | null;
  created_at: string;
  agent_ops_reviewed_at?: string | null;
  tenant_ops_reviewed_at?: string | null;
  landlord_ops_reviewed_at?: string | null;
  coo_approved_at?: string | null;
  cfo_disbursed_at?: string | null;
  disbursed_at?: string | null;
  completed_at?: string | null;
  rejection_reason?: string | null;
};

const STAGES: { key: string; label: string; tsField: keyof AdvanceStatusRow }[] = [
  { key: 'submitted', label: 'Request submitted by your agent', tsField: 'created_at' },
  { key: 'agent_ops', label: 'Agent Ops review', tsField: 'agent_ops_reviewed_at' },
  { key: 'tenant_ops', label: 'Tenant Ops verification', tsField: 'tenant_ops_reviewed_at' },
  { key: 'landlord_ops', label: 'Landlord verification', tsField: 'landlord_ops_reviewed_at' },
  { key: 'coo', label: 'COO approval', tsField: 'coo_approved_at' },
  { key: 'disbursed', label: 'Funds disbursed to wallet', tsField: 'disbursed_at' },
];

export function BusinessAdvanceStatusTracker({ row, compact = false }: { row: AdvanceStatusRow; compact?: boolean }) {
  const rejected = row.status === 'rejected' || row.status === 'defaulted';

  let firstPendingMarked = false;
  const states = STAGES.map((s) => {
    if (rejected) return s.tsField === 'created_at' ? 'done' : 'blocked';
    if (row[s.tsField]) return 'done' as const;
    if (!firstPendingMarked) { firstPendingMarked = true; return 'current' as const; }
    return 'pending' as const;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary shrink-0" />
            <p className="font-bold text-sm truncate">{row.business_name || 'Business Advance'}</p>
          </div>
          {row.agent_name && (
            <p className="text-[11px] text-muted-foreground mt-0.5">Requested by agent: {row.agent_name}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Amount</p>
          <p className="font-bold text-sm">{formatUGX(Number(row.principal) || 0)}</p>
        </div>
      </div>

      {rejected && row.rejection_reason && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 flex gap-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{row.rejection_reason}</span>
        </div>
      )}

      <ol className="space-y-2">
        {STAGES.map((stage, i) => {
          const st = states[i];
          const Icon =
            st === 'done' ? CheckCircle2 :
            st === 'current' ? Clock :
            st === 'blocked' ? AlertTriangle : Circle;
          const color =
            st === 'done' ? 'text-emerald-600' :
            st === 'current' ? 'text-amber-600 animate-pulse' :
            st === 'blocked' ? 'text-destructive' : 'text-muted-foreground/50';
          const lineColor = st === 'done' ? 'bg-emerald-500/60' : 'bg-muted';
          const ts = row[stage.tsField];
          return (
            <li key={stage.key} className="flex gap-3 items-start">
              <div className="flex flex-col items-center pt-0.5">
                <Icon className={`h-4 w-4 ${color}`} />
                {i < STAGES.length - 1 && <div className={`w-px flex-1 min-h-[14px] mt-1 ${lineColor}`} />}
              </div>
              <div className="flex-1 -mt-0.5 pb-1">
                <p className={`text-xs font-semibold ${
                  st === 'done' || st === 'current' ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {stage.label}
                  {st === 'current' && <span className="ml-1.5 text-[10px] font-bold uppercase text-amber-600">In progress</span>}
                </p>
                {ts && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {format(new Date(ts as string), 'MMM d, yyyy • HH:mm')}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {(row.status === 'active' || row.status === 'completed') && row.outstanding_balance != null && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs flex items-center gap-2">
          <Banknote className="h-4 w-4 text-emerald-700" />
          <span className="text-emerald-800">
            {row.status === 'completed'
              ? 'Fully repaid — well done!'
              : <>Outstanding balance: <strong>{formatUGX(Number(row.outstanding_balance) || 0)}</strong></>}
          </span>
        </div>
      )}

      {!compact && row.reason && (
        <p className="text-[11px] text-muted-foreground italic">"{row.reason}"</p>
      )}
    </div>
  );
}

export default BusinessAdvanceStatusTracker;

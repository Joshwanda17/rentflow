import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/agentAdvanceCalculations';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { CheckCircle2, XCircle, Loader2, User, Inbox, Clock, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

const num = (v: any) => Number(v ?? 0);

const APPROVED_STATUSES = [
  'agent_ops_approved', 'cfo_approved', 'cfo_paid',
  'disbursed', 'active', 'repaying', 'completed', 'overdue',
];

const STATUS_LABEL: Record<string, string> = {
  agent_ops_approved: 'Agent Ops approved · awaiting CFO',
  cfo_approved: 'CFO approved · ready to disburse',
  cfo_paid: 'Disbursed',
  disbursed: 'Disbursed',
  active: 'Active',
  repaying: 'Repaying',
  completed: 'Completed',
  overdue: 'Overdue',
};

// The approval route an advance travels before it is paid out. Agent Ops is the
// only operational desk; once it approves, the request goes straight to the CFO
// for final evaluation and disbursement.
const PIPELINE: { key: string; label: string }[] = [
  { key: 'pending', label: 'Submitted' },
  { key: 'agent_ops_approved', label: 'Agent Ops' },
  { key: 'cfo_approved', label: 'CFO' },
  { key: 'disbursed', label: 'Paid out' },
];

// Statuses that mean the money has already left the building.
const PAID_STATUSES = ['cfo_paid', 'disbursed', 'active', 'repaying', 'completed', 'overdue'];

/** Index of the current stage within PIPELINE (post-payout statuses collapse to the last step). */
function stageIndex(status: string): number {
  if (PAID_STATUSES.includes(status)) return PIPELINE.length - 1;
  const i = PIPELINE.findIndex((s) => s.key === status);
  return i < 0 ? 0 : i;
}

function isPaidOut(req: any): boolean {
  return Boolean(req.cfo_paid_at) || PAID_STATUSES.includes(req.status);
}

/** The most recent moment this request moved forward — used to age how long it has been holding. */
function lastActivityAt(req: any): Date {
  const candidates = [
    req.cfo_paid_at, req.cfo_approved_at,
    req.agent_ops_reviewed_at, req.updated_at, req.created_at,
  ].filter(Boolean).map((v: string) => new Date(v).getTime());
  return new Date(candidates.length ? Math.max(...candidates) : Date.now());
}

/** Best-effort human note for an approved request (latest stage note). */
function approvalNote(req: any): string | null {
  return req.cfo_notes || req.agent_ops_notes || null;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Inbox className="h-7 w-7 text-muted-foreground mb-2" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function RequestRow({ req, tone }: { req: any; tone: 'approved' | 'rejected' }) {
  const note = tone === 'rejected' ? (req.rejection_reason || 'No reason recorded') : approvalNote(req);
  const paid = tone === 'approved' && isPaidOut(req);
  const idx = stageIndex(req.status);
  const holdingFor = formatDistanceToNowStrict(lastActivityAt(req));
  const holdDays = (Date.now() - lastActivityAt(req).getTime()) / 86_400_000;
  const holdTone = paid
    ? 'text-muted-foreground'
    : holdDays >= 5 ? 'text-rose-600' : holdDays >= 2 ? 'text-amber-600' : 'text-emerald-600';
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{req.agent_full_name || 'Agent'}</p>
          <p className="text-[10px] text-muted-foreground">{format(new Date(req.created_at), 'MMM d, yyyy')}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-primary">{formatUGX(num(req.principal))}</p>
          <p className="text-[10px] text-muted-foreground">{req.cycle_days}d</p>
        </div>
      </div>
      {tone === 'approved' && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-emerald-100 text-emerald-700 border-0">
              {STATUS_LABEL[req.status] || req.status}
            </Badge>
            <Badge className={cn(
              'text-[9px] px-1.5 py-0 h-4 font-bold border-0 flex items-center gap-0.5',
              paid ? 'bg-emerald-600 text-white' : 'bg-amber-100 text-amber-700',
            )}>
              <Wallet className="h-2.5 w-2.5" />{paid ? 'Paid out' : 'Not paid out'}
            </Badge>
            <span className={cn('text-[9px] font-semibold flex items-center gap-0.5', holdTone)}>
              <Clock className="h-2.5 w-2.5" />{paid ? `Paid ${holdingFor} ago` : `Holding ${holdingFor}`}
            </span>
          </div>

          {/* Approval route — which desk it's on now */}
          <div className="mt-2 flex items-center gap-1">
            {PIPELINE.map((s, i) => (
              <div key={s.key} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                <div className={cn(
                  'h-1.5 w-full rounded-full',
                  i < idx ? 'bg-emerald-500' : i === idx ? (paid ? 'bg-emerald-600' : 'bg-amber-500') : 'bg-muted',
                )} />
                <span className={cn(
                  'text-[7px] leading-none text-center truncate w-full',
                  i === idx ? 'font-bold text-foreground' : 'text-muted-foreground',
                )}>{s.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[9px] text-muted-foreground">
            {paid
              ? 'Fully disbursed to the agent wallet.'
              : req.status === 'cfo_approved'
                ? 'CFO approved — awaiting disbursement to the agent wallet.'
                : 'Approved by Agent Ops — awaiting CFO evaluation & disbursement.'}
          </p>
        </>
      )}
      {note && (
        <div className={
          'mt-2 rounded-lg p-2 text-[11px] leading-snug ' +
          (tone === 'rejected' ? 'bg-rose-50 text-rose-800' : 'bg-muted/50 text-muted-foreground')
        }>
          <span className="font-semibold">{tone === 'rejected' ? 'Reason: ' : 'Note: '}</span>{note}
        </div>
      )}
    </div>
  );
}

export function AdvanceRequestsReviewed() {
  const { data: approved = [], isLoading: loadingApproved } = useQuery({
    queryKey: ['advance-requests-reviewed', 'approved'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_advance_requests_privileged')
        .select('*')
        .in('status', APPROVED_STATUSES)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: rejected = [], isLoading: loadingRejected } = useQuery({
    queryKey: ['advance-requests-reviewed', 'rejected'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_advance_requests_privileged')
        .select('*')
        .eq('status', 'rejected')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Approved */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Approved
            </h3>
            <Badge variant="secondary" className="text-xs">{approved.length}</Badge>
          </div>
          {loadingApproved ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : approved.length === 0 ? (
            <EmptyState label="No approved requests yet" />
          ) : (
            <div className="space-y-2">
              {approved.map((req: any) => <RequestRow key={req.id} req={req} tone="approved" />)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rejected */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <XCircle className="h-4 w-4 text-rose-600" /> Rejected
            </h3>
            <Badge variant="secondary" className="text-xs">{rejected.length}</Badge>
          </div>
          {loadingRejected ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rejected.length === 0 ? (
            <EmptyState label="No rejected requests" />
          ) : (
            <div className="space-y-2">
              {rejected.map((req: any) => <RequestRow key={req.id} req={req} tone="rejected" />)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

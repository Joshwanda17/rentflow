import { useState } from 'react';
import { Store, Users, Home, Network, Lock, Info, RefreshCw, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { hapticTap } from '@/lib/haptics';
import { useServiceCenterQualification } from '@/hooks/useServiceCenterQualification';
import { ServiceCenterRequestDialog } from './ServiceCenterRequestDialog';

const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;

function Metric({
  icon: Icon,
  label,
  value,
  target,
  helper,
  met,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  target?: number;
  helper?: string;
  met?: boolean;
}) {
  const pct = target ? Math.min(100, (value / target) * 100) : 100;
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-1.5">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', met ? 'text-success' : 'text-primary')} />
        {label}
      </span>
      <div className="text-xl font-bold tabular-nums text-foreground leading-none">
        {value}
        {target != null && <span className="text-sm font-normal text-muted-foreground"> / {target}</span>}
      </div>
      {target != null && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', met ? 'bg-success' : 'bg-warning')}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {helper && <p className="text-[11px] leading-snug text-muted-foreground">{helper}</p>}
    </div>
  );
}

export function ServiceCenterQualificationCard({ agentId }: { agentId: string }) {
  const { data, isLoading, isError, refetch } = useServiceCenterQualification(agentId);
  const [infoOpen, setInfoOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-3 w-72" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          We could not load your service center qualification progress.
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  const status: string = data.request_status;
  const subsLeft = data.remaining_sub_agents;
  const tenantsLeft = data.remaining_personal_tenants;

  let message: string;
  if (status === 'pending_review') message = 'Your service center request is under review.';
  else if (status === 'approved') message = 'Your free Welile Service Center has been approved.';
  else if (status === 'rejected') message = 'Your request was not approved. Review the feedback and apply again when eligible.';
  else if (data.is_qualified) message = 'You have completed the service center qualification requirements.';
  else if (data.qualifying_sub_agents === 0 && data.main_agent_active_tenants === 0)
    message = 'Start building your active rent-collection network to qualify for a free service center.';
  else if (subsLeft > 0 && tenantsLeft > 0)
    message = `You need ${plural(subsLeft, 'more active sub-agent')} and ${plural(tenantsLeft, 'more personal tenant')} to qualify.`;
  else if (subsLeft === 0)
    message = `Your team requirement is complete. Add ${plural(tenantsLeft, 'more active tenant')} to qualify.`;
  else
    message = `Your personal tenant requirement is complete. Activate ${plural(subsLeft, 'more sub-agent')} to qualify.`;

  const badge =
    status === 'approved'
      ? { label: 'Approved', cls: 'bg-success/15 text-success', Icon: CheckCircle2 }
      : status === 'pending_review'
      ? { label: 'Under review', cls: 'bg-primary/15 text-primary', Icon: Clock }
      : status === 'rejected'
      ? { label: 'Not approved', cls: 'bg-destructive/15 text-destructive', Icon: XCircle }
      : data.is_qualified
      ? { label: 'Qualified', cls: 'bg-success/15 text-success', Icon: CheckCircle2 }
      : { label: 'Not yet qualified', cls: 'bg-warning/15 text-warning', Icon: Clock };

  const buttonLabel =
    status === 'pending_review' ? 'Request Under Review'
    : status === 'approved' ? 'Service Center Approved'
    : status === 'rejected' ? 'Review Request'
    : 'Request Free Service Center';

  const buttonDisabled =
    status === 'pending_review' || status === 'approved' || (status !== 'rejected' && !data.is_qualified);

  const onButton = () => {
    hapticTap();
    if (status === 'rejected') { setInfoOpen(true); return; }
    setRequestOpen(true);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
            <Store className="h-4 w-4 text-primary shrink-0" />
            Qualify for a Free Service Center
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Build an active rent-collection team and unlock your own Welile Service Center.
          </p>
        </div>
        <span className={cn('shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium', badge.cls)}>
          <badge.Icon className="h-3 w-3" /> {badge.label}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Metric
          icon={Users}
          label="Active sub-agents"
          value={data.qualifying_sub_agents}
          target={data.required_sub_agents}
          met={data.sub_agent_requirement_met}
          helper="An active sub-agent manages at least one tenant with an active rent collection or repayment arrangement."
        />
        <Metric
          icon={Home}
          label="Your active tenants"
          value={data.main_agent_active_tenants}
          target={data.required_main_agent_tenants}
          met={data.personal_tenant_requirement_met}
        />
        <Metric
          icon={Network}
          label="Network active tenants"
          value={data.network_active_tenants}
          helper="Informational only."
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Qualification progress</span>
          <span className="font-semibold tabular-nums text-foreground">{data.qualification_progress}% complete</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', data.is_qualified ? 'bg-success' : 'bg-primary')}
            style={{ width: `${data.qualification_progress}%` }}
          />
        </div>
      </div>

      <p className="text-[13px] leading-snug text-foreground">{message}</p>
      {status === 'rejected' && data.decision_reason && (
        <p className="text-xs text-destructive">Feedback: {data.decision_reason}</p>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Button className="w-full sm:w-auto sm:ml-auto sm:order-2" disabled={buttonDisabled} onClick={onButton}>
          {buttonDisabled && status !== 'approved' && status !== 'pending_review' && <Lock className="h-3.5 w-3.5 mr-1.5" />}
          {buttonLabel}
        </Button>
        <button
          type="button"
          className="sm:order-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => { hapticTap(); setInfoOpen(true); }}
        >
          <Info className="h-3.5 w-3.5" /> How qualification works
        </button>
      </div>
      {buttonDisabled && !data.is_qualified && status !== 'rejected' && (
        <p className="text-[11px] text-muted-foreground">Complete all qualification requirements to unlock this request.</p>
      )}

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>How qualification works</DialogTitle></DialogHeader>
          <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-4">
            <li>An active sub-agent must manage at least one active tenant.</li>
            <li>You must personally manage at least {data.required_main_agent_tenants} active tenants.</li>
            <li>All activity must be valid and verified.</li>
            <li>Qualification allows you to submit a request but does not guarantee immediate approval.</li>
          </ul>
          {status === 'rejected' && data.decision_reason && (
            <p className="text-sm text-destructive">Review feedback: {data.decision_reason}</p>
          )}
        </DialogContent>
      </Dialog>

      <ServiceCenterRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        agentId={agentId}
        qualification={data}
        onSubmitted={() => refetch()}
      />
    </div>
  );
}

export default ServiceCenterQualificationCard;
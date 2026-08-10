import { useState } from 'react';
import { CheckCircle2, ClipboardCheck, Eye, Loader2, MapPin, Phone, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import { HouseDetailsDialog } from '@/components/agent/service-center/HouseDetailsDialog';
import {
  ServiceCenterQueueRequest,
  useServiceCenterRentQueue,
  useServiceCenterReviewRentRequest,
} from '@/hooks/useServiceCenterRentQueue';

/**
 * Service Center vetting queue — the first gate a sub-agent rent request passes
 * before it enters the operations pipeline. Only shown to agents the backend has
 * tagged as Service Center managers.
 */
export function ServiceCenterRentVettingQueue() {
  const { data, isLoading, error } = useServiceCenterRentQueue();
  const review = useServiceCenterReviewRentRequest();
  const { toast } = useToast();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [detailsReq, setDetailsReq] = useState<ServiceCenterQueueRequest | null>(null);

  const act = async (req: ServiceCenterQueueRequest, decision: 'verify' | 'reject', comment?: string) => {
    setBusyId(req.id);
    try {
      await review.mutateAsync({ requestId: req.id, decision, comment });
      toast({
        title: decision === 'verify' ? 'Verified' : 'Declined',
        description:
          decision === 'verify'
            ? `${req.tenant_name ?? 'Tenant'} moved on to Agent Ops review.`
            : `${req.tenant_name ?? 'Tenant'} was returned to ${req.agent_name ?? 'the sub-agent'}.`,
      });
      setRejectId(null);
      setReason('');
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message ?? 'Please try again.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}</div>;
  }

  if (error) {
    return (
      <Card><CardContent className="p-6 text-sm text-destructive">
        Could not load your vetting queue. Please try again.
      </CardContent></Card>
    );
  }

  // Managers see the queue. A non-tagged agent still sees anything already routed
  // to them (e.g. tagged then revoked) so nothing is ever stranded.
  if (!data?.is_service_center_manager && !(data?.pending_count ?? 0)) {
    return (
      <Card><CardContent className="space-y-1 p-6 text-center">
        <p className="text-sm font-semibold text-foreground">Not a Service Center manager yet</p>
        <p className="text-xs text-muted-foreground">
          Once you qualify and are tagged as a Service Center manager, every rent request your
          sub-agents submit will land here for your verification before it enters the pipeline.
        </p>
      </CardContent></Card>
    );
  }

  const pending = data.pending ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Awaiting your verification</span>
        <Badge variant="outline" className="text-[10px]">{pending.length}</Badge>
      </div>

      {pending.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          No sub-agent rent requests are waiting for your verification.
        </CardContent></Card>
      ) : (
        pending.map((req) => (
          <Card key={req.id}>
            <CardContent className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{req.tenant_name ?? 'Tenant'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Submitted by {req.agent_name ?? 'sub-agent'}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">Service Center review</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Rent: <strong className="text-foreground">{formatUGX(Number(req.rent_amount || 0))}</strong></span>
                <span>Daily: <strong className="text-foreground">{formatUGX(Number(req.daily_repayment || 0))}</strong></span>
                <span>Duration: <strong className="text-foreground">{req.duration_days ?? '—'} days</strong></span>
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3" /> {req.request_city ?? '—'}
                </span>
                {req.tenant_phone && (
                  <span className="inline-flex items-center gap-1 truncate">
                    <Phone className="h-3 w-3" /> {req.tenant_phone}
                  </span>
                )}
                {req.landlord_name && <span className="truncate">Landlord: {req.landlord_name}</span>}
              </div>

              <button type="button" onClick={() => setDetailsReq(req)} className="w-full text-left">
                {!!req.house_image_urls?.length && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {req.house_image_urls.slice(0, 6).map((url, i) => (
                      <img
                        key={`${req.id}-${i}`}
                        src={url}
                        alt={`House photo ${i + 1} for ${req.tenant_name ?? 'tenant'}`}
                        loading="lazy"
                        className="h-16 w-24 shrink-0 rounded-md object-cover"
                      />
                    ))}
                  </div>
                )}
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                  <Eye className="h-3 w-3" /> View house photos &amp; full details
                  {req.house_image_urls?.length ? ` (${req.house_image_urls.length})` : ''}
                </span>
              </button>

              {rejectId === req.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why are you declining this request? (required)"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyId === req.id || reason.trim().length < 5}
                      onClick={() => act(req, 'reject', reason.trim())}
                    >
                      {busyId === req.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                      Confirm decline
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === req.id} onClick={() => { setRejectId(null); setReason(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" disabled={busyId === req.id} onClick={() => act(req, 'verify')}>
                    {busyId === req.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                    Verify &amp; send to Agent Ops
                  </Button>
                  <Button size="sm" variant="outline" disabled={busyId === req.id} onClick={() => setRejectId(req.id)}>
                    <XCircle className="mr-1 h-3.5 w-3.5" /> Decline
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {!!data.recent_reviewed?.length && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recently reviewed</p>
          {data.recent_reviewed.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.tenant_name ?? 'Tenant'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.agent_name ?? 'Sub-agent'} · {formatUGX(Number(r.rent_amount || 0))}
                  </p>
                  {r.service_center_comment && (
                    <p className="truncate text-xs text-muted-foreground">Note: {r.service_center_comment}</p>
                  )}
                </div>
                <Badge variant={r.status === 'rejected' ? 'destructive' : 'default'} className="shrink-0 text-[10px]">
                  {r.status === 'rejected' ? 'Declined' : 'Verified'}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

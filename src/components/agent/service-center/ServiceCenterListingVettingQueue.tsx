import { useState } from 'react';
import { CheckCircle2, Home, Loader2, MapPin, Phone, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import {
  ServiceCenterListing,
  useServiceCenterListingQueue,
  useServiceCenterReviewListing,
} from '@/hooks/useServiceCenterListingQueue';

/**
 * Listings vetting queue — a Service Centre manager checks every house their
 * agents list before Landlord Ops performs the final verification.
 */
export function ServiceCenterListingVettingQueue() {
  const { data = [], isLoading, error } = useServiceCenterListingQueue();
  const review = useServiceCenterReviewListing();
  const { toast } = useToast();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const act = async (row: ServiceCenterListing, decision: 'pass' | 'return', comment?: string) => {
    setBusyId(row.id);
    try {
      await review.mutateAsync({ listingId: row.id, decision, comment });
      toast({
        title: decision === 'pass' ? 'Sent to Landlord Ops' : 'Returned to agent',
        description:
          decision === 'pass'
            ? `${row.title ?? 'The house'} now awaits final verification.`
            : `${row.agent_name ?? 'The agent'} must fix and resubmit this listing.`,
      });
      setReturnId(null);
      setReason('');
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message ?? 'Please try again.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>;
  }

  if (error) {
    return (
      <Card><CardContent className="p-4">
        <p className="text-sm font-semibold text-destructive">Could not load the listings vetting queue</p>
        <p className="mt-1 break-words text-xs text-destructive/90">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Home className="h-4 w-4" /> Houses awaiting your vetting
        </h3>
        <Badge variant={data.length ? 'default' : 'outline'}>{data.length}</Badge>
      </div>

      {data.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          No houses waiting on you. New listings from your agents will appear here first.
        </CardContent></Card>
      ) : (
        data.map((row) => (
          <Card key={row.id}>
            <CardContent className="space-y-2.5 p-3">
              <div className="flex items-start gap-3">
                {row.images?.[0] ? (
                  <img
                    src={row.images[0]}
                    alt={row.title ?? 'House photo'}
                    loading="lazy"
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Home className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{row.title ?? 'Untitled house'}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {[row.village, row.address, row.district].filter(Boolean).join(', ') || 'No location captured'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatUGX(Number(row.rent_amount ?? 0))}
                    {row.bedrooms ? ` · ${row.bedrooms} bedroom${row.bedrooms === 1 ? '' : 's'}` : ''}
                    {row.latitude && row.longitude ? ' · GPS captured' : ' · no GPS'}
                  </p>
                </div>
              </div>

              <div className="grid gap-1 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground sm:grid-cols-2">
                <span>Listed by <span className="font-medium text-foreground">{row.agent_name ?? 'Unknown agent'}</span></span>
                {row.agent_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{row.agent_phone}</span>}
                <span>Landlord <span className="font-medium text-foreground">{row.landlord_name ?? 'Not linked'}</span></span>
                {row.landlord_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{row.landlord_phone}</span>}
              </div>

              {returnId === row.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Tell the agent exactly what to fix (required)"
                    rows={3}
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={reason.trim().length < 5 || busyId === row.id}
                      onClick={() => act(row, 'return', reason.trim())}
                    >
                      {busyId === row.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Confirm return
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setReturnId(null); setReason(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" disabled={busyId === row.id} onClick={() => act(row, 'pass')}>
                    {busyId === row.id
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                    Pass to Landlord Ops
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setReturnId(row.id)}>
                    <XCircle className="mr-1.5 h-3.5 w-3.5" /> Return to agent
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
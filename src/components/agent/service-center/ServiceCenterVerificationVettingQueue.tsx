import { useState } from 'react';
import { CheckCircle2, Loader2, MapPin, Phone, ShieldQuestion, UserCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import {
  ServiceCenterLandlordRow,
  ServiceCenterLc1Row,
  useServiceCenterReviewVerification,
  useServiceCenterVerificationQueue,
} from '@/hooks/useServiceCenterVerificationQueue';

type Kind = 'landlord' | 'lc1';

/**
 * Landlord & LC1 chairperson vetting — a Service Centre manager checks every
 * landlord and LC1 chairperson their team registers before Landlord Ops does
 * the final verification.
 */
export function ServiceCenterVerificationVettingQueue() {
  const { data, isLoading, error } = useServiceCenterVerificationQueue();
  const review = useServiceCenterReviewVerification();
  const { toast } = useToast();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const landlords = data?.landlords ?? [];
  const lc1 = data?.lc1 ?? [];
  const total = landlords.length + lc1.length;

  const act = async (
    kind: Kind,
    row: { id: string; name: string | null; agent_name: string | null },
    decision: 'pass' | 'return',
    comment?: string,
  ) => {
    setBusyId(row.id);
    try {
      await review.mutateAsync({ kind, recordId: row.id, decision, comment });
      toast({
        title: decision === 'pass' ? 'Sent to Landlord Ops' : 'Returned to agent',
        description:
          decision === 'pass'
            ? `${row.name ?? 'The record'} now awaits final verification.`
            : `${row.agent_name ?? 'The agent'} must fix and resubmit ${row.name ?? 'this record'}.`,
      });
      setReturnId(null);
      setReason('');
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message ?? 'Please try again.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const actions = (kind: Kind, row: { id: string; name: string | null; agent_name: string | null }) =>
    returnId === row.id ? (
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
            onClick={() => act(kind, row, 'return', reason.trim())}
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
        <Button size="sm" className="flex-1" disabled={busyId === row.id} onClick={() => act(kind, row, 'pass')}>
          {busyId === row.id
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
          Pass to Landlord Ops
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={() => setReturnId(row.id)}>
          <XCircle className="mr-1.5 h-3.5 w-3.5" /> Return to agent
        </Button>
      </div>
    );

  if (isLoading) {
    return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>;
  }

  if (error) {
    return (
      <Card><CardContent className="p-4">
        <p className="text-sm font-semibold text-destructive">Could not load the landlord &amp; LC1 vetting queue</p>
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
          <ShieldQuestion className="h-4 w-4" /> Landlords &amp; LC1 chairpersons awaiting your vetting
        </h3>
        <Badge variant={total ? 'default' : 'outline'}>{total}</Badge>
      </div>

      {total === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nothing waiting on you. New landlords and LC1 chairpersons registered by your team appear here first.
        </CardContent></Card>
      ) : (
        <>
          {landlords.map((row: ServiceCenterLandlordRow) => (
            <Card key={row.id}>
              <CardContent className="space-y-2.5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{row.name ?? 'Unnamed landlord'}</p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {[row.village, row.property_address, row.district].filter(Boolean).join(', ') || 'No location captured'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.monthly_rent ? formatUGX(Number(row.monthly_rent)) : 'Rent not stated'}
                      {row.number_of_houses ? ` · ${row.number_of_houses} house${row.number_of_houses === 1 ? '' : 's'}` : ''}
                      {row.latitude && row.longitude ? ' · GPS captured' : ' · no GPS'}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">Landlord</Badge>
                </div>

                <div className="grid gap-1 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>Registered by <span className="font-medium text-foreground">{row.agent_name ?? 'Unknown agent'}</span></span>
                  {row.agent_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{row.agent_phone}</span>}
                  {row.phone && <span className="inline-flex items-center gap-1"><UserCircle className="h-3 w-3" />{row.phone}</span>}
                </div>

                {actions('landlord', row)}
              </CardContent>
            </Card>
          ))}

          {lc1.map((row: ServiceCenterLc1Row) => (
            <Card key={row.id}>
              <CardContent className="space-y-2.5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{row.name ?? 'Unnamed chairperson'}</p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {[row.village, row.parish, row.sub_county, row.district].filter(Boolean).join(', ') || 'No location captured'}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">LC1 chairperson</Badge>
                </div>

                <div className="grid gap-1 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>Registered by <span className="font-medium text-foreground">{row.agent_name ?? 'Unknown agent'}</span></span>
                  {row.agent_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{row.agent_phone}</span>}
                  {row.phone && <span className="inline-flex items-center gap-1"><UserCircle className="h-3 w-3" />{row.phone}</span>}
                </div>

                {actions('lc1', row)}
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
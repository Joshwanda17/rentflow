import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, Receipt, Clock, MapPin, ExternalLink, Camera } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface LandlordPaymentHistoryProps {
  landlordId: string;
}

export function LandlordPaymentHistory({ landlordId }: LandlordPaymentHistoryProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['landlord-payment-history', landlordId],
    queryFn: async () => {
      const { data: disbursements, error } = await supabase
        .from('disbursement_records')
        .select('*')
        .eq('landlord_id', landlordId)
        .order('disbursed_at', { ascending: false });
      if (error) throw error;

      // Get delivery confirmations
      const disbIds = (disbursements || []).map(d => d.id);
      const confMap = new Map<string, any>();
      if (disbIds.length > 0) {
        const { data: confs } = await supabase
          .from('agent_delivery_confirmations')
          .select('*')
          .in('disbursement_id', disbIds);
        for (const c of confs || []) confMap.set(c.disbursement_id, c);
      }

      return (disbursements || []).map(d => ({
        ...d,
        delivery: confMap.get(d.id) || null,
      }));
    },
    enabled: !!landlordId,
    staleTime: 60_000,
  });

  const records = data || [];
  const totalPaid = records.reduce((s, r) => s + Number(r.amount), 0);

  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            Payment History
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">{formatUGX(totalPaid)} total</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">No payment records yet</p>
        ) : (
          <div className="space-y-3">
            {records.map(record => (
              <div key={record.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold font-mono">{formatUGX(Number(record.amount))}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(record.disbursed_at), 'dd MMM yyyy · HH:mm')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{record.payout_method}</Badge>
                    {record.agent_confirmed ? (
                      <Badge className="bg-success/10 text-success border-success/30 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Confirmed</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
                    )}
                  </div>
                </div>
                {record.transaction_reference && (
                  <p className="text-xs font-mono text-muted-foreground">Ref: {record.transaction_reference}</p>
                )}
                {record.delivery && (
                  <div className="bg-success/5 rounded p-2 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-success">Agent Receipt Collected</p>
                    {record.delivery.latitude && (
                      <a href={`https://www.google.com/maps?q=${record.delivery.latitude},${record.delivery.longitude}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 w-fit">
                        <MapPin className="h-3 w-3" />GPS Verified <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {record.delivery.photo_urls?.length > 0 && (
                      <div className="flex gap-1">
                        <Camera className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{record.delivery.photo_urls.length} photo(s)</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

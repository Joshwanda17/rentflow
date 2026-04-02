import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { MapPin, CheckCircle, XCircle, Loader2, Building2, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

export function ServiceCentreVerificationQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data: setups, isLoading } = useQuery({
    queryKey: ['service-centre-pending-setups'],
    queryFn: async () => {
      const { data } = await supabase
        .from('service_centre_setups' as any)
        .select('*')
        .in('status', ['pending'])
        .order('created_at', { ascending: true });
      return (data || []) as any[];
    },
    staleTime: 30000,
  });

  const handleVerify = async (id: string) => {
    if (!user?.id) return;
    setProcessingId(id);
    try {
      const { error } = await supabase
        .from('service_centre_setups' as any)
        .update({
          status: 'verified',
          verified_by: user.id,
          verified_at: new Date().toISOString(),
        } as any)
        .eq('id', id);
      if (error) throw error;
      toast.success('Service Centre verified!');
      queryClient.invalidateQueries({ queryKey: ['service-centre-pending-setups'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectionReason.trim() || rejectionReason.trim().length < 10) {
      toast.error('Please provide a reason (at least 10 characters).');
      return;
    }
    setProcessingId(id);
    try {
      const { error } = await supabase
        .from('service_centre_setups' as any)
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason.trim(),
        } as any)
        .eq('id', id);
      if (error) throw error;
      toast.success('Service Centre rejected.');
      setRejectingId(null);
      setRejectionReason('');
      queryClient.invalidateQueries({ queryKey: ['service-centre-pending-setups'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Building2 className="h-4 w-4 text-primary" />
          Service Centre Verification Queue
          {setups?.length ? (
            <span className="ml-auto bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">{setups.length}</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !setups?.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">No pending service centre submissions.</p>
        ) : (
          <div className="space-y-4">
            {setups.map((s: any) => (
              <div key={s.id} className="rounded-xl border border-border p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">{s.agent_name}</p>
                    <p className="text-xs text-muted-foreground">📱 {s.agent_phone}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(s.created_at), 'dd MMM yyyy HH:mm')}</p>
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                  >
                    <MapPin className="h-3 w-3" />
                    View on Map
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <img src={s.photo_url} alt="Service Centre" className="rounded-lg max-h-40 w-full object-cover border" />
                <p className="text-xs text-muted-foreground">📍 {s.location_name || 'No description'}</p>
                <p className="text-xs text-muted-foreground">🌐 {Number(s.latitude).toFixed(5)}, {Number(s.longitude).toFixed(5)}</p>

                {rejectingId === s.id ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Reason for rejection (min 10 chars)"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      maxLength={500}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(s.id)}
                        disabled={processingId === s.id}
                        className="flex-1 gap-1"
                      >
                        {processingId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                        Confirm Reject
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectionReason(''); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleVerify(s.id)}
                      disabled={processingId === s.id}
                      className="flex-1 gap-1"
                    >
                      {processingId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                      Verify ✅
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRejectingId(s.id)}
                      className="flex-1 gap-1"
                    >
                      <XCircle className="h-3 w-3" />
                      Reject
                    </Button>
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

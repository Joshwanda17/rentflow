import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, MapPin, Loader2, Upload, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';

interface AgentDeliveryConfirmationProps {
  disbursementId: string;
  rentRequestId: string;
  onConfirmed?: () => void;
}

export function AgentDeliveryConfirmation({ disbursementId, rentRequestId, onConfirmed }: AgentDeliveryConfirmationProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [photos, setPhotos] = useState<File[]>([]);
  const [notes, setNotes] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const captureGPS = () => {
    if (!navigator.geolocation) { toast.error('GPS not supported'); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsLoading(false);
        toast.success('GPS captured');
      },
      () => { setGpsLoading(false); toast.error('GPS access denied'); },
      { enableHighAccuracy: true }
    );
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 3) { toast.error('Max 3 photos'); return; }
    setPhotos(prev => [...prev, ...files].slice(0, 3));
  };

  const removePhoto = (i: number) => setPhotos(prev => prev.filter((_, idx) => idx !== i));

  const submit = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      if (!gps) throw new Error('Please capture GPS first');
      if (photos.length === 0) throw new Error('Please add at least one photo');

      // Upload photos
      const photoUrls: string[] = [];
      for (const file of photos) {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `delivery-confirmations/${disbursementId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('receipts').upload(path, file);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
        photoUrls.push(urlData.publicUrl);
      }

      // Insert confirmation
      const { error } = await supabase.from('agent_delivery_confirmations').insert({
        disbursement_id: disbursementId,
        agent_id: user.id,
        rent_request_id: rentRequestId,
        photo_urls: photoUrls,
        latitude: gps.lat,
        longitude: gps.lng,
        location_accuracy: gps.accuracy,
        notes: notes || null,
      });
      if (error) throw error;

      // Update disbursement record
      await supabase.from('disbursement_records')
        .update({ agent_confirmed: true, agent_confirmed_at: new Date().toISOString() })
        .eq('id', disbursementId);

      // Create float settlement ledger entry (reduces agent float, records settlement on platform)
      await supabase.functions.invoke('create-ledger-entry', {
        body: {
          entries: [
            {
              user_id: user.id,
              amount: 0, // Amount will come from the disbursement; use 0 as proof marker
              direction: 'cash_out',
              category: 'agent_float_settlement',
              ledger_scope: 'wallet',
              description: `Float settled – landlord delivery confirmed for disbursement ${disbursementId}`,
              currency: 'UGX',
              source_table: 'agent_delivery_confirmations',
              source_id: disbursementId,
              transaction_date: new Date().toISOString(),
              metadata: JSON.stringify({
                gps: gps,
                photo_count: photoUrls.length,
                rent_request_id: rentRequestId,
              }),
            },
          ],
        },
      });
    },
    onSuccess: () => {
      toast.success('Delivery confirmed!');
      qc.invalidateQueries({ queryKey: ['disbursement-registry'] });
      onConfirmed?.();
    },
    onError: (e: any) => toast.error(e.message || 'Failed to confirm'),
  });

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary" />
          Confirm Receipt Collection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* GPS */}
        <div>
          <Button variant="outline" size="sm" onClick={captureGPS} disabled={gpsLoading} className="w-full">
            {gpsLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <MapPin className="h-3 w-3 mr-1" />}
            {gps ? `GPS: ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : 'Capture GPS Location'}
          </Button>
          {gps && <p className="text-[10px] text-success mt-1 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Accuracy: {gps.accuracy.toFixed(0)}m</p>}
        </div>

        {/* Photos */}
        <div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={handleFiles} className="hidden" />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={photos.length >= 3} className="w-full">
            <Upload className="h-3 w-3 mr-1" />Add Photos ({photos.length}/3)
          </Button>
          {photos.length > 0 && (
            <div className="flex gap-2 mt-2">
              {photos.map((f, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(f)} alt="" className="h-16 w-16 object-cover rounded border" />
                  <button onClick={() => removePhoto(i)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-4 w-4 flex items-center justify-center">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <Textarea placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} className="h-16 text-sm" />

        <Button onClick={() => submit.mutate()} disabled={submit.isPending || !gps || photos.length === 0} className="w-full">
          {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
          Confirm Delivery
        </Button>
      </CardContent>
    </Card>
  );
}

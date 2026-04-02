import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { MapPin, Camera, Loader2, Send, CheckCircle, Clock, XCircle, BadgeCheck } from 'lucide-react';
import { format } from 'date-fns';

export function ServiceCentreSubmissionForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['agent-profile-for-sc', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from('profiles').select('full_name, phone').eq('id', user.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: submissions, isLoading: subsLoading } = useQuery({
    queryKey: ['my-service-centre-setups', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from('service_centre_setups' as any)
        .select('*')
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!user?.id,
  });

  const captureGPS = () => {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setGpsLoading(false);
        toast.success('GPS location captured!');
      },
      (err) => {
        setGpsLoading(false);
        toast.error('Could not get your location. Please enable GPS.');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    if (!user?.id || !photoFile || latitude === null || longitude === null) {
      toast.error('Please capture GPS and take a photo first.');
      return;
    }
    if (!locationName.trim()) {
      toast.error('Please describe the location.');
      return;
    }

    setSubmitting(true);
    try {
      const ext = photoFile.name.split('.').pop() || 'jpg';
      const filePath = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('service-centre-photos')
        .upload(filePath, photoFile);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from('service-centre-photos')
        .getPublicUrl(filePath);

      const { error: insertErr } = await supabase
        .from('service_centre_setups' as any)
        .insert({
          agent_id: user.id,
          photo_url: urlData.publicUrl,
          latitude,
          longitude,
          location_name: locationName.trim(),
          agent_name: profile?.full_name || 'Unknown',
          agent_phone: profile?.phone || '',
          status: 'pending',
        } as any);
      if (insertErr) throw insertErr;

      toast.success('Service Centre submitted for verification!');
      setPhotoFile(null);
      setPhotoPreview(null);
      setLatitude(null);
      setLongitude(null);
      setLocationName('');
      queryClient.invalidateQueries({ queryKey: ['my-service-centre-setups'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { icon: any; label: string; cls: string }> = {
      pending: { icon: Clock, label: 'Pending', cls: 'bg-yellow-100 text-yellow-700' },
      verified: { icon: BadgeCheck, label: 'Verified', cls: 'bg-blue-100 text-blue-700' },
      approved: { icon: CheckCircle, label: 'Approved', cls: 'bg-green-100 text-green-700' },
      paid: { icon: CheckCircle, label: 'Paid ✅', cls: 'bg-green-200 text-green-800' },
      rejected: { icon: XCircle, label: 'Rejected', cls: 'bg-red-100 text-red-700' },
    };
    const s = map[status] || map.pending;
    const Icon = s.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
        <Icon className="h-3 w-3" />
        {s.label}
      </span>
    );
  };

  return (
    <>
      {/* Submit Form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Send className="h-4 w-4 text-primary" />
            </div>
            Submit Your Service Centre
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            After you print and mount the poster, take a photo and submit it here. You will earn <span className="font-bold text-primary">UGX 25,000</span> once verified and approved!
          </p>

          {/* Photo */}
          <div className="space-y-2">
            <Label>📸 Photo of Service Centre Setup</Label>
            <Input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoChange}
              className="text-sm"
            />
            {photoPreview && (
              <img src={photoPreview} alt="Preview" className="rounded-xl border max-h-48 w-full object-cover" />
            )}
          </div>

          {/* GPS */}
          <div className="space-y-2">
            <Label>📍 GPS Location</Label>
            <Button
              type="button"
              variant="outline"
              onClick={captureGPS}
              disabled={gpsLoading}
              className="w-full gap-2"
            >
              {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              {latitude !== null ? `📍 ${latitude.toFixed(5)}, ${longitude?.toFixed(5)}` : 'Capture GPS Location'}
            </Button>
          </div>

          {/* Location Name */}
          <div className="space-y-2">
            <Label>📝 Describe the Location</Label>
            <Input
              placeholder="e.g. Kampala Road, near Shell Petrol Station"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Agent Info (auto-filled) */}
          <div className="rounded-xl bg-muted/40 p-3 text-sm space-y-1">
            <p><span className="font-medium text-foreground">Agent Name:</span> {profile?.full_name || '—'}</p>
            <p><span className="font-medium text-foreground">Phone:</span> {profile?.phone || '—'}</p>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting || !photoFile || latitude === null || !locationName.trim()}
            className="w-full gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit Service Centre
          </Button>
        </CardContent>
      </Card>

      {/* My Submissions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="p-1.5 rounded-lg bg-muted">
              <Camera className="h-4 w-4 text-primary" />
            </div>
            My Submissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !submissions?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">No submissions yet. Set up a Service Centre and submit above!</p>
          ) : (
            <div className="space-y-3">
              {submissions.map((s: any) => (
                <div key={s.id} className="rounded-xl border border-border/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{format(new Date(s.created_at), 'dd MMM yyyy')}</span>
                    {statusBadge(s.status)}
                  </div>
                  <img src={s.photo_url} alt="Service Centre" className="rounded-lg max-h-32 w-full object-cover" />
                  <p className="text-xs text-muted-foreground">📍 {s.location_name || `${Number(s.latitude).toFixed(4)}, ${Number(s.longitude).toFixed(4)}`}</p>
                  {s.rejection_reason && (
                    <p className="text-xs text-red-600">❌ {s.rejection_reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

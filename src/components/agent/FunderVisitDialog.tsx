import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MapPin, Navigation } from 'lucide-react';

interface FunderVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funder: { id: string; full_name: string; phone: string } | null;
  onSuccess?: () => void;
}

export function FunderVisitDialog({ open, onOpenChange, funder, onSuccess }: FunderVisitDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locationName, setLocationName] = useState('');
  const [notes, setNotes] = useState('');
  const [visitType, setVisitType] = useState('routine');

  const getLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: 'GPS not available', variant: 'destructive' });
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setAccuracy(pos.coords.accuracy);
        setGettingLocation(false);
        toast({ title: '📍 Location captured' });
      },
      (err) => {
        setGettingLocation(false);
        toast({ title: 'Location error', description: err.message, variant: 'destructive' });
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleSubmit = async () => {
    if (!user || !funder) return;
    if (!latitude || !longitude) {
      toast({ title: 'GPS required', description: 'Please capture your location first', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('funder_visits').insert({
        agent_id: user.id,
        funder_id: funder.id,
        latitude,
        longitude,
        accuracy,
        location_name: locationName || null,
        notes: notes || null,
        visit_type: visitType,
      });

      if (error) throw error;

      toast({ title: '✅ Visit logged', description: `Check-in for ${funder.full_name} recorded` });
      onOpenChange(false);
      setNotes('');
      setLocationName('');
      setLatitude(null);
      setLongitude(null);
      onSuccess?.();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Log Funder Visit
          </DialogTitle>
        </DialogHeader>

        {funder && (
          <div className="rounded-xl bg-muted/50 p-3 mb-2">
            <p className="font-semibold text-sm">{funder.full_name}</p>
            <p className="text-xs text-muted-foreground">{funder.phone}</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label>Visit Type</Label>
            <Select value={visitType} onValueChange={setVisitType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">📋 Routine Check-in</SelectItem>
                <SelectItem value="collection">💰 Cash Collection</SelectItem>
                <SelectItem value="statement_delivery">📄 Statement Delivery</SelectItem>
                <SelectItem value="dispute_resolution">⚠️ Dispute Resolution</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Location Name (optional)</Label>
            <Input
              placeholder="e.g. Funder's home, office"
              value={locationName}
              onChange={e => setLocationName(e.target.value)}
            />
          </div>

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={getLocation}
            disabled={gettingLocation}
          >
            {gettingLocation ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="h-4 w-4" />
            )}
            {latitude ? `📍 ${latitude.toFixed(4)}, ${longitude?.toFixed(4)}` : 'Capture GPS Location'}
          </Button>

          {accuracy && (
            <p className="text-[10px] text-muted-foreground text-center">
              Accuracy: ±{Math.round(accuracy)}m
            </p>
          )}

          <div>
            <Label>Notes</Label>
            <Input
              placeholder="Any observations..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={loading || !latitude}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Log Visit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

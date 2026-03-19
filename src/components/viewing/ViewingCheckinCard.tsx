import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  MapPin, Key, Star, Loader2, CheckCircle2,
  Navigation, Home, Calendar, Clock,
} from 'lucide-react';
import { format } from 'date-fns';

interface ViewingData {
  id: string;
  house_title: string;
  house_address: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  viewing_pin?: string;
  pin_verified: boolean;
  proximity_verified: boolean;
  agent_checkin_at: string | null;
  tenant_checkin_at: string | null;
  agent_rating: number | null;
  tenant_rating: number | null;
  meeting_verified: boolean;
  status: string;
  // Role-specific
  other_party_name: string;
  role: 'agent' | 'tenant';
}

export function ViewingCheckinCard({ viewing }: { viewing: ViewingData }) {
  const { user } = useAuth();
  const [checkingIn, setCheckingIn] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [checkedIn, setCheckedIn] = useState(
    viewing.role === 'agent' ? !!viewing.agent_checkin_at : !!viewing.tenant_checkin_at
  );
  const [pinVerified, setPinVerified] = useState(viewing.pin_verified);
  const [rated, setRated] = useState(
    viewing.role === 'agent' ? !!viewing.agent_rating : !!viewing.tenant_rating
  );

  const handleCheckin = async () => {
    if (!user) return;
    setCheckingIn(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 15000, maximumAge: 0,
        });
      });

      const { data, error } = await supabase.functions.invoke('verify-viewing-checkin', {
        body: {
          action: 'checkin',
          viewing_id: viewing.id,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        },
      });

      if (error) throw error;

      if (data.proximity_ok) {
        toast.success(`✅ Checked in! ${data.distance_m ? `${data.distance_m}m from property` : 'Location recorded'}`);
        setCheckedIn(true);
      } else {
        toast.error(`❌ Too far from property (${data.distance_m}m away, must be within ${data.threshold_m}m)`);
      }
    } catch (err: any) {
      if (err.code === 1) {
        toast.error('Location permission denied. Please enable GPS.');
      } else {
        toast.error(err.message || 'Check-in failed');
      }
    } finally {
      setCheckingIn(false);
    }
  };

  const handleVerifyPin = async () => {
    if (pinInput.length !== 4) {
      toast.error('Enter the 4-digit PIN from the tenant');
      return;
    }
    setVerifyingPin(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-viewing-checkin', {
        body: { action: 'verify_pin', viewing_id: viewing.id, pin: pinInput },
      });
      if (error) throw error;
      if (data.pin_match) {
        toast.success('✅ PIN verified! Meeting confirmed.');
        setPinVerified(true);
      }
    } catch (err: any) {
      toast.error(err.message || 'PIN verification failed');
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleRate = async () => {
    if (rating === 0) {
      toast.error('Select a rating (1-5 stars)');
      return;
    }
    setSubmittingRating(true);
    try {
      const { error } = await supabase.functions.invoke('verify-viewing-checkin', {
        body: { action: 'rate', viewing_id: viewing.id, rating, feedback },
      });
      if (error) throw error;
      toast.success('Thanks for your rating!');
      setRated(true);
    } catch (err: any) {
      toast.error(err.message || 'Rating failed');
    } finally {
      setSubmittingRating(false);
    }
  };

  const allVerified = checkedIn && pinVerified && rated;

  return (
    <Card className={`border-2 ${allVerified ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20' : 'border-primary/20'}`}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-sm flex items-center gap-1.5">
              <Home className="h-4 w-4 text-primary" />
              {viewing.house_title}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3" /> {viewing.house_address}
            </p>
            {viewing.scheduled_date && (
              <p className="text-xs text-primary mt-1 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(new Date(viewing.scheduled_date), 'MMM d, yyyy')}
                {viewing.scheduled_time && (
                  <span className="flex items-center gap-0.5 ml-1">
                    <Clock className="h-3 w-3" /> {viewing.scheduled_time}
                  </span>
                )}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {viewing.role === 'agent' ? '👤 Tenant' : '🏃 Agent'}: {viewing.other_party_name}
            </p>
          </div>
          {allVerified && (
            <Badge className="bg-green-500/20 text-green-700 border-0 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Verified
            </Badge>
          )}
        </div>

        {/* Viewing PIN (only tenant sees the PIN, agent enters it) */}
        {viewing.role === 'tenant' && viewing.viewing_pin && !pinVerified && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300/50 p-3 text-center">
            <p className="text-[10px] text-amber-700 font-medium mb-1">Your Viewing PIN — Share with agent at the property</p>
            <p className="text-3xl font-mono font-black tracking-[0.3em] text-amber-800">{viewing.viewing_pin}</p>
          </div>
        )}

        {/* Step 1: GPS Check-in */}
        <div className="flex items-center gap-2">
          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${checkedIn ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
            {checkedIn ? '✓' : '1'}
          </div>
          {checkedIn ? (
            <p className="text-xs text-green-700 font-medium">📍 Checked in at property</p>
          ) : (
            <Button onClick={handleCheckin} disabled={checkingIn} size="sm" variant="outline" className="gap-1.5 text-xs h-8 flex-1">
              {checkingIn ? <Loader2 className="h-3 w-3 animate-spin" /> : <Navigation className="h-3 w-3" />}
              Check In at Property (GPS)
            </Button>
          )}
        </div>

        {/* Step 2: PIN Verification (Agent only) */}
        {viewing.role === 'agent' && (
          <div className="flex items-center gap-2">
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${pinVerified ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
              {pinVerified ? '✓' : '2'}
            </div>
            {pinVerified ? (
              <p className="text-xs text-green-700 font-medium">🔑 PIN verified</p>
            ) : (
              <div className="flex gap-1.5 flex-1">
                <Input
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="Enter tenant's PIN"
                  className="h-8 text-xs font-mono text-center tracking-widest w-28"
                  maxLength={4}
                />
                <Button onClick={handleVerifyPin} disabled={verifyingPin || pinInput.length !== 4} size="sm" variant="outline" className="gap-1 text-xs h-8">
                  {verifyingPin ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />}
                  Verify
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Rating */}
        <div className="flex items-start gap-2">
          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${rated ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
            {rated ? '✓' : viewing.role === 'agent' ? '3' : '2'}
          </div>
          {rated ? (
            <p className="text-xs text-green-700 font-medium">⭐ Rated ({rating}/5)</p>
          ) : (
            <div className="flex-1 space-y-1.5">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <button key={s} onClick={() => setRating(s)} className="p-0.5">
                    <Star className={`h-5 w-5 transition-colors ${s <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
                  </button>
                ))}
              </div>
              <Textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Optional feedback..."
                className="text-xs h-12 resize-none"
              />
              <Button onClick={handleRate} disabled={submittingRating || rating === 0} size="sm" className="gap-1 text-xs h-7 w-full">
                {submittingRating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
                Submit Rating
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

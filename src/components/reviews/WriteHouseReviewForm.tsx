import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useGeoLocation } from '@/hooks/useGeoLocation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, MapPin, LocateFixed } from 'lucide-react';
import { toast } from 'sonner';
import StarRatingInput from './StarRatingInput';
import type { HouseReview } from '@/hooks/useHouseReviews';

interface WriteHouseReviewFormProps {
  houseId: string;
  houseTitle: string;
  existingReview?: HouseReview | null;
  onSuccess?: () => void;
}

export default function WriteHouseReviewForm({ houseId, houseTitle, existingReview, onSuccess }: WriteHouseReviewFormProps) {
  const { user } = useAuth();
  const { location, loading: geoLoading, error: geoError, captureLocation } = useGeoLocation();
  const [rating, setRating] = useState(existingReview?.rating || 0);
  const [reviewText, setReviewText] = useState(existingReview?.review_text || '');
  const [saving, setSaving] = useState(false);

  const handleCaptureGPS = async () => {
    const loc = await captureLocation();
    if (loc) {
      toast.success('Location captured! You can now submit your review.');
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please sign in to leave a review');
      return;
    }
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }
    if (!location) {
      toast.error('GPS location required — tap "Capture My Location" first');
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from('house_reviews')
      .upsert({
        house_id: houseId,
        reviewer_id: user.id,
        rating,
        review_text: reviewText.trim() || null,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'house_id,reviewer_id',
      });

    setSaving(false);

    if (error) {
      toast.error('Failed to save review');
      console.error('House review error:', error);
      return;
    }

    toast.success('Review posted!');
    onSuccess?.();
  };

  if (!user) {
    return (
      <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
        <p className="text-sm text-muted-foreground">Sign in to review this house</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 rounded-xl bg-muted/30 border border-border/50">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {existingReview ? 'Update your review' : 'Review this house'}
      </p>

      <StarRatingInput value={rating} onChange={setRating} size="md" />

      <Textarea
        value={reviewText}
        onChange={(e) => setReviewText(e.target.value)}
        placeholder={`How is the quality of "${houseTitle}"?`}
        className="min-h-[60px] resize-none text-sm"
        maxLength={500}
      />

      {/* GPS capture */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={location ? 'outline' : 'secondary'}
          size="sm"
          onClick={handleCaptureGPS}
          disabled={geoLoading}
          className="gap-1.5"
        >
          {geoLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : location ? (
            <LocateFixed className="h-3.5 w-3.5 text-success" />
          ) : (
            <MapPin className="h-3.5 w-3.5" />
          )}
          {location ? 'Location captured ✓' : 'Capture My Location'}
        </Button>
        {geoError && <span className="text-xs text-destructive">{geoError}</span>}
        {!location && !geoError && (
          <span className="text-[10px] text-muted-foreground">Required to verify you visited</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{reviewText.length}/500</span>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={saving || rating === 0 || !location}
          className="gap-1.5"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {existingReview ? 'Update' : 'Submit'}
        </Button>
      </div>
    </div>
  );
}

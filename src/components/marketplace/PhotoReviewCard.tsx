import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, CheckCircle2, Camera, ChevronLeft, ChevronRight, X, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface ReviewImage {
  id: string;
  image_url: string;
}

interface ReviewVote {
  upvotes: number;
  downvotes: number;
  userVote: 'upvote' | 'downvote' | null;
}

interface Review {
  id: string;
  product_id: string;
  buyer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  buyer_name?: string;
  buyer_avatar?: string | null;
  is_verified_purchase?: boolean;
  images?: ReviewImage[];
  votes?: ReviewVote;
}

interface PhotoReviewCardProps {
  review: Review;
  onImageClick?: (images: ReviewImage[], startIndex: number) => void;
  onVoteChange?: () => void;
}

export function PhotoReviewCard({ review, onImageClick, onVoteChange }: PhotoReviewCardProps) {
  const { user } = useAuth();
  const [voting, setVoting] = useState(false);
  const hasImages = review.images && review.images.length > 0;

  const handleVote = async (voteType: 'upvote' | 'downvote') => {
    if (!user) {
      toast.error('Please sign in to vote');
      return;
    }

    if (user.id === review.buyer_id) {
      toast.error("You can't vote on your own review");
      return;
    }

    setVoting(true);
    try {
      const currentVote = review.votes?.userVote;

      if (currentVote === voteType) {
        // Remove vote
        const { error } = await supabase
          .from('review_votes')
          .delete()
          .eq('review_id', review.id)
          .eq('user_id', user.id);

        if (error) throw error;
      } else if (currentVote) {
        // Update vote
        const { error } = await supabase
          .from('review_votes')
          .update({ vote_type: voteType })
          .eq('review_id', review.id)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Insert new vote
        const { error } = await supabase
          .from('review_votes')
          .insert({
            review_id: review.id,
            user_id: user.id,
            vote_type: voteType,
          });

        if (error) throw error;
      }

      onVoteChange?.();
    } catch (error: any) {
      toast.error('Failed to vote', { description: error.message });
    } finally {
      setVoting(false);
    }
  };

  const helpfulScore = (review.votes?.upvotes || 0) - (review.votes?.downvotes || 0);

  return (
    <div className="p-4 rounded-xl bg-card border border-border/50 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={review.buyer_avatar || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {(review.buyer_name || 'A').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{review.buyer_name || 'Anonymous'}</span>
              {review.is_verified_purchase && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-success border-success/30 bg-success/10">
                  <CheckCircle2 className="h-3 w-3" />
                  Verified Purchase
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-3 w-3 ${
                      star <= review.rating
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-gray-300'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {format(new Date(review.created_at), 'MMM d, yyyy')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Comment */}
      {review.comment && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {review.comment}
        </p>
      )}

      {/* Review Images */}
      {hasImages && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {review.images!.map((image, index) => (
            <motion.button
              key={image.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onImageClick?.(review.images!, index)}
              className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors"
            >
              <img
                src={image.image_url}
                alt={`Review photo ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </motion.button>
          ))}
          {review.images!.length > 0 && (
            <div className="flex items-center text-xs text-muted-foreground gap-1 pl-2">
              <Camera className="h-3.5 w-3.5" />
              {review.images!.length}
            </div>
          )}
        </div>
      )}

      {/* Voting Section */}
      <div className="flex items-center gap-3 pt-2 border-t border-border/50">
        <span className="text-xs text-muted-foreground">Helpful?</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleVote('upvote')}
            disabled={voting}
            className={`h-7 px-2 gap-1 ${
              review.votes?.userVote === 'upvote'
                ? 'text-success bg-success/10 hover:bg-success/20'
                : 'text-muted-foreground hover:text-success'
            }`}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            <span className="text-xs">{review.votes?.upvotes || 0}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleVote('downvote')}
            disabled={voting}
            className={`h-7 px-2 gap-1 ${
              review.votes?.userVote === 'downvote'
                ? 'text-destructive bg-destructive/10 hover:bg-destructive/20'
                : 'text-muted-foreground hover:text-destructive'
            }`}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            <span className="text-xs">{review.votes?.downvotes || 0}</span>
          </Button>
        </div>
        {helpfulScore > 0 && (
          <span className="text-xs text-success ml-auto">
            {helpfulScore} found this helpful
          </span>
        )}
      </div>
    </div>
  );
}

// Lightbox for review images
interface ReviewImageLightboxProps {
  images: ReviewImage[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

export function ReviewImageLightbox({ images, initialIndex, open, onClose }: ReviewImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  if (!open || images.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
        onClick={onClose}
      >
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute top-4 right-4 text-white/70 hover:text-white hover:bg-white/10 z-10"
        >
          <X className="h-6 w-6" />
        </Button>

        {/* Counter */}
        <div className="absolute top-4 left-4 text-white/70 text-sm">
          {currentIndex + 1} / {images.length}
        </div>

        {/* Navigation */}
        {images.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); goToPrevious(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full text-white/70 hover:text-white hover:bg-white/10"
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); goToNext(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full text-white/70 hover:text-white hover:bg-white/10"
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          </>
        )}

        {/* Image */}
        <motion.img
          key={currentIndex}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          src={images[currentIndex].image_url}
          alt={`Review image ${currentIndex + 1}`}
          className="max-h-[85vh] max-w-[90vw] object-contain"
          onClick={(e) => e.stopPropagation()}
        />

        {/* Thumbnails */}
        {images.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {images.map((image, index) => (
              <button
                key={image.id}
                onClick={(e) => { e.stopPropagation(); setCurrentIndex(index); }}
                className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                  index === currentIndex
                    ? 'border-white opacity-100'
                    : 'border-transparent opacity-50 hover:opacity-75'
                }`}
              >
                <img
                  src={image.image_url}
                  alt={`Thumbnail ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

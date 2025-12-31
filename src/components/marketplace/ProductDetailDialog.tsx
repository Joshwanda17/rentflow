import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { 
  Star, 
  Package, 
  Loader2, 
  ShoppingCart,
  MessageSquare,
  User,
  Heart,
  Plus,
  Minus
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url: string | null;
  stock: number;
  agent_id: string;
}

interface Review {
  id: string;
  product_id: string;
  buyer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  buyer_name?: string;
}

interface ProductDetailDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchaseComplete?: () => void;
  isInWishlist?: boolean;
  onWishlistChange?: () => void;
}

export function ProductDetailDialog({ 
  product, 
  open, 
  onOpenChange,
  onPurchaseComplete,
  isInWishlist = false,
  onWishlistChange
}: ProductDetailDialogProps) {
  const { user } = useAuth();
  const { addToCart } = useCart();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [hoverRating, setHoverRating] = useState(0);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);

  useEffect(() => {
    if (product && open) {
      fetchReviews();
      checkCanReview();
      setQuantity(1); // Reset quantity when opening
    }
  }, [product, open]);

  const fetchReviews = async () => {
    if (!product) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('product_reviews')
        .select('*')
        .eq('product_id', product.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Enrich with buyer names
      const enrichedReviews = await Promise.all(
        (data || []).map(async (review) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', review.buyer_id)
            .maybeSingle();

          return {
            ...review,
            buyer_name: profile?.full_name || 'Anonymous',
          };
        })
      );

      setReviews(enrichedReviews);
      
      // Check if user already reviewed
      if (user) {
        const existing = enrichedReviews.find(r => r.buyer_id === user.id);
        setUserReview(existing || null);
        if (existing) {
          setRating(existing.rating);
          setComment(existing.comment || '');
        }
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkCanReview = async () => {
    if (!product || !user) {
      setCanReview(false);
      return;
    }

    // Check if user purchased this product
    const { data } = await supabase
      .from('product_orders')
      .select('id')
      .eq('product_id', product.id)
      .eq('buyer_id', user.id)
      .limit(1);

    setCanReview((data?.length || 0) > 0);
  };

  const handlePurchase = async () => {
    if (!product || !user) return;

    setPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke('product-purchase', {
        body: { productId: product.id, quantity }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast.success('Purchase successful!', {
        description: `You bought ${quantity}x ${product.name} for UGX ${(product.price * quantity).toLocaleString()}`
      });
      onPurchaseComplete?.();
      setCanReview(true);
      setQuantity(1);
    } catch (error: any) {
      toast.error('Purchase failed', { description: error.message });
    } finally {
      setPurchasing(false);
    }
  };

  const handleQuantityChange = (delta: number) => {
    const newQuantity = quantity + delta;
    if (newQuantity >= 1 && newQuantity <= product!.stock) {
      setQuantity(newQuantity);
    }
  };

  const handleQuantityInput = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1 && num <= product!.stock) {
      setQuantity(num);
    } else if (value === '') {
      setQuantity(1);
    }
  };

  const handleSubmitReview = async () => {
    if (!product || !user) return;

    setSubmittingReview(true);
    try {
      if (userReview) {
        // Update existing review
        const { error } = await supabase
          .from('product_reviews')
          .update({ rating, comment: comment || null })
          .eq('id', userReview.id);

        if (error) throw error;
        toast.success('Review updated!');
      } else {
        // Create new review
        const { error } = await supabase
          .from('product_reviews')
          .insert({
            product_id: product.id,
            buyer_id: user.id,
            rating,
            comment: comment || null,
          });

        if (error) throw error;
        toast.success('Review submitted!');
      }

      setShowReviewForm(false);
      fetchReviews();
    } catch (error: any) {
      toast.error('Failed to submit review', { description: error.message });
    } finally {
      setSubmittingReview(false);
    }
  };

  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  const handleWishlistToggle = async () => {
    if (!product || !user) return;

    setWishlistLoading(true);
    try {
      if (isInWishlist) {
        const { error } = await supabase
          .from('wishlists')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', product.id);
        if (error) throw error;
        toast.success('Removed from wishlist');
      } else {
        const { error } = await supabase
          .from('wishlists')
          .insert({ user_id: user.id, product_id: product.id });
        if (error) throw error;
        toast.success('Added to wishlist');
      }
      onWishlistChange?.();
    } catch (error: any) {
      toast.error('Failed to update wishlist');
    } finally {
      setWishlistLoading(false);
    }
  };

  const isOwnProduct = product?.agent_id === user?.id;

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] p-0">
        <ScrollArea className="max-h-[90vh]">
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="sr-only">{product.name}</DialogTitle>
            </DialogHeader>

            {/* Product Image */}
            <div className="aspect-video rounded-lg bg-muted overflow-hidden mb-4">
              {product.image_url ? (
                <img 
                  src={product.image_url} 
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="h-16 w-16 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-xl font-bold">{product.name}</h2>
                <div className="flex items-center gap-2">
                  {user && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleWishlistToggle}
                      disabled={wishlistLoading}
                      className="h-8 w-8"
                    >
                      <Heart 
                        className={`h-5 w-5 ${
                          isInWishlist 
                            ? 'fill-destructive text-destructive' 
                            : 'text-muted-foreground hover:text-destructive'
                        }`}
                      />
                    </Button>
                  )}
                  <Badge className="capitalize shrink-0">{product.category}</Badge>
                </div>
              </div>

              {product.description && (
                <p className="text-muted-foreground">{product.description}</p>
              )}

              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-primary">
                  UGX {product.price.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">
                  {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                </span>
              </div>

              {/* Rating Summary */}
              {reviews.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${
                          star <= Math.round(averageRating)
                            ? 'fill-warning text-warning'
                            : 'text-muted-foreground'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium">{averageRating.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">
                    ({reviews.length} review{reviews.length !== 1 ? 's' : ''})
                  </span>
                </div>
              )}

              {/* Buy Section */}
              {!isOwnProduct && product.stock > 0 && (
                <div className="space-y-3">
                  {/* Quantity Selector */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Quantity</label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleQuantityChange(-1)}
                        disabled={quantity <= 1}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        max={product.stock}
                        value={quantity}
                        onChange={(e) => handleQuantityInput(e.target.value)}
                        className="w-16 h-8 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleQuantityChange(1)}
                        disabled={quantity >= product.stock}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Total Price */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-bold text-lg text-primary">
                      UGX {(product.price * quantity).toLocaleString()}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      className="flex-1" 
                      size="lg"
                      onClick={async () => {
                        setAddingToCart(true);
                        await addToCart(product.id, quantity);
                        setAddingToCart(false);
                      }}
                      disabled={addingToCart}
                    >
                      {addingToCart ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Add to Cart
                        </>
                      )}
                    </Button>
                    <Button 
                      className="flex-1" 
                      size="lg"
                      onClick={handlePurchase}
                      disabled={purchasing}
                    >
                      {purchasing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="mr-2 h-4 w-4" />
                          Buy Now
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {!isOwnProduct && product.stock === 0 && (
                <Button className="w-full" size="lg" disabled>
                  Out of Stock
                </Button>
              )}
            </div>

            <Separator className="my-6" />

            {/* Reviews Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Reviews ({reviews.length})
                </h3>
                {canReview && !showReviewForm && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowReviewForm(true)}
                  >
                    {userReview ? 'Edit Review' : 'Write Review'}
                  </Button>
                )}
              </div>

              {/* Review Form */}
              {showReviewForm && (
                <div className="p-4 rounded-lg bg-secondary/30 border border-border/50 space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Your Rating</label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          className="p-1 transition-transform hover:scale-110"
                        >
                          <Star
                            className={`h-6 w-6 ${
                              star <= (hoverRating || rating)
                                ? 'fill-warning text-warning'
                                : 'text-muted-foreground'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Comment (optional)</label>
                    <Textarea
                      placeholder="Share your experience with this product..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowReviewForm(false)}
                      disabled={submittingReview}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmitReview}
                      disabled={submittingReview}
                      className="flex-1"
                    >
                      {submittingReview ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        userReview ? 'Update Review' : 'Submit Review'
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Reviews List */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No reviews yet</p>
                  {canReview && (
                    <p className="text-xs text-muted-foreground">Be the first to review!</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div 
                      key={review.id}
                      className={`p-4 rounded-lg border ${
                        review.buyer_id === user?.id 
                          ? 'bg-primary/5 border-primary/20' 
                          : 'bg-secondary/30 border-border/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {review.buyer_name}
                              {review.buyer_id === user?.id && (
                                <Badge variant="outline" className="ml-2 text-xs">You</Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(review.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-3 w-3 ${
                                star <= review.rating
                                  ? 'fill-warning text-warning'
                                  : 'text-muted-foreground'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      {review.comment && (
                        <p className="text-sm text-muted-foreground">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

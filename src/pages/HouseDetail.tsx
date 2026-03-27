import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { ImageLightbox } from '@/components/marketplace/ImageLightbox';
import { useParams, useNavigate } from 'react-router-dom';

import { supabase } from '@/integrations/supabase/client';
import { HouseListing } from '@/hooks/useHouseListings';
import { formatUGX } from '@/lib/rentCalculations';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WhatsAppAgentButton } from '@/components/tenant/WhatsAppAgentButton';
import { useHouseReviews } from '@/hooks/useHouseReviews';
import WriteHouseReviewForm from '@/components/reviews/WriteHouseReviewForm';
import HouseReviewsList from '@/components/reviews/HouseReviewsList';
import SaveHouseButton from '@/components/house/SaveHouseButton';
import HouseQASection from '@/components/house/HouseQASection';
import PriceComparison from '@/components/house/PriceComparison';
import VisitBadge from '@/components/house/VisitBadge';
import NearbyAmenities from '@/components/house/NearbyAmenities';
import { motion } from 'framer-motion';
import {
  Home, MapPin, DoorOpen, Droplets, Zap, ShieldCheck, Car, Sofa,
  ChevronLeft, ChevronRight, Clock, ExternalLink, Share2, Check, ArrowLeft, Star,
  Eye,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SITE_URL = 'https://welilereceipts.com';

const CATEGORIES = [
  { value: 'single_room', label: 'Single Room' },
  { value: 'double_room', label: 'Double Room' },
  { value: 'bedsitter', label: 'Bedsitter' },
  { value: 'one_bedroom', label: '1 Bedroom' },
  { value: 'two_bedroom', label: '2 Bedrooms' },
  { value: 'three_bedroom', label: '3 Bedrooms' },
  { value: 'studio', label: 'Studio' },
  { value: 'shop', label: 'Shop' },
];

export default function HouseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [listing, setListing] = useState<(HouseListing & { agent_phone?: string | null; agent_name?: string | null }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgIdx, setImgIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  
  const { reviews, summary, myReview, loading: reviewsLoading, refetch: refetchReviews } = useHouseReviews(id);

  useEffect(() => {
    if (!id) return;
    async function fetchListing() {
      setLoading(true);
      // If id looks like a UUID, query by id; otherwise try short_code
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const query = isUuid
        ? supabase.from('house_listings').select('*').eq('id', id).single()
        : supabase.from('house_listings').select('*').eq('short_code', id).single();

      const { data } = await query;

      if (data) {
        const { data: agent } = await supabase
          .from('profiles')
          .select('phone, full_name')
          .eq('id', data.agent_id)
          .single();

        setListing({
          ...(data as any),
          agent_phone: agent?.phone ?? null,
          agent_name: agent?.full_name ?? null,
        });
      }
      setLoading(false);
    }
    fetchListing();
  }, [id]);

  const shareUrl = `${SITE_URL}/house/${id}`;
  const images = listing?.image_urls || [];
  const lightboxImages = useMemo(() =>
    images.map((url, i) => ({ id: `detail-${i}`, image_url: url })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listing?.id, images.length]
  );

  const handleShare = async () => {
    const shareData = {
      title: listing ? `${listing.title} — Daily Rent | Welile` : 'House for Rent | Welile',
      text: listing
        ? `Check out this house: ${listing.title} in ${listing.region} for ${formatUGX(listing.daily_rate)}/day on Welile!`
        : 'Check out this house on Welile!',
      url: shareUrl,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      const shareText = listing
        ? `🏠 Check out this house on Welile!\n\n*${listing.title}*\n📍 ${listing.region}\n💰 ${formatUGX(listing.daily_rate)}/day\n\n👉 ${shareUrl}`
        : shareUrl;
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Share it with friends & family.' });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const ogTitle = listing ? `${listing.title} — ${formatUGX(listing.daily_rate)}/day | Welile` : 'House for Rent | Welile';
  const ogDescription = listing
    ? `${listing.house_category?.replace(/_/g, ' ')} • ${listing.number_of_rooms} rooms in ${listing.region}. ${formatUGX(listing.daily_rate)}/day. Pay as you stay with Welile!`
    : 'Find affordable daily-rent houses on Welile.';
  const ogImage = listing?.image_urls?.[0] || `${SITE_URL}/og-image.png`;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Skeleton className="h-72 w-full" />
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <Home className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground font-medium">House not found</p>
        <Button variant="outline" onClick={() => navigate('/find-a-house')}>Browse Houses</Button>
      </div>
    );
  }

  const categoryLabel = CATEGORIES.find(c => c.value === listing.house_category)?.label || listing.house_category;
  const isPending = !listing.verified || listing.status === 'pending';
  const mapLink = listing.latitude && listing.longitude
    ? `https://www.google.com/maps/search/?api=1&query=${listing.latitude},${listing.longitude}`
    : null;
  const mapEmbed = listing.latitude && listing.longitude
    ? `https://maps.google.com/maps?q=${listing.latitude},${listing.longitude}&z=15&output=embed`
    : null;

  const amenities = [
    listing.has_water && { icon: Droplets, label: 'Running Water', color: 'text-blue-500' },
    listing.has_electricity && { icon: Zap, label: 'Electricity', color: 'text-amber-500' },
    listing.has_security && { icon: ShieldCheck, label: 'Security', color: 'text-emerald-500' },
    listing.has_parking && { icon: Car, label: 'Parking', color: 'text-violet-500' },
    listing.is_furnished && { icon: Sofa, label: 'Furnished', color: 'text-rose-500' },
  ].filter(Boolean) as { icon: any; label: string; color: string }[];

  return (
    <>
      <Helmet>
        <title>{ogTitle}</title>
        <meta name="description" content={ogDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={shareUrl} />
        <meta property="og:title" content={ogTitle} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="Welile" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={ogTitle} />
        <meta name="twitter:description" content={ogDescription} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>
      <div className="min-h-screen bg-background pb-28">
        {/* ── Full-bleed Hero Image Gallery ── */}
        <div className="relative w-full">
          {images.length > 0 ? (
            <>
              {/* Main hero image — edge-to-edge */}
              <div
                className="relative w-full h-[55vh] min-h-[320px] max-h-[520px] bg-muted cursor-pointer"
                onClick={() => setLightboxOpen(true)}
              >
                <img
                  src={images[imgIdx]}
                  alt={listing.title}
                  className="w-full h-full object-cover"
                />
                {/* Gradient scrim for top controls */}
                <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/50 to-transparent" />

                {/* Carousel nav */}
                {images.length > 1 && (
                  <>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); setImgIdx(i => (i - 1 + images.length) % images.length); }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm text-foreground rounded-full p-2 shadow-lg active:scale-95 transition-transform">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); setImgIdx(i => (i + 1) % images.length); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm text-foreground rounded-full p-2 shadow-lg active:scale-95 transition-transform">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    {/* Dots */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {images.map((_, i) => (
                        <button key={i} onClick={(e) => { e.stopPropagation(); setImgIdx(i); }}
                          className={`w-2 h-2 rounded-full transition-all ${i === imgIdx ? 'bg-white w-5' : 'bg-white/50'}`} />
                      ))}
                    </div>
                  </>
                )}

                {/* Photo count badge */}
                <button
                  onClick={(e) => { e.stopPropagation(); setLightboxOpen(true); }}
                  className="absolute bottom-4 right-4 bg-background/90 backdrop-blur-sm text-foreground text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-md border border-border"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {images.length} photo{images.length !== 1 ? 's' : ''}
                </button>
              </div>

              {/* Thumbnail strip — scroll horizontally */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide bg-background">
                  {images.map((url, i) => (
                    <button key={i}
                      onClick={() => setImgIdx(i)}
                      className={`flex-shrink-0 w-[72px] h-[72px] rounded-xl overflow-hidden transition-all active:scale-95 ${i === imgIdx ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-105' : 'opacity-50 hover:opacity-100'}`}>
                      <img src={url} alt={`${listing.title} ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}

              <ImageLightbox
                images={lightboxImages}
                initialIndex={imgIdx}
                open={lightboxOpen}
                onClose={() => setLightboxOpen(false)}
                productName={listing.title}
              />
            </>
          ) : (
            <div className="w-full h-48 bg-muted flex items-center justify-center">
              <Home className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}

          {/* Floating top controls */}
          <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 pt-safe-top py-3">
            <button onClick={() => navigate(-1)}
              className="bg-background/80 backdrop-blur-sm text-foreground rounded-full p-2.5 shadow-lg active:scale-95 transition-transform">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <SaveHouseButton houseId={listing.id} variant="icon" />
              <button onClick={handleShare}
                className="bg-background/80 backdrop-blur-sm text-foreground rounded-full p-2.5 shadow-lg active:scale-95 transition-transform">
                {copied ? <Check className="h-5 w-5 text-success" /> : <Share2 className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        <main className="max-w-2xl mx-auto px-4 space-y-5 -mt-3 relative z-10">
          {/* Title card — overlaps hero slightly */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="bg-card rounded-2xl border border-border shadow-lg p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-lg leading-snug text-wrap-balance">{listing.title}</h1>
                <div className="flex items-center gap-1.5 mt-1">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm text-muted-foreground truncate">
                    {listing.address}, {listing.region}{listing.district ? `, ${listing.district}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {isPending ? (
                  <Badge variant="outline" className="text-[10px] bg-warning/15 text-warning border-warning/30 gap-0.5">
                    <Clock className="h-3 w-3" /> Pending
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-success/15 text-success border-success/30 gap-0.5">
                    <ShieldCheck className="h-3 w-3" /> Verified
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[10px]">{categoryLabel}</Badge>
              </div>
            </div>

            {/* Rating summary inline */}
            {summary.totalReviews > 0 && (
              <div className="flex items-center gap-1.5 text-sm">
                <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                <span className="font-bold">{summary.averageRating.toFixed(1)}</span>
                <span className="text-muted-foreground">· {summary.totalReviews} review{summary.totalReviews !== 1 ? 's' : ''}</span>
              </div>
            )}
          </motion.div>

          {/* ── Daily Rate — hero CTA card ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border-2 border-success/30 bg-gradient-to-br from-success/15 via-success/5 to-transparent p-5"
          >
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Daily Rent</p>
            <p className="text-4xl font-black text-success leading-none">{formatUGX(listing.daily_rate)}</p>
            <p className="text-sm text-muted-foreground mt-1 font-medium">per day · pay as you stay</p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <VisitBadge reviewCount={summary.totalReviews} />
              <PriceComparison region={listing.region} category={listing.house_category} dailyRate={listing.daily_rate} houseId={listing.id} />
            </div>
          </motion.div>

          {/* ── Room & Amenities grid ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            <h2 className="font-bold text-sm text-foreground">What this place offers</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50 border border-border">
                <DoorOpen className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-bold text-sm">{listing.number_of_rooms}</p>
                  <p className="text-[11px] text-muted-foreground">Room{listing.number_of_rooms > 1 ? 's' : ''}</p>
                </div>
              </div>
              {amenities.map((a, i) => (
                <div key={i} className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50 border border-border">
                  <a.icon className={`h-5 w-5 ${a.color}`} />
                  <p className="font-medium text-sm">{a.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── Description ── */}
          {listing.description && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className="font-bold text-sm text-foreground mb-2">About this place</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{listing.description}</p>
            </motion.div>
          )}

          {/* ── Map ── */}
          {mapEmbed && mapLink && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className="font-bold text-sm text-foreground mb-2">Location</h2>
              <a href={mapLink} target="_blank" rel="noopener noreferrer"
                className="block relative w-full h-44 rounded-2xl overflow-hidden bg-muted border border-border group">
                <iframe src={mapEmbed} className="w-full h-full pointer-events-none" title={`Map: ${listing.title}`} loading="lazy" style={{ border: 0 }} />
                <div className="absolute bottom-3 right-3 bg-card/90 backdrop-blur-sm text-foreground text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-border shadow-sm group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <ExternalLink className="h-3 w-3" /> Open in Maps
                </div>
              </a>
            </motion.div>
          )}

          {/* ── Nearby Amenities ── */}
          <NearbyAmenities latitude={listing.latitude} longitude={listing.longitude} />

          {/* ── Agent card ── */}
          {listing.agent_name && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <h2 className="font-bold text-sm text-foreground mb-3">Your Agent</h2>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-base">
                  {listing.agent_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{listing.agent_name}</p>
                  <p className="text-xs text-muted-foreground">Welile Agent · Tap below to chat</p>
                </div>
              </div>
              <div className="mt-3">
                <WhatsAppAgentButton phone={listing.agent_phone} agentName={listing.agent_name} houseTitle={listing.title} />
              </div>
            </motion.div>
          )}

          {/* ── Q&A ── */}
          <HouseQASection houseId={listing.id} agentId={listing.agent_id} />

          {/* ── Reviews ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
              <h2 className="font-bold text-sm">
                Reviews
                {summary.totalReviews > 0 && (
                  <span className="text-muted-foreground font-normal text-xs ml-1.5">
                    {summary.averageRating.toFixed(1)} · {summary.totalReviews} review{summary.totalReviews !== 1 ? 's' : ''}
                  </span>
                )}
              </h2>
            </div>
            <WriteHouseReviewForm
              houseId={listing.id}
              houseTitle={listing.title}
              existingReview={myReview}
              houseLat={listing.latitude}
              houseLng={listing.longitude}
              onSuccess={refetchReviews}
            />
            <HouseReviewsList reviews={reviews} summary={summary} loading={reviewsLoading} />
          </motion.div>
        </main>

        {/* ── Sticky bottom CTA bar ── */}
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border z-40">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium">Daily Rent</p>
              <p className="text-lg font-black text-success leading-tight">{formatUGX(listing.daily_rate)}<span className="text-xs font-medium text-muted-foreground">/day</span></p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <WhatsAppAgentButton phone={listing.agent_phone} agentName={listing.agent_name} houseTitle={listing.title} />
              <button onClick={handleShare}
                className="h-11 w-11 rounded-xl border border-border bg-card flex items-center justify-center active:scale-95 transition-transform">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Share2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

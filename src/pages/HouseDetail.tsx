import { useState, useEffect, useMemo } from 'react';
import { ImageLightbox } from '@/components/marketplace/ImageLightbox';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
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
import {
  Home, MapPin, DoorOpen, Droplets, Zap, ShieldCheck, Car, Sofa,
  ChevronLeft, ChevronRight, Clock, ExternalLink, Share2, Copy, Check, ArrowLeft, Star,
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

  useEffect(() => {
    if (!id) return;
    async function fetch() {
      setLoading(true);
      const { data } = await supabase
        .from('house_listings')
        .select('*')
        .eq('id', id)
        .single();

      if (data) {
        // Enrich with agent info
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
    fetch();
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
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Share it with friends & family.' });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-24 w-full rounded-2xl" />
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

  const pageTitle = `${listing.title} — ${formatUGX(listing.daily_rate)}/day | Welile`;
  const pageDesc = `${categoryLabel} in ${listing.region}${listing.district ? `, ${listing.district}` : ''} — ${formatUGX(listing.daily_rate)} per day. Pay as you stay with Welile.`;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDesc} />
        <link rel="canonical" href={shareUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:url" content={shareUrl} />
        {images[0] && <meta property="og:image" content={images[0]} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDesc} />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Accommodation',
          name: listing.title,
          description: listing.description,
          address: `${listing.address}, ${listing.region}`,
          ...(listing.latitude && listing.longitude ? {
            geo: { '@type': 'GeoCoordinates', latitude: listing.latitude, longitude: listing.longitude }
          } : {}),
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-background pb-24">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
              {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              {copied ? 'Copied' : 'Share'}
            </Button>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
          {/* Image carousel */}
          {images.length > 0 ? (
            <>
              <div className="relative w-full h-56 rounded-2xl overflow-hidden bg-muted">
                <img
                  src={images[imgIdx]}
                  alt={listing.title}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setLightboxOpen(true)}
                />
                {images.length > 1 && (
                  <>
                    <button type="button" onClick={() => setImgIdx(i => (i - 1 + images.length) % images.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1.5">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button type="button" onClick={() => setImgIdx(i => (i + 1) % images.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1.5">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {images.map((_, i) => (
                        <span key={i} className={`w-2 h-2 rounded-full ${i === imgIdx ? 'bg-white' : 'bg-white/50'}`} />
                      ))}
                    </div>
                    <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                      {imgIdx + 1}/{images.length} · Tap to view
                    </span>
                  </>
                )}
                <Badge variant="secondary" className="absolute top-3 right-3">{categoryLabel}</Badge>
              </div>

              {/* Thumbnail strip */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {images.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => { setImgIdx(i); setLightboxOpen(true); }}
                      className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${i === imgIdx ? 'border-primary' : 'border-transparent hover:border-primary/50'}`}
                    >
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
            <div className="w-full h-40 rounded-2xl bg-muted flex items-center justify-center">
              <Home className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}

          {/* Title & Location */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <h1 className="font-bold text-xl">{listing.title}</h1>
              {isPending ? (
                <Badge variant="outline" className="text-[10px] bg-warning/15 text-warning border-warning/30 gap-1 shrink-0">
                  <Clock className="h-3 w-3" /> Pending
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] bg-success/15 text-success border-success/30 gap-1 shrink-0">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">
                {listing.address}, {listing.region}{listing.district ? `, ${listing.district}` : ''}
              </p>
            </div>
          </div>

          {/* Daily Rate */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-success/20 to-success/10 border-2 border-success/30">
            <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Daily Rent</p>
            <p className="text-4xl font-black text-success leading-none mb-1">{formatUGX(listing.daily_rate)}</p>
            <p className="text-sm text-muted-foreground font-medium">per day · pay as you stay</p>
          </div>

          {/* Specs */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-sm">
              <DoorOpen className="h-3.5 w-3.5" /> {listing.number_of_rooms} room{listing.number_of_rooms > 1 ? 's' : ''}
            </span>
            {listing.has_water && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-sm"><Droplets className="h-3.5 w-3.5" /> Water</span>}
            {listing.has_electricity && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-warning/10 text-warning text-sm"><Zap className="h-3.5 w-3.5" /> Power</span>}
            {listing.has_security && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-success/10 text-success text-sm"><ShieldCheck className="h-3.5 w-3.5" /> Security</span>}
            {listing.has_parking && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent text-accent-foreground text-sm"><Car className="h-3.5 w-3.5" /> Parking</span>}
            {listing.is_furnished && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground text-sm"><Sofa className="h-3.5 w-3.5" /> Furnished</span>}
          </div>

          {/* Description */}
          {listing.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{listing.description}</p>
          )}

          {/* Map */}
          {mapEmbed && mapLink && (
            <a href={mapLink} target="_blank" rel="noopener noreferrer"
              className="block relative w-full h-40 rounded-2xl overflow-hidden bg-muted border border-border group">
              <iframe src={mapEmbed} className="w-full h-full pointer-events-none" title={`Map: ${listing.title}`} loading="lazy" style={{ border: 0 }} />
              <div className="absolute bottom-2 right-2 bg-card/90 backdrop-blur-sm text-foreground text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1 border border-border shadow-sm group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <ExternalLink className="h-3 w-3" /> Open in Maps
              </div>
            </a>
          )}

          {/* WhatsApp Agent */}
          <WhatsAppAgentButton phone={listing.agent_phone} agentName={listing.agent_name} houseTitle={listing.title} />
        </main>

        {/* Fixed footer */}
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border p-3 z-40">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <div className="flex-1">
              <WhatsAppAgentButton phone={listing.agent_phone} agentName={listing.agent_name} houseTitle={listing.title} />
            </div>
            <Button variant="outline" size="lg" onClick={handleShare} className="shrink-0">
              <Share2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

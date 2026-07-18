import { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Helmet } from 'react-helmet-async';
import { ImageLightbox } from '@/components/marketplace/ImageLightbox';
import { useSearchParams, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadMoreProgress } from '@/components/tenant/LoadMoreProgress';
import { Button } from '@/components/ui/button';
import {
  Search, MapPin, ShieldCheck, Home, DoorOpen,
  ChevronLeft, ChevronRight, Clock, ExternalLink, Share2, Copy, Check, ZoomIn, Navigation,
  SlidersHorizontal, X, Droplets, Zap, Lock, Car, Sofa, ArrowDownUp, Loader2, ArrowRight,
  Map as MapIcon, List as ListIcon, Route, Footprints, ArrowLeft
} from 'lucide-react';
import { WhatsAppAgentButton } from '@/components/tenant/WhatsAppAgentButton';
import { ShareHouseButton } from '@/components/tenant/ShareHouseButton';
import HouseRatingBadge from '@/components/house/HouseRatingBadge';
import { useNearbyHouses, useHouseListingCount, HouseListing } from '@/hooks/useHouseListings';
import { HouseListingCount } from '@/components/tenant/HouseListingCount';
import { useGeolocation } from '@/hooks/useGeolocation';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useMapLinkAnnouncer } from '@/hooks/useMapLinkAnnouncer';
import { regionLabel } from '@/lib/ugandaDistricts';
import { cn } from '@/lib/utils';
import { resolveHouseCoords, buildDirectionsUrl, distanceToHouse, estimateRoute, TravelMode } from '@/lib/houseGeo';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useWindowVirtualizer } from '@tanstack/react-virtual';

// Leaflet + tiles are heavy; only load the map bundle when the user opens it.
const HouseMapView = lazy(() =>
  import('@/components/tenant/HouseMapView').then((m) => ({ default: m.HouseMapView }))
);

const REGIONS = [
  'All Regions', 'Central', 'Eastern', 'Northern', 'Western',
  'Kampala', 'Wakiso', 'Mukono', 'Jinja', 'Mbale',
  'Mbarara', 'Gulu', 'Lira', 'Fort Portal', 'Masaka',
  'Entebbe', 'Nansana', 'Kira', 'Bweyogerere',
];

const CATEGORIES = [
  { value: 'all', label: 'All Types' },
  { value: 'single_room', label: 'Single Room' },
  { value: 'double_room', label: 'Double Room' },
  { value: 'bedsitter', label: 'Bedsitter' },
  { value: 'one_bedroom', label: '1 Bedroom' },
  { value: 'two_bedroom', label: '2 Bedrooms' },
  { value: 'three_bedroom', label: '3 Bedrooms' },
  { value: 'studio', label: 'Studio' },
  { value: 'shop', label: 'Shop' },
];

const SITE_URL = 'https://welileapp.com';

// Location landing pages: /find-a-house/:regionSlug -> region-scoped SEO page.
// Keep the slug list narrow and matched to the REGIONS array so Google gets
// crisp, high-intent pages (e.g. "houses for rent in Kampala") without
// exploding the sitemap. New entries here also need to be added to
// scripts/generate-sitemap.ts.
export const REGION_LANDING_SLUGS: Record<string, string> = {
  kampala: 'Kampala',
  wakiso: 'Wakiso',
  mukono: 'Mukono',
  jinja: 'Jinja',
  mbale: 'Mbale',
  mbarara: 'Mbarara',
  gulu: 'Gulu',
  lira: 'Lira',
  'fort-portal': 'Fort Portal',
  masaka: 'Masaka',
  entebbe: 'Entebbe',
  nansana: 'Nansana',
  kira: 'Kira',
  bweyogerere: 'Bweyogerere',
  central: 'Central',
  eastern: 'Eastern',
  northern: 'Northern',
  western: 'Western',
};

type SortKey = 'price_asc' | 'price_desc' | 'newest' | 'nearest';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest first' },
  { value: 'nearest', label: 'Nearest first' },
];

const AMENITY_FILTERS = [
  { key: 'has_water', label: 'Water', icon: Droplets },
  { key: 'has_electricity', label: 'Power', icon: Zap },
  { key: 'has_security', label: 'Security', icon: Lock },
  { key: 'has_parking', label: 'Parking', icon: Car },
  { key: 'is_furnished', label: 'Furnished', icon: Sofa },
] as const;

type AmenityKey = typeof AMENITY_FILTERS[number]['key'];

function HouseImageCarousel({ images, title, onImageClick, layout = 'vertical' }: { images: string[] | null; title: string; onImageClick?: (index: number) => void; layout?: 'vertical' | 'horizontal' }) {
  const [idx, setIdx] = useState(0);
  // In horizontal (Booking-style) row cards the image fills the full height of
  // the left column on desktop; on mobile it falls back to the 5/4 ratio.
  const sizeClass = layout === 'horizontal'
    ? 'aspect-[5/4] md:aspect-auto md:h-full md:min-h-[280px]'
    : 'aspect-[5/4]';
  if (!images || images.length === 0) {
    return (
      <div className={`w-full ${sizeClass} bg-muted flex items-center justify-center`}>
        <Home className="h-12 w-12 text-muted-foreground/20" />
      </div>
    );
  }
  return (
    <div className={`relative w-full ${sizeClass} overflow-hidden bg-muted group`}>
      <img
        src={images[idx]}
        alt={title}
        className="w-full h-full object-cover cursor-pointer transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
        decoding="async"
        onClick={() => onImageClick?.(idx)}
      />
      {/* Subtle gradient for badge legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/15 pointer-events-none" />
      {/* Compact full-screen hint, bottom-right */}
      <button
        type="button"
        onClick={() => onImageClick?.(idx)}
        aria-label="View photos full screen"
        className="absolute bottom-4 right-4 bg-black/45 backdrop-blur-md text-white p-3 rounded-2xl shadow-lg active:scale-95 transition-transform"
      >
        <ZoomIn className="h-5 w-5" />
      </button>
      {images.length > 1 && (
        <>
          <button type="button" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); setIdx(i => (i - 1 + images.length) % images.length); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/45 backdrop-blur-md text-white rounded-full p-2 min-w-[40px] min-h-[40px] flex items-center justify-center active:scale-95 transition-transform">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); setIdx(i => (i + 1) % images.length); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/45 backdrop-blur-md text-white rounded-full p-2 min-w-[40px] min-h-[40px] flex items-center justify-center active:scale-95 transition-transform">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute top-1/2 right-16 -translate-y-1/2 hidden" aria-hidden="true" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <span key={i} className={`h-2 rounded-full transition-all ${i === idx ? 'bg-white w-5' : 'bg-white/50 w-2'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LocationMap({ listing, anchorId, travelMode = 'driving' }: { listing: HouseListing; anchorId?: string; travelMode?: TravelMode }) {
  const announce = useMapLinkAnnouncer();
  const containerRef = useRef<HTMLAnchorElement | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const resolved = resolveHouseCoords(listing);
  const lat = resolved?.lat ?? null;
  const lng = resolved?.lng ?? null;
  const approximate = resolved?.approximate ?? false;
  const title = listing.title;
  const directionsUrl = buildDirectionsUrl(listing, travelMode);

  // Only mount the (heavy) Google Maps iframe once the card actually enters the
  // viewport. The virtualizer keeps a few off-screen rows mounted for smooth
  // scrolling; this avoids those rows loading map iframes until truly visible.
  useEffect(() => {
    if (mapVisible) return; // already mounted — keep it mounted to avoid reload flicker
    const el = containerRef.current;
    if (!el || !lat || !lng) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setMapVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [lat, lng, mapVisible]);

  if (!lat || !lng) return null;
  const mapUrl = `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
  return (
    <a ref={containerRef} href={directionsUrl} id={anchorId} target="_blank" rel="noopener noreferrer"
      onClick={() => announce(title)}
      aria-label={`Get directions to ${title} in Google Maps (opens in a new tab)`}
      className="block relative w-full h-32 rounded-xl overflow-hidden bg-muted border-2 border-primary/40 ring-2 ring-primary/20 shadow-md active:scale-[0.99] transition-transform focus:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      {mapVisible ? (
        <iframe src={mapUrl} className="w-full h-full pointer-events-none" title={`Map: ${title}`} loading="lazy" style={{ border: 0 }} />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-muted" aria-hidden="true">
          <Skeleton className="absolute inset-0 w-full h-full rounded-xl" />
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-muted-foreground/10 flex items-center justify-center animate-pulse">
              <MapPin className="h-5 w-5 text-muted-foreground/60" />
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Loading map…</span>
          </div>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent pointer-events-none" />
      {approximate && (
        <div className="absolute top-2 left-2 bg-background/85 backdrop-blur-md text-foreground text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
          Approximate area
        </div>
      )}
      <div className="absolute bottom-2 left-2 right-2 mx-auto w-fit min-h-[44px] bg-primary text-primary-foreground text-sm font-bold px-5 py-2.5 rounded-full flex items-center gap-2 shadow-xl touch-manipulation">
        <Navigation className="h-4 w-4" /> Get directions
      </div>
    </a>
  );
}

function VerificationBadge({ verified, status }: { verified?: boolean | null; status: string }) {
  const isPending = !verified || status === 'pending';
  if (isPending) {
    return (
      <Badge variant="outline" className="text-[10px] bg-warning/15 text-warning border-warning/30 gap-1">
        <Clock className="h-3 w-3" /> Pending Verification
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] bg-success/15 text-success border-success/30 gap-1">
      <ShieldCheck className="h-3 w-3" /> Verified
    </Badge>
  );
}

function PublicHouseCard({ listing, isFirst, onOpenDetails, userLat, userLng }: { listing: HouseListing; isFirst?: boolean; onOpenDetails?: (listing: HouseListing) => void; userLat?: number | null; userLng?: number | null }) {
  const categoryLabel = CATEGORIES.find(c => c.value === listing.house_category)?.label || listing.house_category;
  const dist = listing.distance_km;
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const [travelMode, setTravelMode] = useState<TravelMode>('driving');

  const lightboxImages = useMemo(() =>
    (listing.image_urls || []).map((url, i) => ({ id: `${listing.id}-${i}`, image_url: url })),
    [listing.image_urls, listing.id]
  );

  const openLightbox = useCallback((index: number) => {
    setLightboxIdx(index);
    setLightboxOpen(true);
  }, []);
  const announce = useMapLinkAnnouncer();
  const directionsUrl = useMemo(() => buildDirectionsUrl(listing, travelMode), [listing, travelMode]);

  // Estimated route distance + time from the viewer to this house, shown
  // before they open turn-by-turn navigation. Derived locally (no API call).
  const routeEstimate = useMemo(
    () => (userLat != null && userLng != null ? estimateRoute(listing, userLat, userLng, travelMode) : null),
    [listing, userLat, userLng, travelMode]
  );

  // "New" badge for listings created within the last 14 days.
  const isNew = useMemo(() => {
    if (!listing.created_at) return false;
    return Date.now() - new Date(listing.created_at).getTime() < 14 * 86400000;
  }, [listing.created_at]);

  const amenities = [
    listing.has_water && { label: 'Water', dot: 'bg-blue-500' },
    listing.has_electricity && { label: 'Power', dot: 'bg-amber-400' },
    listing.has_security && { label: 'Security', dot: 'bg-success' },
    listing.has_parking && { label: 'Parking', dot: 'bg-violet-500' },
    listing.is_furnished && { label: 'Furnished', dot: 'bg-rose-400' },
  ].filter(Boolean) as { label: string; dot: string }[];

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      data-house-card=""
      data-house-id={listing.id}
      className="rounded-3xl border border-border/60 bg-card overflow-hidden shadow-xl shadow-foreground/5 flex flex-col md:flex-row"
      itemScope itemType="https://schema.org/Accommodation"
    >
      {/* LEFT: photo column (full height on desktop, Booking.com row style) */}
      <div className="relative md:w-[340px] md:shrink-0">
        <HouseImageCarousel images={listing.image_urls} title={listing.title} onImageClick={openLightbox} layout="horizontal" />

        {/* Top-left floating badges */}
        <div className="absolute top-4 left-4 flex flex-wrap gap-2">
          {isNew && (
            <span className="bg-primary text-primary-foreground text-[10px] font-extrabold uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg">New</span>
          )}
          <span className="bg-background/85 backdrop-blur-md text-foreground text-[10px] font-extrabold uppercase tracking-widest px-3 py-1.5 rounded-full shadow-sm">{categoryLabel}</span>
          {dist !== undefined && dist < 9999 && (
            <span className="bg-background/85 backdrop-blur-md text-foreground text-[10px] font-bold px-3 py-1.5 rounded-full shadow-sm">
              ~{dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`} away
            </span>
          )}
        </div>

        {/* Floating daily price card, bottom-left */}
        <div className="absolute bottom-4 left-4 bg-success text-success-foreground px-4 py-3 rounded-2xl shadow-xl shadow-success/30 backdrop-blur-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide opacity-80 mb-0.5">Daily Stay</p>
          <p className="text-2xl font-black leading-none" itemProp="price">{formatUGX(listing.daily_rate)}</p>
        </div>

        <HouseRatingBadge houseId={listing.id} houseLat={listing.latitude} houseLng={listing.longitude} className="absolute top-4 right-4" />
      </div>

      {/* MIDDLE + RIGHT: details and price/action panel */}
      <div className="flex-1 flex flex-col lg:flex-row min-w-0">
      <div className="flex-1 min-w-0 p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {onOpenDetails ? (
              <button
                type="button"
                onClick={() => onOpenDetails(listing)}
                className="text-left w-full active:scale-[0.99] transition-transform touch-manipulation"
              >
                <h2 className="font-bold text-lg tracking-tight leading-tight truncate hover:text-primary transition-colors" itemProp="name">{listing.title}</h2>
              </button>
            ) : (
              <h2 className="font-bold text-lg tracking-tight leading-tight truncate" itemProp="name">{listing.title}</h2>
            )}
            <div className="flex items-center gap-1 mt-1" itemProp="address">
              <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground font-medium truncate">
                {listing.address}, {listing.region}
                {listing.district ? `, ${listing.district}` : ''}
              </p>
            </div>
          </div>
          <VerificationBadge verified={listing.verified} status={listing.status} />
        </div>

        {/* Amenity indicator grid */}
        {amenities.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5">
            {amenities.slice(0, 6).map((a) => (
              <div key={a.label} className="bg-muted/60 rounded-2xl p-3 border border-border/60 flex flex-col items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${a.dot}`} />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">{a.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Thumbnail strip — tap any to open fullscreen */}
        {lightboxImages.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
            {lightboxImages.map((img, i) => (
              <button
                key={img.id}
                onClick={() => openLightbox(i)}
                className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 border-transparent hover:border-primary active:scale-95 transition-all"
              >
                <img src={img.image_url} alt={`${listing.title} ${i + 1}`} className="w-full h-full object-cover" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        )}

        {listing.description && <p className="text-xs text-muted-foreground line-clamp-2" itemProp="description">{listing.description}</p>}

        <LocationMap listing={listing} anchorId={isFirst ? 'first-map-cta' : undefined} travelMode={travelMode} />
      </div>

      {/* RIGHT: price + actions panel (Booking.com style) */}
      <div className="lg:w-60 lg:shrink-0 lg:border-l border-t lg:border-t-0 border-border/60 p-5 flex flex-col gap-3 lg:justify-between bg-muted/20">
        <div className="flex items-center justify-between lg:flex-col lg:items-start gap-2">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Monthly</p>
            <p className="text-xl font-black text-foreground tracking-tight">{formatUGX(listing.monthly_rent)}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-xs font-semibold text-muted-foreground w-fit">
            <DoorOpen className="h-3.5 w-3.5" /> {listing.number_of_rooms} room{listing.number_of_rooms > 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {/* Travel mode toggle — choose driving or walking before navigating */}
          {routeEstimate && (
            <div className="flex items-center justify-center gap-0 w-full" role="group" aria-label="Travel mode">
              <button
                type="button"
                onClick={() => setTravelMode('driving')}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-l-xl px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-bold transition-colors border min-w-0 overflow-hidden",
                  travelMode === 'driving'
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                )}
                aria-pressed={travelMode === 'driving'}
              >
                <Car className="h-3 w-3 md:h-3.5 md:w-3.5 shrink-0" />
                <span className="truncate">Driving</span>
              </button>
              <button
                type="button"
                onClick={() => setTravelMode('walking')}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-r-xl px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-bold transition-colors border-y border-r min-w-0 overflow-hidden",
                  travelMode === 'walking'
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                )}
                aria-pressed={travelMode === 'walking'}
              >
                <Footprints className="h-3 w-3 md:h-3.5 md:w-3.5 shrink-0" />
                <span className="truncate">Walking</span>
              </button>
            </div>
          )}

          {/* Estimated route summary — desktop shows labels; mobile goes icon-only/value-inline to prevent wrapping */}
          {routeEstimate && (
            <div className="rounded-2xl border border-border/60 bg-background/60 px-2 md:px-3 py-2 md:py-2.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1.5 md:gap-x-3 gap-y-1 overflow-hidden">
              <div className="flex flex-col min-w-0 md:items-start items-start overflow-hidden">
                <span className="hidden md:block text-[10px] font-semibold text-muted-foreground uppercase tracking-tight leading-none truncate w-full">Distance</span>
                <div className="flex items-center gap-1 min-w-0 w-full mt-0 md:mt-0.5">
                  <Route className="h-3.5 w-3.5 text-primary md:hidden shrink-0" />
                  <span className="text-xs md:text-sm lg:text-base font-black text-foreground tabular-nums leading-tight truncate">
                    {routeEstimate.approximate ? '~' : ''}{routeEstimate.distanceLabel}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-center min-w-0 px-1 overflow-hidden">
                <span className="hidden md:block text-[10px] font-semibold text-muted-foreground uppercase tracking-tight leading-none truncate w-full text-center">Mode</span>
                <div className="flex items-center justify-center gap-1 min-w-0 w-full mt-0 md:mt-0.5">
                  {travelMode === 'driving' ? (
                    <Car className="h-3 w-3 md:h-3.5 md:w-3.5 text-primary shrink-0" />
                  ) : (
                    <Footprints className="h-3 w-3 md:h-3.5 md:w-3.5 text-primary shrink-0" />
                  )}
                  <span className="hidden md:inline text-xs font-bold text-foreground uppercase tracking-tight truncate">
                    {travelMode === 'driving' ? 'Drive' : 'Walk'}
                  </span>
                </div>
              </div>
              <div className="flex flex-col min-w-0 md:items-end items-end overflow-hidden">
                <span className="hidden md:block text-[10px] font-semibold text-muted-foreground uppercase tracking-tight leading-none truncate w-full text-right">Time</span>
                <div className="flex items-center justify-end gap-1 min-w-0 w-full mt-0 md:mt-0.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground md:hidden shrink-0" />
                  <span className="text-xs md:text-sm lg:text-base font-black text-muted-foreground tabular-nums leading-tight truncate">
                    {routeEstimate.approximate ? '~' : ''}{routeEstimate.durationLabel}
                  </span>
                </div>
              </div>
            </div>
          )}
          {/* Get directions — opens Google Maps turn-by-turn navigation */}
          <Button asChild variant="outline" className="w-full gap-1.5 font-bold">
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => announce(listing.title)}
              aria-label={`Get ${travelMode} directions to ${listing.title}`}
            >
              <Navigation className="h-4 w-4" /> Get directions
            </a>
          </Button>

          {/* View full details — opens the house detail page (keeps list filters) */}
          {onOpenDetails && (
            <Button
              variant="default"
              className="w-full gap-1.5 font-bold"
              onClick={() => onOpenDetails(listing)}
            >
              View full details <ArrowRight className="h-4 w-4" />
            </Button>
          )}

          {/* WhatsApp Agent */}
          <WhatsAppAgentButton phone={listing.agent_phone} agentName={listing.agent_name} houseTitle={listing.title} />

          {/* Share */}
          <ShareHouseButton listingId={listing.id} title={listing.title} region={listing.region} dailyRate={listing.daily_rate} shortCode={listing.short_code} variant="full" address={listing.address} monthlyRent={listing.monthly_rent} rooms={listing.number_of_rooms} category={listing.house_category} />
        </div>
      </div>
      </div>

      {/* Fullscreen Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxIdx}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        productName={listing.title}
        memoryKey={`house:${listing.id}`}
      />
    </motion.article>
  );
}

/**
 * Window-scroll virtualized list of house cards. Only the cards in (or near) the
 * viewport are mounted, so the page stays fast even with hundreds of listings —
 * crucial because each card mounts a Google Map iframe + multiple images.
 * Heights are measured dynamically since cards vary (amenities, description, thumbnails).
 */
function VirtualHouseList({ listings, onOpenDetails, userLat, userLng }: { listings: HouseListing[]; onOpenDetails?: (listing: HouseListing) => void; userLat?: number | null; userLng?: number | null }) {
  const listRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useWindowVirtualizer({
    count: listings.length,
    estimateSize: () => 480,
    overscan: 3,
    gap: 12,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    getItemKey: (index) => listings[index].id,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div ref={listRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {items.map((vi) => {
        const listing = listings[vi.index];
        return (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)` }}
          >
            <PublicHouseCard listing={listing} isFirst={vi.index === 0} onOpenDetails={onOpenDetails} userLat={userLat} userLng={userLng} />
          </div>
        );
      })}
    </div>
  );
}

export default function FindAHouse() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { regionSlug } = useParams<{ regionSlug?: string }>();
  const landingRegion = regionSlug ? REGION_LANDING_SLUGS[regionSlug.toLowerCase()] : undefined;
  const isLandingPage = !!landingRegion;
  const geo = useGeolocation(true);
  const [searchText, setSearchText] = useState(() => searchParams.get('q') || '');
  const [selectedRegion, setSelectedRegion] = useState(() => {
    if (landingRegion) return landingRegion;
    const r = searchParams.get('region');
    return r && REGIONS.includes(r) ? r : 'All Regions';
  });
  const [selectedCategory, setSelectedCategory] = useState(() => searchParams.get('category') || 'all');
  // Cascading location filters (region -> district -> sub-county/area -> village).
  // Options are derived from the loaded listings so they only show areas that
  // actually have houses. Works for both tenant and funder views.
  const [selectedDistrict, setSelectedDistrict] = useState(() => searchParams.get('district') || 'all');
  const [selectedSubCounty, setSelectedSubCounty] = useState(() => searchParams.get('subcounty') || 'all');
  const [selectedVillage, setSelectedVillage] = useState(() => searchParams.get('village') || 'all');
  // If the URL already carries a region (restored filtered list / shared link),
  // skip the geolocation auto-default so we don't override the chosen region.
  const [geoDefaultApplied, setGeoDefaultApplied] = useState(() => {
    if (landingRegion) return true;
    const r = searchParams.get('region');
    return !!(r && REGIONS.includes(r));
  });
  const [copied, setCopied] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>(() => (searchParams.get('sort') as SortKey) || 'price_asc');
  const [verifiedOnly, setVerifiedOnly] = useState(() => searchParams.get('verified') === '1');
  const [maxDaily, setMaxDaily] = useState<string>(() => searchParams.get('max') || 'all');
  const [activeAmenities, setActiveAmenities] = useState<AmenityKey[]>(
    () => (searchParams.get('amenities')?.split(',').filter(Boolean) as AmenityKey[]) || []
  );
  const [showFilters, setShowFilters] = useState(false);
  const debouncedSearch = useDebouncedValue(searchText, 250);
  const [showMap, setShowMap] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Funder context flows in from the funders dashboard "See all" link.
  const cameFromFunder = (location.state as { from?: string } | null)?.from === 'funder';

  // Serialize the active filters so a house detail page can link back to this
  // exact filtered list (breadcrumb "Filtered houses").
  const buildListSearch = useCallback(() => {
    const p = new URLSearchParams();
    if (searchText.trim()) p.set('q', searchText.trim());
    if (selectedRegion !== 'All Regions') p.set('region', selectedRegion);
    if (selectedDistrict !== 'all') p.set('district', selectedDistrict);
    if (selectedSubCounty !== 'all') p.set('subcounty', selectedSubCounty);
    if (selectedVillage !== 'all') p.set('village', selectedVillage);
    if (selectedCategory !== 'all') p.set('category', selectedCategory);
    if (sortKey !== 'price_asc') p.set('sort', sortKey);
    if (verifiedOnly) p.set('verified', '1');
    if (maxDaily !== 'all') p.set('max', maxDaily);
    if (activeAmenities.length) p.set('amenities', activeAmenities.join(','));
    return p.toString();
  }, [searchText, selectedRegion, selectedDistrict, selectedSubCounty, selectedVillage, selectedCategory, sortKey, verifiedOnly, maxDaily, activeAmenities]);

  const openDetails = useCallback((listing: HouseListing) => {
    navigate(`/house/${listing.short_code || listing.id}`, {
      state: { from: cameFromFunder ? 'funder' : undefined, listSearch: buildListSearch() },
    });
  }, [navigate, cameFromFunder, buildListSearch]);

  // A shared link can pin the area so whoever opens it sees houses near the
  // sharer's location, not their own. lat/lng/region come from the share button.
  const sharedLat = (() => { const v = Number(searchParams.get('lat')); return Number.isFinite(v) && v !== 0 ? v : null; })();
  const sharedLng = (() => { const v = Number(searchParams.get('lng')); return Number.isFinite(v) && v !== 0 ? v : null; })();
  const sharedRegion = searchParams.get('region');
  const hasSharedLocation = sharedLat !== null && sharedLng !== null;

  const effectiveLat = hasSharedLocation ? sharedLat : geo.latitude;
  const effectiveLng = hasSharedLocation ? sharedLng : geo.longitude;

  const toggleAmenity = (key: AmenityKey) =>
    setActiveAmenities(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );

  const clearFilters = () => {
    setVerifiedOnly(false);
    setMaxDaily('all');
    setActiveAmenities([]);
    setSelectedCategory('all');
    setSelectedDistrict('all');
    setSelectedSubCounty('all');
    setSelectedVillage('all');
  };

  // Selecting a broader area resets the narrower ones so we never keep a stale
  // district/village that no longer belongs to the new selection.
  const handleRegionChange = (value: string) => {
    setSelectedRegion(value);
    setSelectedDistrict('all');
    setSelectedSubCounty('all');
    setSelectedVillage('all');
  };
  const handleDistrictChange = (value: string) => {
    setSelectedDistrict(value);
    setSelectedSubCounty('all');
    setSelectedVillage('all');
  };
  const handleSubCountyChange = (value: string) => {
    setSelectedSubCounty(value);
    setSelectedVillage('all');
  };

  useEffect(() => {
    if (!geoDefaultApplied && sharedRegion && REGIONS.includes(sharedRegion)) {
      setSelectedRegion(sharedRegion);
      setGeoDefaultApplied(true);
      return;
    }
    if (!geoDefaultApplied && geo.city && !geo.loading) {
      const matched = REGIONS.find(r => r.toLowerCase() === geo.city!.toLowerCase());
      if (matched) setSelectedRegion(matched);
      setGeoDefaultApplied(true);
    }
  }, [geo.city, geo.loading, geoDefaultApplied, sharedRegion]);

  const { listings, loading, loadingMore, hasMore, loadMore, metrics } = useNearbyHouses({
    latitude: effectiveLat,
    longitude: effectiveLng,
    // "All Regions" must show every house across the whole country (not just
    // houses near the user's GPS), so we pass a country-sized radius. A specific
    // region stays at 200km around the user.
    radiusKm: selectedRegion === 'All Regions' ? 100000 : 200,
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
    region: selectedRegion !== 'All Regions' ? selectedRegion : undefined,
    // Page through EVERY matching listing — no fixed cap.
    paginate: true,
    // Fetch a large first page so the map pins and the district/sub-county/
    // village dropdowns see the full result set immediately — not just the
    // first 24 rows the infinite-scroll sentinel would otherwise load.
    pageSize: 500,
    enabled: hasSharedLocation || !geo.loading,
  });

  // Exact listed-house counts (verified + not-yet-verified) for the active
  // filter set — replaces the loaded-rows "24+" counter that undervalued us.
  const listingCounts = useHouseListingCount({
    region: selectedRegion !== 'All Regions' ? selectedRegion : undefined,
    district: selectedDistrict !== 'all' ? selectedDistrict : undefined,
    subCounty: selectedSubCounty !== 'all' ? selectedSubCounty : undefined,
    village: selectedVillage !== 'all' ? selectedVillage : undefined,
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
    maxDailyRate: maxDaily !== 'all' ? Number(maxDaily) : undefined,
    search: debouncedSearch.trim() || undefined,
  });

  // Infinite scroll: a bottom sentinel loads the next page as it nears the
  // viewport. `loadMore` self-guards against overlapping/finished requests.
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = loadMoreSentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '800px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  const filtered = useMemo(() => {
    let result = [...listings];
    if (selectedDistrict !== 'all') {
      result = result.filter(l => (l.district || '').trim() === selectedDistrict);
    }
    if (selectedSubCounty !== 'all') {
      result = result.filter(l => (l.sub_county || '').trim() === selectedSubCounty);
    }
    if (selectedVillage !== 'all') {
      result = result.filter(l => (l.village || '').trim() === selectedVillage);
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(l =>
        l.region.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q) ||
        (l.district || '').toLowerCase().includes(q) ||
        l.title.toLowerCase().includes(q)
      );
    }
    if (verifiedOnly) {
      result = result.filter(l => l.verified && l.status !== 'pending');
    }
    if (maxDaily !== 'all') {
      const cap = Number(maxDaily);
      result = result.filter(l => l.daily_rate <= cap);
    }
    if (activeAmenities.length > 0) {
      result = result.filter(l => activeAmenities.every(k => Boolean((l as any)[k])));
    }
    switch (sortKey) {
      case 'price_desc':
        result.sort((a, b) => b.daily_rate - a.daily_rate);
        break;
      case 'newest':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'nearest':
        result.sort((a, b) => {
          const da = a.distance_km ?? (effectiveLat && effectiveLng ? distanceToHouse(a, effectiveLat, effectiveLng) : null) ?? 99999;
          const db = b.distance_km ?? (effectiveLat && effectiveLng ? distanceToHouse(b, effectiveLat, effectiveLng) : null) ?? 99999;
          return da - db;
        });
        break;
      case 'price_asc':
      default:
        result.sort((a, b) => a.daily_rate - b.daily_rate);
        break;
    }
    return result;
  }, [listings, debouncedSearch, verifiedOnly, maxDaily, activeAmenities, sortKey, effectiveLat, effectiveLng, selectedDistrict, selectedSubCounty, selectedVillage]);

  // Distinct location options derived from the loaded listings, cascading from
  // the current region/district/sub-county selection. Only areas that actually
  // have houses are offered, so the dropdowns stay relevant for tenants & funders.
  const districtOptions = useMemo(() => {
    const set = new Set<string>();
    listings.forEach(l => { const v = (l.district || '').trim(); if (v) set.add(v); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [listings]);

  const subCountyOptions = useMemo(() => {
    const set = new Set<string>();
    listings.forEach(l => {
      if (selectedDistrict !== 'all' && (l.district || '').trim() !== selectedDistrict) return;
      const v = (l.sub_county || '').trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [listings, selectedDistrict]);

  const villageOptions = useMemo(() => {
    const set = new Set<string>();
    listings.forEach(l => {
      if (selectedDistrict !== 'all' && (l.district || '').trim() !== selectedDistrict) return;
      if (selectedSubCounty !== 'all' && (l.sub_county || '').trim() !== selectedSubCounty) return;
      const v = (l.village || '').trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [listings, selectedDistrict, selectedSubCounty]);

  const activeFilterCount =
    (verifiedOnly ? 1 : 0) +
    (maxDaily !== 'all' ? 1 : 0) +
    activeAmenities.length +
    (selectedCategory !== 'all' ? 1 : 0) +
    (selectedDistrict !== 'all' ? 1 : 0) +
    (selectedSubCounty !== 'all' ? 1 : 0) +
    (selectedVillage !== 'all' ? 1 : 0);

  const sortLabel = SORT_OPTIONS.find(s => s.value === sortKey)?.label ?? '';

  const hasGPS = !!(effectiveLat && effectiveLng);

  const shareUrl = user
    ? `${SITE_URL}/find-a-house?ref=${user.id}`
    : `${SITE_URL}/find-a-house`;

  const handleShare = async () => {
    const shareData = {
      title: 'Find Affordable Houses — Daily Rent | Welile',
      text: 'Find affordable houses near you with daily rent. Pay as you stay!',
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

  const pageTitle = isLandingPage
    ? `Houses for Rent in ${landingRegion} — Daily Rent from UGX | Welile`
    : hasGPS && geo.city
      ? `Houses for Rent Near ${geo.city} — Daily Rent | Welile`
      : 'Find a House Near You — Daily Rent | Welile';

  const pageDescription = isLandingPage
    ? `Browse verified houses for rent in ${landingRegion}, Uganda. Pay daily — no big deposits. Single rooms, bedsitters and family homes with photos, prices and Google Maps locations.`
    : 'Browse affordable rental houses near you. Pay daily rent — no big deposits. Verified listings with Google Maps locations across Uganda.';

  const lowestPrice = filtered.length > 0 ? filtered[0].daily_rate : null;
  const seoDescription = lowestPrice
    ? isLandingPage
      ? `Houses for rent in ${landingRegion} from ${formatUGX(lowestPrice)}/day. ${filtered.length} verified listings on Welile. No deposits — pay daily and move in today.`
      : `Rent houses from ${formatUGX(lowestPrice)}/day in Uganda. No deposits. ${filtered.length} verified listings. Pay daily — move in today!`
    : pageDescription;

  const canonicalPath = isLandingPage ? `/find-a-house/${regionSlug!.toLowerCase()}` : '/find-a-house';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: pageTitle,
    description: seoDescription,
    url: `${SITE_URL}/find-a-house`,
    publisher: {
      '@type': 'Organization',
      name: 'Welile Technologies Limited',
      url: SITE_URL,
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: filtered.length,
      itemListElement: filtered.slice(0, 10).map((l, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Accommodation',
          name: l.title,
          description: `${l.house_category?.replace(/_/g, ' ')} · ${l.number_of_rooms} rooms · ${formatUGX(l.daily_rate)}/day`,
          address: { '@type': 'PostalAddress', addressLocality: l.region, addressCountry: 'UG', streetAddress: l.address },
          ...(l.latitude && l.longitude ? {
            geo: { '@type': 'GeoCoordinates', latitude: l.latitude, longitude: l.longitude }
          } : {}),
          ...(l.image_urls?.[0] ? { image: l.image_urls[0] } : {}),
          offers: {
            '@type': 'Offer',
            price: l.daily_rate,
            priceCurrency: 'UGX',
            availability: 'https://schema.org/InStock',
            priceValidUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          },
        },
      })),
    },
  };

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={seoDescription} />
        <link rel="canonical" href={`${SITE_URL}/find-a-house`} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={seoDescription} />
        <meta property="og:url" content={`${SITE_URL}/find-a-house`} />
        <meta property="og:type" content="website" />
        {filtered[0]?.image_urls?.[0] && <meta property="og:image" content={filtered[0].image_urls[0]} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={seoDescription} />
        <meta name="robots" content="index, follow" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Skip links for keyboard / screen-reader users */}
        <a
          href="#house-list"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:font-bold focus:shadow-lg focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Skip to house list
        </a>
        <a
          href="#first-map-cta"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-44 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:font-bold focus:shadow-lg focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Skip to Google Maps links
        </a>
        {/* Header */}
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
                aria-label="Go back"
                className="shrink-0 -ml-2 h-9 w-9"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Home className="h-5 w-5 text-primary shrink-0" />
              <h1 className="font-bold text-lg truncate">
                {hasGPS && geo.city ? `Houses Near ${geo.city}` : 'Find a House'}
              </h1>
            </div>
            <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
              {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              {copied ? 'Copied' : 'Share'}
            </Button>
          </div>
        </header>

        {/* Filters */}
        <div className="sticky top-[53px] z-30 bg-background/95 backdrop-blur-md border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by region, district, or address..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="pl-10 pr-9"
              />
              {searchText !== debouncedSearch && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
              )}
            </div>
            <div className="flex gap-2">
              <Select value={selectedRegion} onValueChange={handleRegionChange}>
                <SelectTrigger className="flex-1 h-9 text-xs"><SelectValue placeholder="Region" /></SelectTrigger>
                <SelectContent>
                  {REGIONS.map(r => <SelectItem key={r} value={r}>{regionLabel(r)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="flex-1 h-9 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Cascading location filters: district -> area/sub-county -> village.
                Only render a level when there are houses with that data. */}
            {(districtOptions.length > 0 || subCountyOptions.length > 0 || villageOptions.length > 0) && (
              <div className="flex gap-2">
                {districtOptions.length > 0 && (
                  <Select value={selectedDistrict} onValueChange={handleDistrictChange}>
                    <SelectTrigger className="flex-1 h-9 text-xs min-w-0"><SelectValue placeholder="District" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All districts</SelectItem>
                      {districtOptions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {subCountyOptions.length > 0 && (
                  <Select value={selectedSubCounty} onValueChange={handleSubCountyChange}>
                    <SelectTrigger className="flex-1 h-9 text-xs min-w-0"><SelectValue placeholder="Town / Area" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All areas</SelectItem>
                      {subCountyOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {villageOptions.length > 0 && (
                  <Select value={selectedVillage} onValueChange={setSelectedVillage}>
                    <SelectTrigger className="flex-1 h-9 text-xs min-w-0"><SelectValue placeholder="Village / Zone" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All villages</SelectItem>
                      {villageOptions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            {/* Sort + filter toggle row */}
            <div className="flex gap-2">
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="flex-1 h-9 text-xs gap-1.5">
                  <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant={showFilters || activeFilterCount > 0 ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowFilters(s => !s)}
                className="h-9 gap-1.5 shrink-0"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-background/30 text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </div>

            {/* Expandable filter panel */}
            {showFilters && (
              <div className="space-y-3 pt-1">
                {/* Verified + price cap */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setVerifiedOnly(v => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      verifiedOnly
                        ? 'bg-success text-success-foreground border-success'
                        : 'bg-muted/60 text-muted-foreground border-border'
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> Verified only
                  </button>
                  <Select value={maxDaily} onValueChange={setMaxDaily}>
                    <SelectTrigger className="h-8 w-auto text-xs gap-1.5 rounded-full px-3">
                      <SelectValue placeholder="Max daily" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any price</SelectItem>
                      <SelectItem value="5000">Under {formatUGX(5000)}/day</SelectItem>
                      <SelectItem value="10000">Under {formatUGX(10000)}/day</SelectItem>
                      <SelectItem value="20000">Under {formatUGX(20000)}/day</SelectItem>
                      <SelectItem value="50000">Under {formatUGX(50000)}/day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Amenity chips */}
                <div className="flex flex-wrap gap-2">
                  {AMENITY_FILTERS.map(({ key, label, icon: Icon }) => {
                    const active = activeAmenities.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleAmenity(key)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/60 text-muted-foreground border-border'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </button>
                    );
                  })}
                </div>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" /> Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Listings */}
        <main
          id="house-list"
          tabIndex={-1}
          className={`${showMap ? 'max-w-7xl' : 'max-w-5xl'} mx-auto px-4 py-4 space-y-3 pb-20`}
        >
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-2xl" />
            ))
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <Home className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground font-medium">No houses found</p>
              <p className="text-xs text-muted-foreground">Try a different region, price, or fewer filters</p>
              {activeFilterCount > 0 && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="gap-1.5">
                  <X className="h-4 w-4" /> Clear filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <HouseListingCount
                  className="text-xs text-muted-foreground"
                  counts={listingCounts}
                  loadedCount={filtered.length}
                  locationLabel={
                    selectedVillage !== 'all'
                      ? `in ${selectedVillage}`
                      : selectedSubCounty !== 'all'
                        ? `in ${selectedSubCounty}`
                        : selectedDistrict !== 'all'
                          ? `in ${selectedDistrict}`
                          : selectedRegion !== 'All Regions'
                            ? `in ${selectedRegion}`
                            : undefined
                  }
                  suffix={`${sortLabel.toLowerCase()}${loadingMore ? ' · loading more…' : ''}`}
                />
                <Button
                  variant={showMap ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowMap((v) => !v)}
                  className="gap-1.5 shrink-0"
                  aria-pressed={showMap}
                >
                  {showMap ? <ListIcon className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
                  {showMap ? 'Hide map' : 'Show map'}
                </Button>
              </div>

              {showMap ? (
                <div className="flex flex-col md:flex-row gap-3">
                  {/* Map — full width on mobile, sticky side pane on desktop */}
                  <div className="md:order-2 md:w-[44%] md:sticky md:top-4 h-[55vh] md:h-[calc(100vh-7rem)] rounded-2xl overflow-hidden border border-border shrink-0">
                    <Suspense fallback={<Skeleton className="h-full w-full" />}>
                      <HouseMapView
                        listings={filtered}
                        userCoords={
                          effectiveLat != null && effectiveLng != null
                            ? { lat: effectiveLat, lng: effectiveLng }
                            : null
                        }
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onOpenDetails={openDetails}
                      />
                    </Suspense>
                  </div>
                  {/* List — hidden on mobile while the map is open (toggle), shown beside map on desktop */}
                  <div className="hidden md:block md:order-1 md:flex-1 min-w-0">
                    <VirtualHouseList listings={filtered} onOpenDetails={openDetails} userLat={effectiveLat} userLng={effectiveLng} />
                  </div>
                </div>
              ) : (
                <VirtualHouseList listings={filtered} onOpenDetails={openDetails} userLat={effectiveLat} userLng={effectiveLng} />
              )}
              {/* Infinite-scroll sentinel + status. */}
              {hasMore && <div ref={loadMoreSentinelRef} className="h-1 w-full" aria-hidden="true" />}
              {loadingMore && (
                <LoadMoreProgress
                  loadedCount={filtered.length}
                  pagesFetched={metrics.pagesFetched}
                  hasMore={hasMore}
                  skeletonCount={2}
                  skeletonClassName="h-48 w-full rounded-2xl"
                />
              )}
            </>
          )}
        </main>

        {/* Footer CTA */}
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border p-3 z-40">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <a href="/auth" className="flex-1">
              <Button className="w-full gap-2 font-bold" size="lg">
                <Home className="h-5 w-5" />
                Sign Up — Start Renting Daily
              </Button>
            </a>
            <Button variant="outline" size="lg" onClick={handleShare} className="shrink-0">
              <Share2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

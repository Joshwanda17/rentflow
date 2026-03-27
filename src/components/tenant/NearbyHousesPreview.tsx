import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ImageLightbox } from '@/components/marketplace/ImageLightbox';
import { MapPin, DoorOpen, Home, ChevronRight, ChevronLeft, ShieldCheck, Clock, ExternalLink } from 'lucide-react';
import { WhatsAppAgentButton } from '@/components/tenant/WhatsAppAgentButton';
import { ShareHouseButton } from '@/components/tenant/ShareHouseButton';
import HouseRatingBadge from '@/components/house/HouseRatingBadge';
import { useNearbyHouses, HouseListing } from '@/hooks/useHouseListings';
import { useGeolocation } from '@/hooks/useGeolocation';
import { formatUGX } from '@/lib/rentCalculations';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface NearbyHousesPreviewProps {
  onViewAll: () => void;
}

function MiniMapThumb({ lat, lng, title }: { lat: number | null; lng: number | null; title: string }) {
  if (!lat || !lng) return null;
  
  const mapUrl = `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
  const linkUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <a
      href={linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="block relative w-full h-20 rounded-lg overflow-hidden bg-muted border border-border group"
    >
      <iframe
        src={mapUrl}
        className="w-full h-full pointer-events-none"
        title={`Map: ${title}`}
        loading="lazy"
        style={{ border: 0 }}
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
        <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
          <ExternalLink className="h-3 w-3" /> Open Map
        </span>
      </div>
    </a>
  );
}

function MiniHouseCard({ listing }: { listing: HouseListing }) {
  const navigate = useNavigate();
  const dist = listing.distance_km;
  const isPending = !listing.verified || listing.status === 'pending';
  const [imgIdx, setImgIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const images = listing.image_urls || [];

  const lightboxImages = useMemo(() =>
    images.map((url, i) => ({ id: `nearby-${listing.id}-${i}`, image_url: url })),
    [images, listing.id]
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={() => navigate(`/house/${listing.id}`)}
      className="min-w-[240px] max-w-[240px] snap-start rounded-2xl border border-border bg-card overflow-hidden shadow-sm cursor-pointer active:scale-[0.97] transition-transform touch-manipulation"
    >
      {/* Cover image with carousel */}
      <div className="relative w-full h-28 bg-muted">
        {images.length > 0 ? (
          <>
            <img
              src={images[imgIdx]}
              alt={listing.title}
              className="w-full h-full object-cover cursor-pointer"
              loading="lazy"
              onClick={() => setLightboxOpen(true)}
            />
            {images.length > 1 && (
              <>
                <button type="button" onClick={(e) => { e.stopPropagation(); setImgIdx(i => (i - 1 + images.length) % images.length); }}
                  className="absolute left-0.5 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-0.5">
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); setImgIdx(i => (i + 1) % images.length); }}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-0.5">
                  <ChevronRight className="h-3 w-3" />
                </button>
                <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {imgIdx + 1}/{images.length}
                </span>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Home className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}
        {/* Share button */}
        <div className="absolute bottom-1 left-1">
          <ShareHouseButton listingId={listing.id} title={listing.title} region={listing.region} dailyRate={listing.daily_rate} shortCode={listing.short_code} />
        </div>
        {dist !== undefined && dist < 9999 && (
          <span className="absolute top-1 left-1 text-[10px] font-medium text-white bg-primary/80 px-1.5 py-0.5 rounded-full">
            ~{dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`}
          </span>
        )}
        {/* Verification badge */}
        {isPending ? (
          <Badge variant="outline" className="absolute top-1 right-1 text-[9px] bg-warning/90 text-warning-foreground border-warning/50 gap-0.5 px-1.5 py-0.5">
            <Clock className="h-2.5 w-2.5" /> Pending
          </Badge>
        ) : (
          <Badge variant="outline" className="absolute top-1 right-1 text-[9px] bg-success/90 text-white border-success/50 gap-0.5 px-1.5 py-0.5">
            <ShieldCheck className="h-2.5 w-2.5" /> Verified
          </Badge>
        )}
        {/* Rating badge */}
        <HouseRatingBadge houseId={listing.id} houseLat={listing.latitude} houseLng={listing.longitude} className="absolute bottom-1 left-1" />
        {/* Dots */}
        {images.length > 1 && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
            {images.map((_, i) => (
              <span key={i} className={`w-1 h-1 rounded-full ${i === imgIdx ? 'bg-white' : 'bg-white/50'}`} />
            ))}
          </div>
        )}
      </div>

      <div className="p-3 space-y-1.5">
        <p className="font-semibold text-sm truncate">{listing.title}</p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{listing.region}{listing.district ? `, ${listing.district}` : ''}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <DoorOpen className="h-3 w-3" />
          <span>{listing.number_of_rooms} room{listing.number_of_rooms > 1 ? 's' : ''}</span>
        </div>
        
        {/* Daily rate */}
        <div className="p-2 rounded-lg bg-success/10 border border-success/20">
          <p className="text-lg font-black text-success leading-none">{formatUGX(listing.daily_rate)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">per day · pay as you stay</p>
        </div>

        {/* Mini map */}
        <MiniMapThumb lat={listing.latitude} lng={listing.longitude} title={listing.title} />

        {/* WhatsApp Agent */}
        <WhatsAppAgentButton phone={listing.agent_phone} agentName={listing.agent_name} houseTitle={listing.title} />
      </div>

      {/* Fullscreen Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        initialIndex={imgIdx}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        productName={listing.title}
      />
    </motion.div>
  );
}

export function NearbyHousesPreview({ onViewAll }: NearbyHousesPreviewProps) {
  const geo = useGeolocation(true);
  const { listings, loading } = useNearbyHouses({
    latitude: geo.latitude,
    longitude: geo.longitude,
    radiusKm: 50,
    limit: 10,
    enabled: !geo.loading,
  });

  if (loading || geo.loading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex gap-3 overflow-x-auto">
          {[1, 2, 3].map(i => <Skeleton key={i} className="min-w-[240px] h-48 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (!listings.length) return null;

  const hasGPS = !!(geo.latitude && geo.longitude);
  const nearbyCity = geo.city;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-base flex items-center gap-1.5">
          <Home className="h-4 w-4 text-primary" />
          {hasGPS
            ? `Near ${nearbyCity || 'You'}`
            : 'Available Houses'}
        </h2>
        <button
          onClick={onViewAll}
          className="text-xs text-primary font-medium flex items-center gap-0.5"
        >
          View All <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 scrollbar-hide">
        {listings.map(listing => (
          <MiniHouseCard key={listing.id} listing={listing} />
        ))}
      </div>
    </div>
  );
}

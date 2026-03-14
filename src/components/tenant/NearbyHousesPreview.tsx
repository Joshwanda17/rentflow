import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapPin, DoorOpen, Home, ChevronRight } from 'lucide-react';
import { useNearbyHouses, HouseListing } from '@/hooks/useHouseListings';
import { useGeolocation } from '@/hooks/useGeolocation';
import { formatUGX } from '@/lib/rentCalculations';
import { Skeleton } from '@/components/ui/skeleton';

interface NearbyHousesPreviewProps {
  onViewAll: () => void;
}

function MiniHouseCard({ listing }: { listing: HouseListing }) {
  const dist = listing.distance_km;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="min-w-[220px] max-w-[220px] snap-start rounded-2xl border border-border bg-card p-3 space-y-2 shadow-sm"
    >
      <p className="font-semibold text-sm truncate">{listing.title}</p>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">{listing.region}{listing.district ? `, ${listing.district}` : ''}</span>
      </div>
      {dist !== undefined && dist < 9999 && (
        <span className="inline-block text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
          ~{dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`} away
        </span>
      )}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <DoorOpen className="h-3 w-3" />
        <span>{listing.number_of_rooms} room{listing.number_of_rooms > 1 ? 's' : ''}</span>
      </div>
      <div className="p-2 rounded-lg bg-success/10 border border-success/20">
        <p className="text-lg font-black text-success leading-none">{formatUGX(listing.daily_rate)}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">per day</p>
      </div>
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
          {[1, 2, 3].map(i => <Skeleton key={i} className="min-w-[220px] h-36 rounded-2xl" />)}
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

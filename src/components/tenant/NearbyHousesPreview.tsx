import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapPin, DoorOpen, Home, ChevronRight } from 'lucide-react';
import { useHouseListings, HouseListing } from '@/hooks/useHouseListings';
import { useGeolocation } from '@/hooks/useGeolocation';
import { formatUGX } from '@/lib/rentCalculations';
import { Skeleton } from '@/components/ui/skeleton';

interface NearbyHousesPreviewProps {
  onViewAll: () => void;
}

/**
 * Haversine distance in km between two GPS points
 */
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function MiniHouseCard({ listing, distance }: { listing: HouseListing; distance?: number }) {
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
      {distance !== undefined && (
        <span className="inline-block text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
          ~{distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`} away
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
  const { listings, loading } = useHouseListings({ status: 'available', limit: 50 });

  // Sort by distance if we have GPS, otherwise show most recent
  const sorted = useMemo(() => {
    if (!listings.length) return [];

    if (geo.latitude && geo.longitude) {
      return listings
        .map(l => ({
          ...l,
          _dist: l.latitude && l.longitude
            ? distanceKm(geo.latitude!, geo.longitude!, l.latitude, l.longitude)
            : 9999,
        }))
        .sort((a, b) => a._dist - b._dist)
        .slice(0, 10);
    }

    // No GPS — show most recent
    return listings.slice(0, 10).map(l => ({ ...l, _dist: undefined as number | undefined }));
  }, [listings, geo.latitude, geo.longitude]);

  if (loading) {
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

  if (!sorted.length) return null;

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
        {sorted.map(listing => (
          <MiniHouseCard
            key={listing.id}
            listing={listing}
            distance={hasGPS ? listing._dist : undefined}
          />
        ))}
      </div>
    </div>
  );
}

import { useState, useMemo, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, MapPin, Droplets, Zap, ShieldCheck, Car, Sofa, Home, DoorOpen, ChevronLeft, ChevronRight, Clock, ExternalLink } from 'lucide-react';
import { WhatsAppAgentButton } from '@/components/tenant/WhatsAppAgentButton';
import { ShareHouseButton } from '@/components/tenant/ShareHouseButton';
import { useNearbyHouses, HouseListing } from '@/hooks/useHouseListings';
import { useGeolocation } from '@/hooks/useGeolocation';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';

interface AvailableHousesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

function HouseImageCarousel({ images, title }: { images: string[] | null; title: string }) {
  const [idx, setIdx] = useState(0);
  if (!images || images.length === 0) {
    return (
      <div className="w-full h-44 rounded-xl bg-muted flex items-center justify-center">
        <Home className="h-10 w-10 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-44 rounded-xl overflow-hidden bg-muted">
      <img src={images[idx]} alt={title} className="w-full h-full object-cover" loading="lazy" />
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIdx(i => (i - 1 + images.length) % images.length); }}
            className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIdx(i => (i + 1) % images.length); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
            {images.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === idx ? 'bg-white' : 'bg-white/50'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LocationMap({ lat, lng, title }: { lat: number | null; lng: number | null; title: string }) {
  if (!lat || !lng) return null;

  const mapUrl = `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
  const linkUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <div className="space-y-1">
      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block relative w-full h-32 rounded-xl overflow-hidden bg-muted border border-border group"
      >
        <iframe
          src={mapUrl}
          className="w-full h-full pointer-events-none"
          title={`Map: ${title}`}
          loading="lazy"
          style={{ border: 0 }}
        />
        <div className="absolute bottom-2 right-2 bg-card/90 backdrop-blur-sm text-foreground text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 border border-border shadow-sm group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          <ExternalLink className="h-3 w-3" /> Open in Maps
        </div>
      </a>
    </div>
  );
}

function VerificationBadge({ verified, status }: { verified?: boolean; status: string }) {
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

function HouseCard({ listing }: { listing: HouseListing }) {
  const categoryLabel = CATEGORIES.find(c => c.value === listing.house_category)?.label || listing.house_category;
  const dist = listing.distance_km;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm"
    >
      <div className="relative">
        <HouseImageCarousel images={listing.image_urls} title={listing.title} />
        {dist !== undefined && dist < 9999 && (
          <span className="absolute top-2 left-2 text-[10px] font-medium text-white bg-primary/80 px-2 py-0.5 rounded-full">
            ~{dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`}
          </span>
        )}
        <Badge variant="secondary" className="absolute top-2 right-2 text-[10px]">{categoryLabel}</Badge>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base truncate">{listing.title}</h3>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground truncate">
                {listing.address}, {listing.region}
                {listing.district ? `, ${listing.district}` : ''}
              </p>
            </div>
          </div>
          <VerificationBadge verified={listing.verified} status={listing.status} />
        </div>

        {/* Daily Rate */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-success/20 to-success/10 border-2 border-success/30">
          <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Daily Rent</p>
          <p className="text-3xl font-black text-success leading-none mb-1">{formatUGX(listing.daily_rate)}</p>
          <p className="text-xs text-muted-foreground font-medium">per day · pay as you stay</p>
        </div>

        {/* Specs */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs">
            <DoorOpen className="h-3 w-3" /> {listing.number_of_rooms} room{listing.number_of_rooms > 1 ? 's' : ''}
          </span>
          {listing.has_water && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
              <Droplets className="h-3 w-3" /> Water
            </span>
          )}
          {listing.has_electricity && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 text-warning text-xs">
              <Zap className="h-3 w-3" /> Power
            </span>
          )}
          {listing.has_security && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-xs">
              <ShieldCheck className="h-3 w-3" /> Security
            </span>
          )}
          {listing.has_parking && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-xs">
              <Car className="h-3 w-3" /> Parking
            </span>
          )}
          {listing.is_furnished && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
              <Sofa className="h-3 w-3" /> Furnished
            </span>
          )}
        </div>

        {listing.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{listing.description}</p>
        )}

        {/* Google Maps embed */}
        <LocationMap lat={listing.latitude} lng={listing.longitude} title={listing.title} />

        {/* WhatsApp Agent */}
        <WhatsAppAgentButton phone={listing.agent_phone} agentName={listing.agent_name} houseTitle={listing.title} />

        {/* Share */}
        <ShareHouseButton listingId={listing.id} title={listing.title} region={listing.region} dailyRate={listing.daily_rate} shortCode={listing.short_code} variant="full" />
      </div>
    </motion.div>
  );
}

export function AvailableHousesSheet({ open, onOpenChange }: AvailableHousesSheetProps) {
  const geo = useGeolocation(true);
  const [searchText, setSearchText] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All Regions');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [geoDefaultApplied, setGeoDefaultApplied] = useState(false);

  useEffect(() => {
    if (!geoDefaultApplied && geo.city && !geo.loading) {
      const matched = REGIONS.find(r => r.toLowerCase() === geo.city!.toLowerCase());
      if (matched) setSelectedRegion(matched);
      setGeoDefaultApplied(true);
    }
  }, [geo.city, geo.loading, geoDefaultApplied]);

  const { listings, loading } = useNearbyHouses({
    latitude: geo.latitude,
    longitude: geo.longitude,
    radiusKm: selectedRegion !== 'All Regions' ? 200 : 50,
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
    region: selectedRegion !== 'All Regions' ? selectedRegion : undefined,
    limit: 100,
    enabled: open && !geo.loading,
  });

  const filtered = useMemo(() => {
    if (!searchText.trim()) return listings;
    const q = searchText.toLowerCase();
    return listings.filter(l =>
      l.region.toLowerCase().includes(q) ||
      l.address.toLowerCase().includes(q) ||
      (l.district || '').toLowerCase().includes(q) ||
      l.title.toLowerCase().includes(q)
    );
  }, [listings, searchText]);

  const hasGPS = !!(geo.latitude && geo.longitude);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[95vh] rounded-t-3xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border space-y-3">
          <SheetTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            {hasGPS && geo.city
              ? `Houses Near ${geo.city}`
              : 'Available Houses — Daily Rent'}
          </SheetTitle>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by region, district, or address..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2">
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger className="flex-1 h-9 text-xs">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="flex-1 h-9 text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-2xl" />
            ))
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Home className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground font-medium">No houses found</p>
              <p className="text-xs text-muted-foreground">
                Try a different region or category
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {filtered.length} house{filtered.length !== 1 ? 's' : ''} available
                {hasGPS ? ' · sorted by distance' : ''}
              </p>
              {filtered.map(listing => (
                <HouseCard key={listing.id} listing={listing} />
              ))}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

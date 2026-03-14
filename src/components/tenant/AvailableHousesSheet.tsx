import { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, MapPin, Droplets, Zap, ShieldCheck, Car, Sofa, Home, DoorOpen } from 'lucide-react';
import { useHouseListings, HouseListing } from '@/hooks/useHouseListings';
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

function HouseCard({ listing }: { listing: HouseListing }) {
  const categoryLabel = CATEGORIES.find(c => c.value === listing.house_category)?.label || listing.house_category;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm"
    >
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
        <Badge variant="secondary" className="shrink-0 text-[10px]">{categoryLabel}</Badge>
      </div>

      {/* Daily Rate — primary price only */}
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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-xs">
            <Droplets className="h-3 w-3" /> Water
          </span>
        )}
        {listing.has_electricity && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 text-xs">
            <Zap className="h-3 w-3" /> Power
          </span>
        )}
        {listing.has_security && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 text-xs">
            <ShieldCheck className="h-3 w-3" /> Security
          </span>
        )}
        {listing.has_parking && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 text-xs">
            <Car className="h-3 w-3" /> Parking
          </span>
        )}
        {listing.is_furnished && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-600 text-xs">
            <Sofa className="h-3 w-3" /> Furnished
          </span>
        )}
      </div>

      {listing.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{listing.description}</p>
      )}
    </motion.div>
  );
}

export function AvailableHousesSheet({ open, onOpenChange }: AvailableHousesSheetProps) {
  const [searchRegion, setSearchRegion] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All Regions');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const { listings, loading } = useHouseListings({
    region: selectedRegion !== 'All Regions' ? selectedRegion : undefined,
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
    status: 'available',
    limit: 100,
  });

  const filtered = useMemo(() => {
    if (!searchRegion.trim()) return listings;
    const q = searchRegion.toLowerCase();
    return listings.filter(l => 
      l.region.toLowerCase().includes(q) ||
      l.address.toLowerCase().includes(q) ||
      (l.district || '').toLowerCase().includes(q) ||
      (l.village || '').toLowerCase().includes(q) ||
      l.title.toLowerCase().includes(q)
    );
  }, [listings, searchRegion]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[95vh] rounded-t-3xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border space-y-3">
          <SheetTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            Available Houses — Daily Rent
          </SheetTitle>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by region, district, or address..."
              value={searchRegion}
              onChange={e => setSearchRegion(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filters */}
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

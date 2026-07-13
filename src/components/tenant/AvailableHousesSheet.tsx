import { useState, useMemo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useMapLinkAnnouncer } from '@/hooks/useMapLinkAnnouncer';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, MapPin, Droplets, Zap, ShieldCheck, Car, Sofa, Home, DoorOpen, ChevronLeft, ChevronRight, Clock, ExternalLink, ZoomIn, Navigation, X, List, Map as MapIcon } from 'lucide-react';
import { AgentContactBar } from '@/components/tenant/AgentContactBar';
import { GetDirectionsButton } from '@/components/tenant/GetDirectionsButton';
import { ShareHouseButton } from '@/components/tenant/ShareHouseButton';
import { ShareNearbyHousesButton } from '@/components/tenant/ShareNearbyHousesButton';
import { useNearbyHouses, useHouseListingCount, HouseListing } from '@/hooks/useHouseListings';
import { HouseListingCount } from '@/components/tenant/HouseListingCount';
import { useGeolocation } from '@/hooks/useGeolocation';
import { formatUGX } from '@/lib/rentCalculations';
import { MoveInOfferBadge } from '@/components/house/MoveInOfferBadge';
import { motion } from 'framer-motion';
import { ImageLightbox } from '@/components/marketplace/ImageLightbox';
import { regionLabel } from '@/lib/ugandaDistricts';
import { HousesMapView } from '@/components/tenant/HousesMapView';
import { LoadMoreProgress } from '@/components/tenant/LoadMoreProgress';
import { useNavigate } from 'react-router-dom';

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

function HouseImageCarousel({ images, title, houseId }: { images: string[] | null; title: string; houseId: string }) {
  const [idx, setIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  if (!images || images.length === 0) {
    return (
      <div className="w-full h-44 rounded-xl bg-muted flex items-center justify-center">
        <Home className="h-10 w-10 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-44 rounded-xl overflow-hidden bg-muted">
      <img
        src={images[idx]}
        alt={title}
        className="w-full h-full object-cover cursor-zoom-in"
        loading="lazy"
        onClick={(e) => { e.stopPropagation(); setLightboxOpen(true); }}
      />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setLightboxOpen(true); }}
        aria-label="View full screen"
        className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1.5 active:scale-95 transition-transform"
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </button>
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
      <ImageLightbox
        images={images.map((url, i) => ({ id: `${i}`, image_url: url }))}
        initialIndex={idx}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        productName={title}
        memoryKey={`house:${houseId}`}
      />
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

function HouseCard({ listing, highlighted = false, onOpen }: { listing: HouseListing; highlighted?: boolean; onOpen: (listing: HouseListing) => void }) {
  const categoryLabel = CATEGORIES.find(c => c.value === listing.house_category)?.label || listing.house_category;
  const dist = listing.distance_km;
  const cover = listing.image_urls && listing.image_urls.length > 0 ? listing.image_urls[0] : null;
  const open = () => onOpen(listing);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      data-house-card=""
      data-house-id={listing.id}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${listing.title}`}
      aria-current={highlighted ? 'true' : undefined}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      }}
      className={
        'rounded-2xl border bg-card overflow-hidden transition-shadow cursor-pointer active:scale-[0.98] touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
        (highlighted
          ? 'border-primary shadow-lg ring-2 ring-primary/40 ring-offset-2 ring-offset-background'
          : 'border-border shadow-sm')
      }
    >
      {/* House image */}
      <div className="relative w-full h-40 bg-muted">
        {cover ? (
          <img src={cover} alt={listing.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Home className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}
        {dist !== undefined && dist < 9999 && (
          <span className="absolute top-2 left-2 text-[10px] font-medium text-white bg-primary/80 px-2 py-0.5 rounded-full">
            ~{dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`}
          </span>
        )}
        <Badge variant="secondary" className="absolute top-2 right-2 text-[10px]">{categoryLabel}</Badge>
        <div className="absolute bottom-2 right-2">
          <VerificationBadge verified={listing.verified} status={listing.status} />
        </div>
      </div>

      {/* Title · location · price */}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-base truncate">{listing.title}</h3>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground truncate">
                {listing.address}, {listing.region}
                {listing.district ? `, ${listing.district}` : ''}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-black text-success leading-none">{formatUGX(listing.daily_rate)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">per day</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1 text-[11px] font-medium text-primary">
          Tap to view details <ChevronRight className="h-3 w-3" />
        </div>
      </div>
    </motion.div>
  );
}

export function AvailableHousesSheet({ open, onOpenChange }: AvailableHousesSheetProps) {
  const geo = useGeolocation(true);
  const announceMap = useMapLinkAnnouncer();
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All Regions');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDistrict, setSelectedDistrict] = useState('all');
  const [selectedSubCounty, setSelectedSubCounty] = useState('all');
  const [selectedVillage, setSelectedVillage] = useState('all');
  const [view, setView] = useState<'list' | 'map'>('list');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  // Bottom sentinel — when it scrolls into view we ask for the next page.
  const sentinelRef = useRef<HTMLDivElement>(null);

  // By default we list EVERY available house across the whole country — NOT
  // only houses near the tenant's GPS. Location is the tenant's choice via the
  // region/district/sub-county/village filters below. We therefore don't feed
  // GPS into the list query (that would distance-scope and distance-sort it, so
  // a tenant sitting far from most listings would see very few). Results come
  // back newest-first and are narrowed only when the tenant picks a filter.
  const { listings, loading, loadingMore, hasMore, loadMore, metrics } = useNearbyHouses({
    latitude: null,
    longitude: null,
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
    region: selectedRegion !== 'All Regions' ? selectedRegion : undefined,
    // Page through EVERY matching listing — no fixed cap.
    paginate: true,
    // Fetch a large first page so the map pins and the district/sub-county/
    // village dropdowns see the full result set immediately — not just the
    // first 24 rows the infinite-scroll sentinel would otherwise load.
    pageSize: 500,
    enabled: open,
  });

  // Exact listed-house counts (verified + not-yet-verified) for the active
  // filter set — replaces the loaded-rows "24+" counter.
  const listingCounts = useHouseListingCount({
    region: selectedRegion !== 'All Regions' ? selectedRegion : undefined,
    district: selectedDistrict !== 'all' ? selectedDistrict : undefined,
    subCounty: selectedSubCounty !== 'all' ? selectedSubCounty : undefined,
    village: selectedVillage !== 'all' ? selectedVillage : undefined,
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
    search: searchText.trim() || undefined,
    enabled: open,
  });

  // Selecting a broader area resets the narrower ones so we never keep a stale
  // district/sub-county/village that no longer belongs to the new selection.
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

  // Distinct GPS-captured location options derived from the loaded listings,
  // cascading from the current district/sub-county selection. Only areas that
  // actually have houses are offered.
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

  const filtered = useMemo(() => {
    let result = listings;
    if (selectedDistrict !== 'all') {
      result = result.filter(l => (l.district || '').trim() === selectedDistrict);
    }
    if (selectedSubCounty !== 'all') {
      result = result.filter(l => (l.sub_county || '').trim() === selectedSubCounty);
    }
    if (selectedVillage !== 'all') {
      result = result.filter(l => (l.village || '').trim() === selectedVillage);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(l =>
        l.region.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q) ||
        (l.district || '').toLowerCase().includes(q) ||
        (l.sub_county || '').toLowerCase().includes(q) ||
        (l.village || '').toLowerCase().includes(q) ||
        l.title.toLowerCase().includes(q)
      );
    }
    return result;
  }, [listings, searchText, selectedDistrict, selectedSubCounty, selectedVillage]);

  const hasGPS = !!(geo.latitude && geo.longitude);

  // Pagination diagnostics overlay — off by default. Enable in any environment:
  //   localStorage.setItem('welile-debug-pagination','1')
  const showPaginationDebug = (() => {
    try { return localStorage.getItem('welile-debug-pagination') === '1'; } catch { return false; }
  })();

  // Virtualized rendering: we fetch EVERY matching listing (can be 10,000+), but
  // only the cards in/near the viewport are ever mounted into the DOM, so the
  // sheet stays fast on low-end phones regardless of dataset size.
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => resultsRef.current,
    estimateSize: () => 280,
    overscan: 4,
    gap: 12,
    getItemKey: (index) => filtered[index]?.id ?? index,
  });

  // Reset scroll to the top when the result set changes (new filters / search)
  // so the user always sees the most relevant (nearest) houses first.
  useEffect(() => {
    resultsRef.current?.scrollTo({ top: 0 });
    virtualizer.scrollToOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegion, selectedCategory, selectedDistrict, selectedSubCounty, selectedVillage, searchText]);

  // Infinite scroll: load the next page automatically when the bottom sentinel
  // approaches the viewport. `loadMore` self-guards against overlapping/finished
  // requests, so it's safe to call on every intersection.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root: resultsRef.current, rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore, view]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[95vh] rounded-t-3xl p-0 flex flex-col"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // Focus the primary control (search input) when the sheet opens.
          requestAnimationFrame(() => searchInputRef.current?.focus());
        }}
        onCloseAutoFocus={(e) => {
          // Defer focus restoration to the parent (which remembers the exact
          // triggering card) so Escape/overlay/close-button all behave the same.
          e.preventDefault();
        }}
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="flex items-center gap-2">
              <Home className="h-5 w-5 text-primary" />
              {hasGPS && geo.city
                ? `Houses Near ${geo.city}`
                : 'Available Houses'}
            </SheetTitle>
            <div className="flex items-center rounded-full border border-border bg-muted/40 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${view === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                <List className="h-3.5 w-3.5" /> List
              </button>
              <button
                type="button"
                onClick={() => setView('map')}
                aria-pressed={view === 'map'}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${view === 'map' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                <MapIcon className="h-3.5 w-3.5" /> Map
              </button>
            </div>
          </div>

          <ShareNearbyHousesButton
            variant="full"
            latitude={geo.latitude}
            longitude={geo.longitude}
            area={geo.city}
            region={selectedRegion !== 'All Regions' ? selectedRegion : undefined}
          />

          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              // Dismiss on-screen keyboards, then move focus to the first
              // result so screen readers and keyboard users land on content.
              searchInputRef.current?.blur();
              const firstResult = resultsRef.current?.querySelector<HTMLElement>(
                '[data-house-card] a, [data-house-card] button, [data-house-card]'
              );
              if (firstResult) {
                firstResult.scrollIntoView({ block: 'start', behavior: 'smooth' });
                if (typeof firstResult.focus === 'function') {
                  try { firstResult.focus({ preventScroll: true }); } catch { /* ignore */ }
                }
              }
            }}
            className="relative"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="search"
              enterKeyHint="search"
              placeholder="Search by region, district, or address..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="pl-10"
              aria-label="Search houses by region, district, or address"
            />
            {/* Hidden submit so pressing Enter triggers onSubmit reliably. */}
            <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
              Search
            </button>
          </form>

          <div className="flex gap-2">
            <Select value={selectedRegion} onValueChange={handleRegionChange}>
              <SelectTrigger className="flex-1 h-9 text-xs">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map(r => (
                  <SelectItem key={r} value={r}>{regionLabel(r)}</SelectItem>
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
            {(searchText.trim().length > 0 || selectedRegion !== 'All Regions' || selectedCategory !== 'all' || selectedDistrict !== 'all' || selectedSubCounty !== 'all' || selectedVillage !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchText('');
                  setSelectedRegion('All Regions');
                  setSelectedCategory('all');
                  setSelectedDistrict('all');
                  setSelectedSubCounty('all');
                  setSelectedVillage('all');
                  // Keep keyboard focus usable by returning it to the primary control.
                  requestAnimationFrame(() => searchInputRef.current?.focus());
                }}
                aria-label="Clear search and filters"
                className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-border bg-background text-xs font-medium text-foreground hover:bg-muted active:scale-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>

          {/* Exact GPS-captured location filters (from the agent's listing).
              Only shown when houses expose these fields, cascading region →
              district → sub-county → village so tenants can drill to a precise area. */}
          {(districtOptions.length > 0 || subCountyOptions.length > 0 || villageOptions.length > 0) && (
            <div className="flex gap-2">
              <Select value={selectedDistrict} onValueChange={handleDistrictChange}>
                <SelectTrigger className="flex-1 h-9 text-xs">
                  <SelectValue placeholder="District" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Districts</SelectItem>
                  {districtOptions.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedSubCounty}
                onValueChange={handleSubCountyChange}
                disabled={subCountyOptions.length === 0}
              >
                <SelectTrigger className="flex-1 h-9 text-xs">
                  <SelectValue placeholder="Sub-county" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sub-counties</SelectItem>
                  {subCountyOptions.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedVillage}
                onValueChange={setSelectedVillage}
                disabled={villageOptions.length === 0}
              >
                <SelectTrigger className="flex-1 h-9 text-xs">
                  <SelectValue placeholder="Village" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Villages</SelectItem>
                  {villageOptions.map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </SheetHeader>

        {view === 'map' ? (
          <div className="flex-1 min-h-0">
            <HousesMapView
              listings={filtered}
              userCoords={hasGPS ? { lat: geo.latitude!, lng: geo.longitude! } : null}
              onSelectHouse={(l) => { onOpenChange(false); navigate(`/house/${l.id}`); }}
              onSwitchToList={() => setView('list')}
            />
          </div>
        ) : (
        <div ref={resultsRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="mx-auto w-full max-w-2xl space-y-3">
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
                suffix={hasGPS ? 'sorted by distance' : undefined}
              />
              {showPaginationDebug && (
                <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/40 px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  <div>src={metrics.source} · pages={metrics.pagesFetched} · cache={metrics.cacheHit ? 'hit' : 'miss'} · {metrics.complete ? 'complete' : 'more'}</div>
                  <div>rows shown={metrics.totalRows} · raw fetched={metrics.rawRowsFetched} · dups={metrics.duplicatesDetected} · no-photo={metrics.photolessFiltered}</div>
                  <div>firstPage={metrics.firstPageMs ?? '—'}ms · lastPage={metrics.lastPageMs ?? '—'}ms · total={metrics.totalMs}ms</div>
                </div>
              )}
              {/* Virtualized card list — only viewport cards are mounted. */}
              <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((vi) => {
                  const listing = filtered[vi.index];
                  if (!listing) return null;
                  return (
                    <div
                      key={vi.key}
                      data-index={vi.index}
                      ref={virtualizer.measureElement}
                      className="absolute left-0 top-0 w-full"
                      style={{ transform: `translateY(${vi.start}px)` }}
                    >
                      <HouseCard
                        listing={listing}
                        highlighted={vi.index === 0 && searchText.trim().length > 0}
                        onOpen={(l) => { onOpenChange(false); navigate(`/house/${l.short_code || l.id}`); }}
                      />
                    </div>
                  );
                })}
              </div>
              {/* Infinite-scroll sentinel — triggers loading the next page. */}
              {hasMore && <div ref={sentinelRef} className="h-1 w-full" aria-hidden="true" />}
              {loadingMore && (
                <LoadMoreProgress
                  loadedCount={filtered.length}
                  pagesFetched={metrics.pagesFetched}
                  hasMore={hasMore}
                  skeletonCount={2}
                  skeletonClassName="h-40 w-full rounded-2xl"
                />
              )}
            </>
          )}
          </div>
        </div>
        )}
        {view === 'list' && (() => {
          const target = filtered.find(l => l.latitude && l.longitude);
          const mapHref = target
            ? `https://www.google.com/maps/search/?api=1&query=${target.latitude},${target.longitude}`
            : (hasGPS
                ? `https://www.google.com/maps/search/?api=1&query=${geo.latitude},${geo.longitude}`
                : `https://www.google.com/maps/search/?api=1&query=houses+for+rent+${encodeURIComponent(selectedRegion !== 'All Regions' ? selectedRegion : 'Uganda')}`);
          const label = target
            ? `Open ${filtered.length > 1 ? 'nearest house' : target.title} in Google Maps`
            : 'Open Google Maps';
          return (
            <div className="sticky bottom-0 left-0 right-0 z-10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-background via-background/95 to-background/0 md:hidden">
              <a
                href={mapHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => announceMap(label)}
                aria-label={`${label} (opens in a new tab)`}
                className="flex items-center justify-center gap-2.5 w-full min-h-[56px] px-6 py-4 rounded-full bg-primary text-primary-foreground font-bold text-base shadow-xl active:scale-[0.98] transition-transform touch-manipulation focus:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Navigation className="h-5 w-5" />
                Tap to open in Google Maps
              </a>
            </div>
          );
        })()}
      </SheetContent>
    </Sheet>
  );
}

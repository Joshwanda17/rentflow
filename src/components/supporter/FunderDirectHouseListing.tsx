import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MapPin, Home, ArrowRight, X, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';
import { hapticTap } from '@/lib/haptics';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MoveInOfferBadge } from '@/components/house/MoveInOfferBadge';
import { ShareHouseButton } from '@/components/tenant/ShareHouseButton';

interface House {
  id: string;
  title: string;
  region: string;
  district: string | null;
  address: string | null;
  house_category: string;
  number_of_rooms: number;
  daily_rate: number;
  monthly_rent: number;
  image_urls: string[] | null;
  short_code: string | null;
  created_at: string;
}

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

const REGIONS = [
  'All Regions', 'Central', 'Eastern', 'Northern', 'Western',
  'Kampala', 'Wakiso', 'Mukono', 'Jinja', 'Mbale',
  'Mbarara', 'Gulu', 'Lira', 'Fort Portal', 'Masaka',
  'Entebbe', 'Nansana', 'Kira', 'Bweyogerere',
];

const ROOMS = [
  { value: 'all', label: 'Any rooms' },
  { value: '1', label: '1 room' },
  { value: '2', label: '2 rooms' },
  { value: '3', label: '3 rooms' },
  { value: '4+', label: '4+ rooms' },
];

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rooms_desc', label: 'Most rooms' },
];

function HouseCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="h-36 bg-muted/60 animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 rounded-md bg-muted/60 animate-pulse" />
        <div className="h-3 w-1/2 rounded-md bg-muted/60 animate-pulse" />
        <div className="h-4 w-1/3 rounded-md bg-muted/60 animate-pulse" />
      </div>
    </div>
  );
}

function ListingSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading houses">
      <div className="h-10 rounded-xl bg-muted/60 animate-pulse" />
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-9 w-[130px] rounded-lg bg-muted/60 animate-pulse" />
        <div className="h-9 w-[130px] rounded-lg bg-muted/60 animate-pulse" />
        <div className="h-9 w-[132px] rounded-lg bg-muted/60 animate-pulse" />
        <div className="h-9 w-[150px] rounded-lg bg-muted/60 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <HouseCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function FunderDirectHouseListing() {
  const navigate = useNavigate();
  const [houses, setHouses] = useState<House[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalMatch, setTotalMatch] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const mountedRef = useRef(true);
  const countTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  const PAGE_SIZE = 100;

  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('all');
  const [category, setCategory] = useState('all');
  const [rooms, setRooms] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchHouses = useCallback(async (isRetry = false, append = false) => {
    if (isRetry) {
      setError(false);
      setLoading(true);
    }
    if (append) setLoadingMore(true);
    const offset = append ? (houses?.length ?? 0) : 0;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: sbError } = await (supabase as any)
        .from('house_listings')
        .select(
          'id, title, region, district, address, house_category, number_of_rooms, daily_rate, monthly_rent, image_urls, short_code, created_at'
        )
        .eq('status', 'available')
        .eq('is_hidden', false)
        .eq('verified', true)
        .is('tenant_id', null)
        .not('image_urls', 'is', null)
        .neq('image_urls', '{}')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (sbError) throw sbError;

      if (!mountedRef.current) return;
      const rows = ((data as House[]) || []).filter(
        (h) =>
          Array.isArray(h.image_urls) &&
          h.image_urls.some((u) => typeof u === 'string' && u.trim().length > 0)
      );
      setHasMore(((data as House[]) || []).length === PAGE_SIZE);
      setHouses((prev) => (append && prev ? [...prev, ...rows] : rows));
      setError(false);
    } catch (err) {
      console.error('[FunderDirectHouseListing] fetch error:', err);
      if (!mountedRef.current) return;
      if (!append) setError(true);
      toast.error('Couldn’t load houses', {
        description: 'Please check your connection and try again.',
      });
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [houses]);

  const fetchMatchCount = useCallback(async () => {
    setCountLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('house_listings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'available')
        .eq('is_hidden', false)
        .eq('verified', true)
        .is('tenant_id', null)
        .not('image_urls', 'is', null)
        .neq('image_urls', '{}');

      const q = search.trim();
      if (q) {
        const like = `%${q}%`;
        query = query.or(
          `title.ilike.${like},region.ilike.${like},district.ilike.${like},address.ilike.${like},short_code.ilike.${like}`
        );
      }

      if (region !== 'all') {
        const r = region.toLowerCase();
        query = query.or(`region.ilike.${r},district.ilike.${r}`);
      }

      if (category !== 'all') {
        query = query.eq('house_category', category);
      }

      if (rooms !== 'all') {
        if (rooms === '4+') {
          query = query.gte('number_of_rooms', 4);
        } else {
          query = query.eq('number_of_rooms', parseInt(rooms, 10));
        }
      }

      const { count, error: sbError } = await query;
      if (sbError) throw sbError;
      if (!mountedRef.current) return;
      setTotalMatch(count ?? null);
    } catch (err) {
      console.error('[FunderDirectHouseListing] count error:', err);
    } finally {
      if (mountedRef.current) setCountLoading(false);
    }
  }, [search, region, category, rooms]);

  useEffect(() => {
    fetchHouses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (countTimerRef.current) clearTimeout(countTimerRef.current);
    countTimerRef.current = setTimeout(() => {
      fetchMatchCount();
    }, 150);
    return () => {
      if (countTimerRef.current) clearTimeout(countTimerRef.current);
    };
  }, [fetchMatchCount]);


  const filtered = useMemo(() => {
    if (!houses) return [];
    let result = [...houses];

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (h) =>
          h.title.toLowerCase().includes(q) ||
          h.region.toLowerCase().includes(q) ||
          (h.district || '').toLowerCase().includes(q) ||
          (h.address || '').toLowerCase().includes(q) ||
          (h.short_code || '').toLowerCase().includes(q)
      );
    }

    if (region !== 'all') {
      const r = region.toLowerCase();
      result = result.filter(
        (h) =>
          h.region.toLowerCase() === r || (h.district || '').toLowerCase() === r
      );
    }

    if (category !== 'all') {
      result = result.filter((h) => h.house_category === category);
    }

    if (rooms !== 'all') {
      if (rooms === '4+') {
        result = result.filter((h) => h.number_of_rooms >= 4);
      } else {
        const n = parseInt(rooms, 10);
        result = result.filter((h) => h.number_of_rooms === n);
      }
    }

    result.sort((a, b) => {
      if (sortBy === 'newest') {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
      if (sortBy === 'price_asc') return a.daily_rate - b.daily_rate;
      if (sortBy === 'price_desc') return b.daily_rate - a.daily_rate;
      if (sortBy === 'rooms_desc') return b.number_of_rooms - a.number_of_rooms;
      return 0;
    });

    return result;
  }, [houses, search, region, category, rooms, sortBy]);

  const openHouse = (house: House) => {
    hapticTap();
    navigate(`/house/${house.short_code || house.id}`, { state: { from: 'funder' } });
  };

  const goExplore = () => {
    hapticTap();
    navigate('/find-a-house', { state: { from: 'funder' } });
  };

  const clearFilters = () => {
    setSearch('');
    setRegion('all');
    setCategory('all');
    setRooms('all');
    setSortBy('newest');
  };

  const activeFilterChips = [
    region !== 'all' && {
      label: region,
      onRemove: () => setRegion('all'),
    },
    category !== 'all' && {
      label: CATEGORIES.find((c) => c.value === category)?.label || category,
      onRemove: () => setCategory('all'),
    },
    rooms !== 'all' && {
      label: ROOMS.find((r) => r.value === rooms)?.label || rooms,
      onRemove: () => setRooms('all'),
    },
  ].filter(Boolean) as { label: string; onRemove: () => void }[];

  if (loading) {
    return <ListingSkeleton />;
  }

  if (error && houses === null) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-6 text-center space-y-3">
        <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Couldn’t load houses</p>
          <p className="text-[11px] text-muted-foreground">
            Something went wrong while fetching the available houses. Please try again.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchHouses(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 touch-manipulation"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by area, title, or address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10 text-sm"
          aria-label="Search houses"
        />
      </div>

      {/* Filters + live count */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="h-9 text-xs w-[130px]" aria-label="Filter by region">
            <SelectValue placeholder="Region" />
          </SelectTrigger>
          <SelectContent>
            {REGIONS.map((r) => (
              <SelectItem
                key={r === 'All Regions' ? 'all' : r}
                value={r === 'All Regions' ? 'all' : r}
                className="text-xs"
              >
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 text-xs w-[130px]" aria-label="Filter by house type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value} className="text-xs">
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={rooms} onValueChange={setRooms}>
          <SelectTrigger className="h-9 text-xs w-[132px]" aria-label="Filter by number of rooms">
            <SelectValue placeholder="Rooms" />
          </SelectTrigger>
          <SelectContent>
            {ROOMS.map((r) => (
              <SelectItem key={r.value} value={r.value} className="text-xs">
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-9 text-xs w-[150px]" aria-label="Sort houses">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground">
          {countLoading && (
            <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
          <span aria-live="polite" aria-atomic="true">
            {(totalMatch ?? filtered.length).toLocaleString()} {((totalMatch ?? filtered.length) === 1 ? 'house' : 'houses')} found
          </span>
        </div>
      </div>


      {/* Active filter chips */}
      <AnimatePresence>
        {activeFilterChips.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap items-center gap-2 overflow-hidden"
          >
            <span className="text-[10px] text-muted-foreground font-medium">Active:</span>
            {activeFilterChips.map((f, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] gap-1 pr-1">
                {f.label}
                <button
                  type="button"
                  onClick={f.onRemove}
                  className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                  aria-label={`Remove ${f.label} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <button
              type="button"
              onClick={clearFilters}
              className="text-[10px] text-primary font-semibold ml-auto"
            >
              Clear all
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results header */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          Showing {filtered.length.toLocaleString()} of {(totalMatch ?? filtered.length).toLocaleString()}
        </p>
        <button
          type="button"
          onClick={goExplore}
          className="text-[11px] text-primary font-semibold flex items-center gap-0.5 touch-manipulation"
        >
          See all <ArrowRight className="h-3 w-3" />
        </button>
      </div>


      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <Home className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm font-semibold text-foreground">No houses match your filters</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Try adjusting your search or filters.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 text-xs text-primary font-semibold"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((house) => (
            <motion.div
              key={house.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              role="button"
              tabIndex={0}
              onClick={() => openHouse(house)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openHouse(house);
              }}
              className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98] transition-all cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={`View details for ${house.title}`}
            >
              <div className="relative w-full h-36 bg-muted">
                {house.image_urls?.[0] ? (
                  <img
                    src={house.image_urls[0]}
                    alt={house.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Home className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-full bg-background/85 backdrop-blur text-[9px] font-bold text-foreground">
                  {house.number_of_rooms} rm
                </span>
                <span
                  className="absolute top-2 right-2"
                  onClick={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  <ShareHouseButton
                    listingId={house.id}
                    title={house.title}
                    region={house.region}
                    dailyRate={house.daily_rate}
                    shortCode={house.short_code}
                    mode="share"
                    address={house.address}
                    monthlyRent={house.monthly_rent}
                    rooms={house.number_of_rooms}
                    category={house.house_category}
                  />
                </span>
              </div>
              <div className="p-3 space-y-1">
                <p className="font-semibold text-sm truncate">{house.title}</p>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {house.region}
                    {house.district ? `, ${house.district}` : ''}
                  </span>
                </div>
                <p className="text-sm font-black text-success leading-none pt-0.5">
                  {formatUGX(house.daily_rate)}
                  <span className="text-[9px] font-normal text-muted-foreground">/day</span>
                </p>
                <MoveInOfferBadge className="mt-1" />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {hasMore && filtered.length > 0 && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => fetchHouses(false, true)}
            disabled={loadingMore}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-60 touch-manipulation"
          >
            {loadingMore ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </>
            ) : (
              <>Load more houses</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

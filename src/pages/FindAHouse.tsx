import { useState, useMemo, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { ImageLightbox } from '@/components/marketplace/ImageLightbox';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Search, MapPin, Droplets, Zap, ShieldCheck, Car, Sofa, Home, DoorOpen,
  ChevronLeft, ChevronRight, Clock, ExternalLink, Share2, Copy, Check, ZoomIn
} from 'lucide-react';
import { WhatsAppAgentButton } from '@/components/tenant/WhatsAppAgentButton';
import { ShareHouseButton } from '@/components/tenant/ShareHouseButton';
import HouseRatingBadge from '@/components/house/HouseRatingBadge';
import { useNearbyHouses, HouseListing } from '@/hooks/useHouseListings';
import { useGeolocation } from '@/hooks/useGeolocation';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

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

const SITE_URL = 'https://welilereceipts.com';

function HouseImageCarousel({ images, title, onImageClick }: { images: string[] | null; title: string; onImageClick?: (index: number) => void }) {
  const [idx, setIdx] = useState(0);
  if (!images || images.length === 0) {
    return (
      <div className="w-full aspect-[4/3] rounded-xl bg-muted flex items-center justify-center">
        <Home className="h-12 w-12 text-muted-foreground/20" />
      </div>
    );
  }
  return (
    <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-muted">
      <img
        src={images[idx]}
        alt={title}
        className="w-full h-full object-cover cursor-pointer"
        loading="lazy"
        onClick={() => onImageClick?.(idx)}
      />
      {/* Tap-to-view overlay hint */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
      <button
        type="button"
        onClick={() => onImageClick?.(idx)}
        className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/90 text-black text-xs font-bold px-4 py-2 rounded-full flex items-center gap-1.5 shadow-lg active:scale-95 transition-transform min-h-[40px]"
      >
        <ZoomIn className="h-4 w-4" />
        Tap to view full screen
      </button>
      {images.length > 1 && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); setIdx(i => (i - 1 + images.length) % images.length); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 min-w-[40px] min-h-[40px] flex items-center justify-center active:scale-95 transition-transform">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setIdx(i => (i + 1) % images.length); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 min-w-[40px] min-h-[40px] flex items-center justify-center active:scale-95 transition-transform">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full font-bold">
            {idx + 1}/{images.length}
          </div>
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <span key={i} className={`h-2 rounded-full transition-all ${i === idx ? 'bg-white w-5' : 'bg-white/50 w-2'}`} />
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
    <a href={linkUrl} target="_blank" rel="noopener noreferrer"
      className="block relative w-full h-32 rounded-xl overflow-hidden bg-muted border border-border group">
      <iframe src={mapUrl} className="w-full h-full pointer-events-none" title={`Map: ${title}`} loading="lazy" style={{ border: 0 }} />
      <div className="absolute bottom-2 right-2 bg-card/90 backdrop-blur-sm text-foreground text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 border border-border shadow-sm group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
        <ExternalLink className="h-3 w-3" /> Open in Maps
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

function PublicHouseCard({ listing }: { listing: HouseListing }) {
  const categoryLabel = CATEGORIES.find(c => c.value === listing.house_category)?.label || listing.house_category;
  const dist = listing.distance_km;
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(0);

  const lightboxImages = useMemo(() =>
    (listing.image_urls || []).map((url, i) => ({ id: `${listing.id}-${i}`, image_url: url })),
    [listing.image_urls, listing.id]
  );

  const openLightbox = useCallback((index: number) => {
    setLightboxIdx(index);
    setLightboxOpen(true);
  }, []);

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm"
      itemScope itemType="https://schema.org/Accommodation"
    >
      <div className="relative">
        <HouseImageCarousel images={listing.image_urls} title={listing.title} onImageClick={openLightbox} />
        {dist !== undefined && dist < 9999 && (
          <span className="absolute top-2 left-2 text-[10px] font-medium text-white bg-primary/80 px-2 py-0.5 rounded-full">
            ~{dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`}
          </span>
        )}
        <Badge variant="secondary" className="absolute top-2 right-2 text-[10px]">{categoryLabel}</Badge>
        <HouseRatingBadge houseId={listing.id} houseLat={listing.latitude} houseLng={listing.longitude} className="absolute bottom-2 left-2" />
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base truncate" itemProp="name">{listing.title}</h2>
            <div className="flex items-center gap-1 mt-0.5" itemProp="address">
              <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground truncate">
                {listing.address}, {listing.region}
                {listing.district ? `, ${listing.district}` : ''}
              </p>
            </div>
          </div>
          <VerificationBadge verified={listing.verified} status={listing.status} />
        </div>

        <div className="p-4 rounded-xl bg-gradient-to-br from-success/20 to-success/10 border-2 border-success/30">
          <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Daily Rent</p>
          <p className="text-3xl font-black text-success leading-none mb-1" itemProp="price">{formatUGX(listing.daily_rate)}</p>
          <p className="text-xs text-muted-foreground font-medium">per day · pay as you stay</p>
        </div>

        {/* Thumbnail strip — tap any to open fullscreen */}
        {lightboxImages.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
            {lightboxImages.map((img, i) => (
              <button
                key={img.id}
                onClick={() => openLightbox(i)}
                className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 border-transparent hover:border-primary active:scale-95 transition-all"
              >
                <img src={img.image_url} alt={`${listing.title} ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs">
            <DoorOpen className="h-3 w-3" /> {listing.number_of_rooms} room{listing.number_of_rooms > 1 ? 's' : ''}
          </span>
          {listing.has_water && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs"><Droplets className="h-3 w-3" /> Water</span>}
          {listing.has_electricity && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 text-warning text-xs"><Zap className="h-3 w-3" /> Power</span>}
          {listing.has_security && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-xs"><ShieldCheck className="h-3 w-3" /> Security</span>}
          {listing.has_parking && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-xs"><Car className="h-3 w-3" /> Parking</span>}
          {listing.is_furnished && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs"><Sofa className="h-3 w-3" /> Furnished</span>}
        </div>

        {listing.description && <p className="text-xs text-muted-foreground line-clamp-2" itemProp="description">{listing.description}</p>}

        <LocationMap lat={listing.latitude} lng={listing.longitude} title={listing.title} />

        {/* WhatsApp Agent */}
        <WhatsAppAgentButton phone={listing.agent_phone} agentName={listing.agent_name} houseTitle={listing.title} />

        {/* Share */}
        <ShareHouseButton listingId={listing.id} title={listing.title} region={listing.region} dailyRate={listing.daily_rate} shortCode={listing.short_code} variant="full" />
      </div>

      {/* Fullscreen Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxIdx}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        productName={listing.title}
      />
    </motion.article>
  );
}

export default function FindAHouse() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const geo = useGeolocation(true);
  const [searchText, setSearchText] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All Regions');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [geoDefaultApplied, setGeoDefaultApplied] = useState(false);
  const [copied, setCopied] = useState(false);

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
    enabled: !geo.loading,
  });

  const filtered = useMemo(() => {
    let result = [...listings];
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(l =>
        l.region.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q) ||
        (l.district || '').toLowerCase().includes(q) ||
        l.title.toLowerCase().includes(q)
      );
    }
    // Sort by lowest daily rate first
    result.sort((a, b) => a.daily_rate - b.daily_rate);
    return result;
  }, [listings, searchText]);

  const hasGPS = !!(geo.latitude && geo.longitude);

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

  const pageTitle = hasGPS && geo.city
    ? `Houses for Rent Near ${geo.city} — Daily Rent | Welile`
    : 'Find a House Near You — Daily Rent | Welile';

  const pageDescription = 'Browse affordable rental houses near you. Pay daily rent — no big deposits. Verified listings with Google Maps locations across Uganda.';

  const lowestPrice = filtered.length > 0 ? filtered[0].daily_rate : null;
  const seoDescription = lowestPrice
    ? `Rent houses from ${formatUGX(lowestPrice)}/day in Uganda. No deposits. ${filtered.length} verified listings. Pay daily — move in today!`
    : pageDescription;

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
        {/* Header */}
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Home className="h-5 w-5 text-primary" />
              <h1 className="font-bold text-lg">
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
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                <SelectTrigger className="flex-1 h-9 text-xs"><SelectValue placeholder="Region" /></SelectTrigger>
                <SelectContent>
                  {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="flex-1 h-9 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Listings */}
        <main className="max-w-2xl mx-auto px-4 py-4 space-y-3 pb-20">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-2xl" />
            ))
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <Home className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground font-medium">No houses found</p>
              <p className="text-xs text-muted-foreground">Try a different region or category</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {filtered.length} house{filtered.length !== 1 ? 's' : ''} available · sorted by lowest price
              </p>
              {filtered.map(listing => (
                <PublicHouseCard key={listing.id} listing={listing} />
              ))}
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

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

import { Sparkles, MapPin, DoorOpen, ChevronRight, ZoomIn } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { MoveInOfferBadge } from '@/components/house/MoveInOfferBadge';
import { ImageLightbox } from '@/components/marketplace/ImageLightbox';

interface SuggestedHousesCardProps {
  userId: string;
  onViewAll: () => void;
}

interface SuggestedHouse {
  id: string;
  title: string;
  address: string;
  region: string;
  district: string | null;
  house_category: string;
  number_of_rooms: number;
  monthly_rent: number;
  daily_rate: number;
  image_urls: string[] | null;
  short_code: string | null;
  latitude: number | null;
  longitude: number | null;
  agent_id: string;
  agent_name: string | null;
  agent_phone: string | null;
  agent_rating: number | null;
}

async function fetchSuggestions(userId: string): Promise<SuggestedHouse[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data: lastRequest } = await client
    .from('rent_requests')
    .select('rent_amount')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  const maxRent = lastRequest?.[0]?.rent_amount ? lastRequest[0].rent_amount * 1.3 : 500000;

  const { data: houses } = await client
    .from('house_listings')
    .select('id, title, address, region, district, house_category, number_of_rooms, monthly_rent, daily_rate, image_urls, short_code, latitude, longitude, agent_id')
    .eq('status', 'available')
    .eq('is_hidden', false)
    .eq('verified', true)
    .is('tenant_id', null)
    .lte('monthly_rent', maxRent)
    .order('created_at', { ascending: false })
    .limit(6);

  if (!houses?.length) return [];

  // Only suggest houses that have at least one real photo.
  const withPhotos = (houses as any[]).filter(
    (h) => Array.isArray(h.image_urls) && h.image_urls.some((u: any) => typeof u === 'string' && u.trim().length > 0)
  );
  if (!withPhotos.length) return [];

  // Tenants cannot read agents' `profiles` directly (RLS). Use the secure RPC
  // that returns only the listing agent's contact so the WhatsApp button works.
  const listingIds = withPhotos.map((h: any) => h.id).filter(Boolean);
  let agentMap = new Map<string, { full_name: string | null; phone: string | null; avg_rating: number | null }>();
  if (listingIds.length) {
    const { data: contacts } = await client.rpc('get_listing_agent_contacts', { p_listing_ids: listingIds });
    if (contacts) {
      agentMap = new Map(
        (contacts as any[]).map((r) => [r.listing_id, { full_name: r.full_name, phone: r.phone, avg_rating: r.avg_rating }])
      );
    }
  }

  return withPhotos.map((h: any) => ({
    ...h,
    agent_name: agentMap.get(h.id)?.full_name || null,
    agent_phone: agentMap.get(h.id)?.phone || null,
    agent_rating: agentMap.get(h.id)?.avg_rating ?? null,
  }));
}

export function SuggestedHousesCard({ userId, onViewAll }: SuggestedHousesCardProps) {
  const navigate = useNavigate();
  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['tenant-suggested-houses', userId],
    queryFn: () => fetchSuggestions(userId),
    staleTime: 300000,
  });
  const [lightbox, setLightbox] = useState<{ images: string[]; title: string; houseId: string } | null>(null);

  if (isLoading || !suggestions?.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-base flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          Suggested For You
        </h2>
        <button type="button" onClick={onViewAll} className="text-xs text-primary font-medium flex items-center gap-0.5">
          View All <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
        {suggestions.slice(0, 4).map(house => (
          <div
            key={house.id}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/house/${house.short_code || house.id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(`/house/${house.short_code || house.id}`);
              }
            }}
            aria-label={`View details for ${house.title}`}
            className="rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:border-primary/40 hover:shadow-md active:scale-[0.98] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {/* Image */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (house.image_urls?.length) {
                  setLightbox({ images: house.image_urls, title: house.title, houseId: house.id });
                } else {
                  navigate(`/house/${house.short_code || house.id}`);
                }
              }}
              aria-label={`View photos of ${house.title}`}
              className="relative block h-32 w-full bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {house.image_urls?.[0] ? (
                <>
                  <img
                    src={house.image_urls[0]}
                    alt={`${house.title} in ${house.region}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white rounded-full p-1">
                    <ZoomIn className="h-3 w-3" />
                  </span>
                </>
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <DoorOpen className="h-7 w-7 text-muted-foreground/30" />
                </div>
              )}
              <span className="absolute top-2 left-2">
                <MoveInOfferBadge />
              </span>
            </button>

            {/* Title + area */}
            <div className="px-3 pt-3">
              <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1">
                <DoorOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> {house.title}
              </p>
              <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {house.region}{house.district ? `, ${house.district}` : ''}
              </p>
            </div>

            {/* Footer */}
            <div className="p-3 pt-2">
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Daily amount</p>
                <p className="text-sm font-bold text-foreground leading-tight truncate">{formatUGX(house.daily_rate)}</p>
                <p className="text-[10px] text-muted-foreground leading-tight truncate">
                  {house.house_category} · {house.number_of_rooms} rooms
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {lightbox && (
        <ImageLightbox
          images={lightbox.images.map((url, i) => ({ id: `${i}`, image_url: url }))}
          open={!!lightbox}
          onClose={() => setLightbox(null)}
          productName={lightbox.title}
          memoryKey={`house:${lightbox.houseId}`}
        />
      )}
    </div>
  );
}

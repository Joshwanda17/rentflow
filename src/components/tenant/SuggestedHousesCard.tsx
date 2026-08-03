import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, MapPin, DoorOpen, ChevronRight, ZoomIn, ArrowRight } from 'lucide-react';
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {suggestions.slice(0, 4).map(house => (
          <Card key={house.id} className="overflow-hidden border-border/60 hover:border-primary/40 transition-colors">
            <CardContent className="p-0">
              <div
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
                className="flex gap-3 p-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {/* Thumbnail */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (house.image_urls?.length) {
                      setLightbox({ images: house.image_urls, title: house.title, houseId: house.id });
                    }
                  }}
                  className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-muted group"
                  aria-label="View photos"
                >
                  {house.image_urls?.[0] ? (
                    <>
                      <img src={house.image_urls[0]} alt={house.title} className="w-full h-full object-cover" loading="lazy" />
                      <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white rounded-full p-1">
                        <ZoomIn className="h-2.5 w-2.5" />
                      </span>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <DoorOpen className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  )}
                </button>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm truncate">{house.title}</p>
                      <MoveInOfferBadge />
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{house.region}{house.district ? `, ${house.district}` : ''}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] h-4 px-1">{house.house_category}</Badge>
                      <Badge variant="outline" className="text-[9px] h-4 px-1">{house.number_of_rooms} rooms</Badge>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <p className="text-sm font-black text-success">{formatUGX(house.daily_rate)}<span className="text-[10px] font-normal text-muted-foreground">/day</span></p>
                    <span className="text-[10px] font-medium text-primary flex items-center gap-0.5">
                      View <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
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

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, MapPin, DoorOpen, ChevronRight } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { WhatsAppAgentButton } from '@/components/tenant/WhatsAppAgentButton';
import { ShareHouseButton } from '@/components/tenant/ShareHouseButton';

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
  agent_id: string;
  agent_name: string | null;
  agent_phone: string | null;
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
    .select('id, title, address, region, district, house_category, number_of_rooms, monthly_rent, daily_rate, image_urls, short_code, agent_id')
    .eq('status', 'available')
    .is('tenant_id', null)
    .lte('monthly_rent', maxRent)
    .order('created_at', { ascending: false })
    .limit(6);

  if (!houses?.length) return [];

  const agentIds = [...new Set(houses.map((h: any) => h.agent_id).filter(Boolean))] as string[];
  let agentMap = new Map<string, { full_name: string | null; phone: string | null }>();
  if (agentIds.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, phone').in('id', agentIds);
    if (profiles) agentMap = new Map(profiles.map(p => [p.id, p]));
  }

  return houses.map((h: any) => ({
    ...h,
    agent_name: agentMap.get(h.agent_id)?.full_name || null,
    agent_phone: agentMap.get(h.agent_id)?.phone || null,
  }));
}

export function SuggestedHousesCard({ userId, onViewAll }: SuggestedHousesCardProps) {
  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['tenant-suggested-houses', userId],
    queryFn: () => fetchSuggestions(userId),
    staleTime: 300000,
  });

  if (isLoading || !suggestions?.length) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-base flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          Suggested For You
        </h2>
        <button onClick={onViewAll} className="text-xs text-primary font-medium flex items-center gap-0.5">
          View All <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {suggestions.slice(0, 3).map(house => (
          <Card key={house.id} className="overflow-hidden border-border/60">
            <CardContent className="p-0">
              <div className="flex gap-3 p-3">
                {/* Thumbnail */}
                <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-muted">
                  {house.image_urls?.[0] ? (
                    <img src={house.image_urls[0]} alt={house.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <DoorOpen className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-semibold text-sm truncate">{house.title}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{house.region}{house.district ? `, ${house.district}` : ''}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] h-4 px-1">{house.house_category}</Badge>
                    <Badge variant="outline" className="text-[9px] h-4 px-1">{house.number_of_rooms} rooms</Badge>
                  </div>
                  <div className="flex items-center justify-between pt-0.5">
                    <p className="text-sm font-black text-success">{formatUGX(house.daily_rate)}<span className="text-[10px] font-normal text-muted-foreground">/day</span></p>
                    <div className="flex items-center gap-1">
                      <ShareHouseButton listingId={house.id} title={house.title} region={house.region} dailyRate={house.daily_rate} shortCode={house.short_code} />
                      {house.agent_phone && (
                        <WhatsAppAgentButton phone={house.agent_phone} agentName={house.agent_name} houseTitle={house.title} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}

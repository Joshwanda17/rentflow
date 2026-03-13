import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Shield, Clock, HandCoins, Home } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { calculateSupporterReward } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';
import { formatDistanceToNow } from 'date-fns';
import React from 'react';

interface HouseOpportunity {
  id: string;
  shortId: string;
  area: string;
  city: string;
  rentAmount: number;
  durationDays: number;
  reward: number;
  agentVerified: boolean;
  managerVerified: boolean;
  createdAt: string;
}

interface HouseOpportunitiesProps {
  onFund: (id: string) => void;
  isLocked?: boolean;
  onLockedClick?: () => void;
  onRefreshRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function HouseOpportunities({ onFund, isLocked, onLockedClick, onRefreshRef }: HouseOpportunitiesProps) {
  const { formatAmount } = useCurrency();
  const [opportunities, setOpportunities] = useState<HouseOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rent_requests')
      .select(`
        id,
        rent_amount,
        duration_days,
        status,
        created_at,
        agent_verified,
        manager_verified,
        agent_id,
        landlord:landlords!rent_requests_landlord_id_fkey(property_address)
      `)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      const houses: HouseOpportunity[] = data.map(r => {
        const address = (r.landlord as any)?.property_address || '';
        const parts = address.split(',').map((s: string) => s.trim());
        const area = parts[0] || 'Unknown Area';
        const city = parts[1] || parts[0] || 'Uganda';

        return {
          id: r.id,
          shortId: r.id.slice(0, 6).toUpperCase(),
          area,
          city,
          rentAmount: Number(r.rent_amount),
          durationDays: r.duration_days,
          reward: calculateSupporterReward(Number(r.rent_amount)),
          agentVerified: r.agent_verified || false,
          managerVerified: r.manager_verified || false,
          createdAt: r.created_at,
        };
      });
      setOpportunities(houses);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  useEffect(() => {
    if (onRefreshRef) {
      onRefreshRef.current = fetchOpportunities;
      return () => { onRefreshRef.current = null; };
    }
  }, [onRefreshRef, fetchOpportunities]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-2xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div className="text-center py-10 space-y-3">
        <p className="text-center text-sm font-semibold italic text-purple-600 dark:text-purple-400">
          ✨ Welile is turning rent into an asset
        </p>
        <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto">
          <Home className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <p className="font-bold text-foreground text-sm">No Opportunities</p>
        <p className="text-xs text-muted-foreground">Check back soon for new houses to fund.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏠</span>
          <h3 className="font-bold text-foreground text-sm">Available Houses</h3>
        </div>
        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
          {opportunities.length} available
        </Badge>
      </div>

      <p className="text-center text-sm font-semibold italic text-purple-600 dark:text-purple-400">
        ✨ Welile is turning rent into an asset
      </p>

      <div className="space-y-2">
        {opportunities.map((house, i) => (
          <motion.div
            key={house.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.2 }}
          >
            <Card className="border border-border/60 bg-card">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* House ID + location */}
                    <div>
                      <p className="font-bold text-sm text-foreground">House #{house.shortId}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{house.area}, {house.city}</span>
                      </div>
                    </div>

                    {/* Rent + Reward */}
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold">{formatAmount(house.rentAmount)}</span>
                      <span className="text-xs font-bold text-success">+{formatAmount(house.reward)}</span>
                    </div>

                    {/* Meta chips */}
                    <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDistanceToNow(new Date(house.createdAt), { addSuffix: true })}
                      </span>
                      <span>•</span>
                      <span>{house.durationDays}d</span>
                      {house.agentVerified && (
                        <>
                          <span>•</span>
                          <Badge variant="outline" className="text-[8px] px-1 py-0 bg-success/10 text-success border-success/30 h-4">
                            <Shield className="h-2 w-2 mr-0.5" />
                            Verified
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Fund button */}
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      hapticTap();
                      if (isLocked) {
                        onLockedClick?.();
                        return;
                      }
                      onFund(house.id);
                    }}
                    size="sm"
                    className="h-10 px-4 font-bold shrink-0"
                  >
                    <HandCoins className="h-4 w-4 mr-1.5" />
                    Fund
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

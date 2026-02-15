import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, TrendingUp, HandCoins, ChevronRight, Home } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { calculateSupporterReward } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';
import React from 'react';

export interface RentCategory {
  category: string;
  totalHouses: number;
  totalRent: number;
  avgRent: number;
  expectedReturn: number;
}

interface RentCategoryFeedProps {
  onFundCategory: (category: string) => void;
  isLocked?: boolean;
  onLockedClick?: () => void;
  onRefreshRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

const CACHE_KEY = 'welile_rent_categories';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Predefined Welile housing product tiers
interface CategoryTier {
  name: string;
  label: string;
  emoji: string;
  rentRange: [number, number]; // min, max rent to bucket into this tier
}

const WELILE_TIERS: CategoryTier[] = [
  { name: 'single-room', label: 'Welile Single Room', emoji: '🚪', rentRange: [0, 150000] },
  { name: 'double-room', label: 'Welile Double Room', emoji: '🛏️', rentRange: [150001, 250000] },
  { name: '1-bed', label: 'Welile 1 Bed House', emoji: '🏠', rentRange: [250001, 400000] },
  { name: '2-bed', label: 'Welile 2 Bedroom House', emoji: '🏡', rentRange: [400001, 700000] },
  { name: '2-bed-full', label: 'Welile 2 Bed + Sitting Room, Kitchen & 2 Toilets', emoji: '🏘️', rentRange: [700001, 1200000] },
  { name: '3-bed', label: 'Welile 3 Bedroom Apartment', emoji: '🏢', rentRange: [1200001, 2500000] },
  { name: '3-bed-luxury', label: 'Welile 3 Bed Luxury + Boys Quarter', emoji: '🏰', rentRange: [2500001, 5000000] },
  { name: '4-bed', label: 'Welile 4+ Bedroom Villa', emoji: '🏛️', rentRange: [5000001, 10000000] },
  { name: 'commercial', label: 'Welile Commercial Property', emoji: '🏪', rentRange: [10000001, Infinity] },
];

const getTierForRent = (amount: number): CategoryTier => {
  return WELILE_TIERS.find(t => amount >= t.rentRange[0] && amount <= t.rentRange[1]) || WELILE_TIERS[0];
};

export function RentCategoryFeed({ onFundCategory, isLocked, onLockedClick, onRefreshRef }: RentCategoryFeedProps) {
  const { formatAmount } = useCurrency();
  const [categories, setCategories] = useState<RentCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    // Check cache first
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) {
          setCategories(data);
          setLoading(false);
          return;
        }
      }
    } catch {}

    setLoading(true);

    const { data, error } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, request_city, duration_days')
      .eq('status', 'approved')
      .limit(500);

    if (!error && data) {
      const tierMap = new Map<string, { tier: CategoryTier; count: number; totalRent: number; totalReward: number }>();

      // Initialize all tiers
      WELILE_TIERS.forEach(t => tierMap.set(t.name, { tier: t, count: 0, totalRent: 0, totalReward: 0 }));

      data.forEach(r => {
        const amount = Number(r.rent_amount);
        const tier = getTierForRent(amount);
        const existing = tierMap.get(tier.name)!;
        existing.count += 1;
        existing.totalRent += amount;
        existing.totalReward += calculateSupporterReward(amount);
      });

      const cats: RentCategory[] = Array.from(tierMap.values())
        .map(v => ({
          category: v.tier.label,
          totalHouses: v.count,
          totalRent: v.totalRent,
          avgRent: v.count > 0 ? Math.round(v.totalRent / v.count) : 0,
          expectedReturn: v.totalReward,
        }));

      setCategories(cats);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: cats, timestamp: Date.now() }));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (onRefreshRef) {
      onRefreshRef.current = fetchCategories;
      return () => { onRefreshRef.current = null; };
    }
  }, [onRefreshRef, fetchCategories]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 rounded-2xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  // All tiers always shown, even with 0 houses

  const totalHouses = categories.reduce((s, c) => s + c.totalHouses, 0);
  const totalRent = categories.reduce((s, c) => s + c.totalRent, 0);

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-foreground text-sm">Rent Categories</h3>
        </div>
        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
          {totalHouses} houses • {categories.length} categories
        </Badge>
      </div>

      {/* Aggregate hero stat */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl bg-gradient-to-r from-primary via-primary/90 to-primary/80 text-primary-foreground p-5 shadow-xl shadow-primary/25 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10">
          <p className="text-xs opacity-80 uppercase tracking-wider font-medium mb-1">Total Rent Requested</p>
          <p className="text-3xl font-black tracking-tight">{formatAmount(totalRent)}</p>
          <div className="flex items-center gap-4 mt-2 text-xs opacity-80">
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {categories.length} categories
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {totalHouses} houses
            </span>
          </div>
        </div>
      </motion.div>

      {/* Category cards */}
      <div className="space-y-2">
        {categories.map((cat, i) => {
          const isEmpty = cat.totalHouses === 0;
          return (
            <motion.div
              key={cat.category}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.2 }}
            >
              <Card className={`border border-border/60 bg-card ${isEmpty ? 'opacity-70' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Category name + houses */}
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{WELILE_TIERS.find(t => t.label === cat.category)?.emoji || '🏠'}</span>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-foreground truncate">{cat.category}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {isEmpty ? 'Coming soon' : `${cat.totalHouses.toLocaleString()} houses available`}
                          </p>
                        </div>
                      </div>

                      {/* Stats row */}
                      {!isEmpty ? (
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Total Rent</p>
                            <p className="text-xs font-bold text-foreground">{formatAmount(cat.totalRent)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Avg Rent</p>
                            <p className="text-xs font-bold text-foreground">{formatAmount(cat.avgRent)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Return</p>
                            <p className="text-xs font-bold text-success">+{formatAmount(cat.expectedReturn)}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">No houses in this tier yet — check back soon.</p>
                      )}
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
                        onFundCategory(cat.category);
                      }}
                      size="sm"
                      disabled={isEmpty}
                      className="h-10 px-3 font-bold shrink-0"
                    >
                      <HandCoins className="h-4 w-4 mr-1" />
                      {isEmpty ? 'Soon' : 'Fund'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

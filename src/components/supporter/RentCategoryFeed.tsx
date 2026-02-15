import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Building2, HandCoins } from 'lucide-react';
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
  onFundCategory: (category: RentCategory) => void;
  isLocked?: boolean;
  onLockedClick?: () => void;
  onRefreshRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

const CACHE_KEY = 'welile_rent_categories';
const CACHE_TTL = 10 * 60 * 1000;

interface CategoryTier {
  name: string;
  label: string;
  emoji: string;
  rentRange: [number, number];
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
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL && data?.length === WELILE_TIERS.length) {
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

    const tierMap = new Map<string, { tier: CategoryTier; count: number; totalRent: number; totalReward: number }>();
    WELILE_TIERS.forEach(t => tierMap.set(t.name, { tier: t, count: 0, totalRent: 0, totalReward: 0 }));

    if (!error && data) {
      data.forEach(r => {
        const amount = Number(r.rent_amount);
        const tier = getTierForRent(amount);
        const existing = tierMap.get(tier.name)!;
        existing.count += 1;
        existing.totalRent += amount;
        existing.totalReward += calculateSupporterReward(amount);
      });
    }

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
          <div key={i} className="h-24 rounded-2xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  const totalHouses = categories.reduce((s, c) => s + c.totalHouses, 0);

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-sm">Investment Categories</h3>
            <p className="text-[10px] text-muted-foreground">{totalHouses} houses across {categories.length} tiers</p>
          </div>
        </div>
      </div>

      {/* Category cards — modern pill-style */}
      <div className="space-y-2.5">
        {categories.map((cat, i) => {
          const isEmpty = cat.totalHouses === 0;
          const tier = WELILE_TIERS.find(t => t.label === cat.category);
          return (
            <motion.button
              key={cat.category}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.2 }}
              onClick={() => {
                hapticTap();
                if (isEmpty) return;
                if (isLocked) { onLockedClick?.(); return; }
                onFundCategory(cat);
              }}
              disabled={isEmpty && !isLocked}
              className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all text-left touch-manipulation active:scale-[0.98] ${
                isEmpty 
                  ? 'border-border/40 bg-muted/30 opacity-60' 
                  : 'border-border/60 bg-card hover:bg-accent/30 hover:border-primary/30 shadow-sm'
              }`}
            >
              {/* Emoji */}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${
                isEmpty ? 'bg-muted/50' : 'bg-primary/8'
              }`}>
                {tier?.emoji || '🏠'}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-foreground truncate">{cat.category}</p>
                {isEmpty ? (
                  <p className="text-[11px] text-muted-foreground mt-0.5">Coming soon</p>
                ) : (
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">
                      {cat.totalHouses} {cat.totalHouses === 1 ? 'house' : 'houses'}
                    </span>
                    <span className="text-[11px] font-semibold text-success">
                      +{formatAmount(cat.expectedReturn)} return
                    </span>
                  </div>
                )}
              </div>

              {/* Action */}
              {!isEmpty ? (
                <div className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl bg-primary text-primary-foreground">
                  <HandCoins className="h-4 w-4" />
                  <span className="text-xs font-bold">Fund</span>
                </div>
              ) : (
                <Badge variant="secondary" className="text-[10px] shrink-0">Soon</Badge>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

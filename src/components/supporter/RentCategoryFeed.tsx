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

const categoryIcons: Record<string, string> = {
  'Residential': '🏠',
  'Commercial': '🏢',
  'Single Room': '🚪',
  'Self-Contained': '🏡',
  'Double Room': '🛏️',
  'Shop': '🏪',
};

const getCategoryEmoji = (cat: string) => categoryIcons[cat] || '🏠';

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

    // Single aggregated query — group by city/area as "category"
    const { data, error } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, request_city, duration_days')
      .eq('status', 'approved')
      .limit(500);

    if (!error && data) {
      const categoryMap = new Map<string, { count: number; totalRent: number; totalReward: number }>();

      data.forEach(r => {
        const cat = r.request_city || 'Other';
        const existing = categoryMap.get(cat) || { count: 0, totalRent: 0, totalReward: 0 };
        existing.count += 1;
        existing.totalRent += Number(r.rent_amount);
        existing.totalReward += calculateSupporterReward(Number(r.rent_amount));
        categoryMap.set(cat, existing);
      });

      const cats: RentCategory[] = Array.from(categoryMap.entries())
        .map(([name, stats]) => ({
          category: name,
          totalHouses: stats.count,
          totalRent: stats.totalRent,
          avgRent: Math.round(stats.totalRent / stats.count),
          expectedReturn: stats.totalReward,
        }))
        .sort((a, b) => b.totalHouses - a.totalHouses);

      setCategories(cats);

      // Cache
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

  if (categories.length === 0) {
    return (
      <div className="text-center py-10 space-y-3">
        <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto">
          <Home className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <p className="font-bold text-foreground text-sm">No Categories Available</p>
        <p className="text-xs text-muted-foreground">Check back soon for new rent funding opportunities.</p>
      </div>
    );
  }

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
        {categories.map((cat, i) => (
          <motion.div
            key={cat.category}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.2 }}
          >
            <Card className="border border-border/60 bg-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Category name + houses */}
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{getCategoryEmoji(cat.category)}</span>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-foreground truncate">{cat.category}</p>
                        <p className="text-[10px] text-muted-foreground">{cat.totalHouses} houses available</p>
                      </div>
                    </div>

                    {/* Stats row */}
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
                    className="h-10 px-3 font-bold shrink-0"
                  >
                    <HandCoins className="h-4 w-4 mr-1" />
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

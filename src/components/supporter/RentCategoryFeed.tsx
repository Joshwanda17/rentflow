import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Building2, HandCoins, TrendingUp, MoreVertical, ChevronDown,
  ChevronUp, PlusCircle, BarChart3, Home, Activity
} from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { calculateSupporterReward } from '@/lib/rentCalculations';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
const VISIBLE_LIMIT = 3;

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

// ─── Empty State ───
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center py-14 px-6 rounded-2xl border border-blue-200/30 dark:border-blue-900/30 bg-gradient-to-br from-blue-50/40 via-white to-blue-100/20 dark:from-blue-950/20 dark:via-card dark:to-blue-900/10 shadow-sm"
    >
      <div className="p-4 rounded-2xl bg-blue-500/10 dark:bg-blue-500/15 mb-5">
        <BarChart3 className="h-8 w-8 text-blue-500" />
      </div>
      <h4 className="text-lg font-black text-foreground tracking-tight mb-1.5">
        No Investment Categories
      </h4>
      <p className="text-sm text-muted-foreground font-medium text-center max-w-[260px] mb-6">
        Start building your portfolio by adding your first investment category.
      </p>
      <Button
        onClick={() => { hapticTap(); onAdd(); }}
        className="gap-2 rounded-xl font-bold h-11 px-6 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-lg shadow-blue-500/20 text-white"
      >
        <PlusCircle className="h-4 w-4" />
        Add Category
      </Button>
    </motion.div>
  );
}

// ─── Category Card ───
function CategoryCard({
  cat,
  index,
  tier,
  isEmpty,
  isLocked,
  onFund,
  onLockedClick,
  formatAmount,
}: {
  cat: RentCategory;
  index: number;
  tier: CategoryTier | undefined;
  isEmpty: boolean;
  isLocked?: boolean;
  onFund: () => void;
  onLockedClick?: () => void;
  formatAmount: (v: number) => string;
}) {
  const utilization = cat.totalHouses > 0 ? Math.min((cat.totalHouses / 20) * 100, 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`group relative rounded-2xl border overflow-hidden transition-all duration-300 ${
        isEmpty
          ? 'border-border/30 bg-muted/20 opacity-60'
          : 'border-blue-200/40 dark:border-blue-900/30 bg-gradient-to-br from-white via-blue-50/20 to-blue-100/10 dark:from-card dark:via-blue-950/10 dark:to-blue-900/5 shadow-sm hover:shadow-md hover:shadow-blue-500/8 hover:border-blue-300/60 dark:hover:border-blue-700/50'
      }`}
    >
      {/* Card header */}
      <div className="p-4 pb-3 flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${
            isEmpty ? 'bg-muted/50' : 'bg-blue-500/10 dark:bg-blue-500/15'
          }`}>
            {tier?.emoji || '🏠'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm text-foreground leading-tight truncate">{cat.category}</p>
            {isEmpty ? (
              <Badge variant="secondary" className="text-[10px] mt-1 font-semibold px-2 py-0">Coming Soon</Badge>
            ) : (
              <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                {cat.totalHouses} {cat.totalHouses === 1 ? 'house' : 'houses'} available
              </p>
            )}
          </div>
        </div>

        {!isEmpty && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem className="text-xs font-medium">View Details</DropdownMenuItem>
              <DropdownMenuItem className="text-xs font-medium">Analytics</DropdownMenuItem>
              <DropdownMenuItem className="text-xs font-medium">Share</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Metrics */}
      {!isEmpty && (
        <div className="px-4 pb-3 space-y-3">
          {/* Progress indicator */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Utilization</span>
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">{utilization.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-blue-100/60 dark:bg-blue-900/30 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${utilization}%` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: index * 0.05 + 0.2 }}
                className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500"
              />
            </div>
          </div>

          {/* Financial metrics */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-blue-500/5 dark:bg-blue-500/8 p-2">
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Avg. Rent</p>
              <p className="text-xs font-black text-foreground">{formatAmount(cat.avgRent)}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/5 dark:bg-emerald-500/8 p-2">
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Expected Return</p>
              <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">+{formatAmount(cat.expectedReturn)}</p>
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      {!isEmpty && (
        <div className="px-4 pb-4">
          <Button
            size="sm"
            onClick={() => {
              hapticTap();
              if (isLocked) { onLockedClick?.(); return; }
              onFund();
            }}
            className="w-full gap-1.5 rounded-xl font-bold text-xs h-9 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-md shadow-blue-500/20 text-white"
          >
            <HandCoins className="h-3.5 w-3.5" />
            Fund Category
          </Button>
        </div>
      )}
    </motion.div>
  );
}

// ─── Main Component ───
export function RentCategoryFeed({ onFundCategory, isLocked, onLockedClick, onRefreshRef }: RentCategoryFeedProps) {
  const { formatAmount } = useCurrency();
  const [categories, setCategories] = useState<RentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

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
      .select('id, rent_amount, request_city, duration_days, house_category')
      .eq('status', 'approved')
      .limit(200);

    const tierMap = new Map<string, { tier: CategoryTier; count: number; totalRent: number; totalReward: number }>();
    WELILE_TIERS.forEach(t => tierMap.set(t.name, { tier: t, count: 0, totalRent: 0, totalReward: 0 }));

    if (!error && data) {
      data.forEach(r => {
        const amount = Number(r.rent_amount);
        const houseCategory = (r as any).house_category as string | null;
        const tier = houseCategory
          ? WELILE_TIERS.find(t => t.name === houseCategory) || getTierForRent(amount)
          : getTierForRent(amount);
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
      <div className="space-y-4">
        <div className="h-6 w-48 rounded-lg bg-muted/50 animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-44 rounded-2xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const activeCategories = categories.filter(c => c.totalHouses > 0);
  const totalHouses = activeCategories.reduce((s, c) => s + c.totalHouses, 0);
  const hasCategories = activeCategories.length > 0;
  const visibleCategories = showAll ? activeCategories : activeCategories.slice(0, VISIBLE_LIMIT);
  const hasMore = activeCategories.length > VISIBLE_LIMIT;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-md shadow-blue-500/20">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-black text-foreground text-base tracking-tight">Investment Categories</h3>
            <p className="text-[11px] text-muted-foreground font-medium">
              {hasCategories
                ? `${totalHouses} houses across ${activeCategories.length} active tiers`
                : 'No categories configured yet'
              }
            </p>
          </div>
        </div>
        {hasCategories && (
          <div className="flex items-center gap-1.5">
            <Badge className="text-[9px] px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-bold uppercase tracking-wider gap-1">
              <Activity className="h-2.5 w-2.5" />
              {activeCategories.length} Active
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      {!hasCategories ? (
        <EmptyState onAdd={() => setShowAddModal(true)} />
      ) : (
        <>
          {/* Card list */}
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {visibleCategories.map((cat, i) => {
                const tier = WELILE_TIERS.find(t => t.label === cat.category);
                return (
                  <CategoryCard
                    key={cat.category}
                    cat={cat}
                    index={i}
                    tier={tier}
                    isEmpty={false}
                    isLocked={isLocked}
                    onFund={() => onFundCategory(cat)}
                    onLockedClick={onLockedClick}
                    formatAmount={formatAmount}
                  />
                );
              })}
            </AnimatePresence>
          </div>

          {/* Show more / less */}
          {hasMore && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-center pt-1"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { hapticTap(); setShowAll(!showAll); }}
                className="gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
              >
                {showAll ? (
                  <>Show Less <ChevronUp className="h-3.5 w-3.5" /></>
                ) : (
                  <>View All {activeCategories.length} Categories <ChevronDown className="h-3.5 w-3.5" /></>
                )}
              </Button>
            </motion.div>
          )}
        </>
      )}

      {/* Add Category Modal (UI shell only) */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md rounded-2xl border-blue-200/40 dark:border-blue-900/30 bg-gradient-to-br from-white via-blue-50/20 to-white dark:from-card dark:via-blue-950/10 dark:to-card">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-blue-500/10">
                <PlusCircle className="h-5 w-5 text-blue-500" />
              </div>
              <DialogTitle className="text-lg font-black tracking-tight">Add Investment Category</DialogTitle>
            </div>
            <p className="text-sm text-muted-foreground font-medium pl-12">
              Configure a new tier for your investment portfolio.
            </p>
          </DialogHeader>
          <div className="py-8 flex flex-col items-center justify-center text-center">
            <div className="p-3 rounded-2xl bg-muted/30 mb-4">
              <Home className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <p className="text-sm text-muted-foreground font-medium">
              Category configuration coming soon.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

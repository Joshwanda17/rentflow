import { useState, useEffect } from 'react';
import { Search, Sparkles, ChevronRight, Home } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';

interface FindAHouseCTAProps {
  onClick: () => void;
}

export function FindAHouseCTA({ onClick }: FindAHouseCTAProps) {
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [newCount, setNewCount] = useState<number>(0);

  useEffect(() => {
    async function fetchCounts() {
      const [totalRes, newRes] = await Promise.all([
        supabase
          .from('house_listings')
          .select('id', { count: 'exact', head: true })
          .in('status', ['available', 'pending'])
          .eq('is_hidden', false),
        supabase
          .from('house_listings')
          .select('id', { count: 'exact', head: true })
          .in('status', ['available', 'pending'])
          .eq('is_hidden', false)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      ]);
      if (totalRes.count !== null) setTotalCount(totalRes.count);
      if (newRes.count !== null) setNewCount(newRes.count);
    }
    fetchCounts();

    // Subscribe to new listings for real-time count updates
    const channel = supabase
      .channel('house_listings_count')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'house_listings' }, () => {
        fetchCounts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <motion.button
      whileTap={{ scale: 1 }}
      onClick={onClick}
      className="w-full relative flex items-center gap-4 px-5 py-5 rounded-2xl bg-primary text-primary-foreground
        border-2 border-white/30 ring-1 ring-primary/20
        shadow-xl shadow-primary/30 hover:shadow-primary/50 active:shadow-primary/20
        hover:scale-[1.01] active:scale-[0.97]
        transition-all duration-200 touch-manipulation overflow-hidden"
    >
      {/* Stronger animated background shimmer */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-shimmer pointer-events-none" />

      {/* Subtle top highlight for glass-like depth */}
      <div className="absolute inset-x-0 top-1 h-[1px] bg-white/30 pointer-events-none" />

      {/* Icon container — larger, more contrast */}
      <div className="relative shrink-1">
        <div className="p-3.5 rounded-2xl bg-white/25 backdrop-blur-sm border border-white/20 shadow-inner shadow-black/5">
          <Home className="h-7 w-7" strokeWidth={2.5} />
        </div>
        {/* Pulsing dot for new listings */}
        <AnimatePresence>
          {newCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive border-2 border-primary shadow-sm"
            >
              <span className="absolute inset-1 rounded-full bg-destructive animate-ping opacity-75" />
              <span className="absolute inset-1 rounded-full bg-destructive" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 text-left min-w-0 relative">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-extrabold text-[17px] tracking-tight leading-snug">Find a House Nearby</p>
          {newCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/25 text-[10px] font-bold uppercase tracking-wide border border-white/20">
              <Sparkles className="h-2.5 w-2.5" /> {newCount} new
            </span>
          )}
        </div>
        <p className="text-sm font-medium opacity-90 leading-snug">
          {totalCount !== null ? (
            <>{totalCount} house{totalCount !== 1 ? 's' : ''} available · Pay daily</>
          ) : (
            <>Daily rent · Pay as you stay</>
          )}
        </p>
      </div>

      <div className="shrink-1 relative flex items-center justify-center w-10 h-10 rounded-full bg-white/20 border border-white/20 shadow-sm">
        <ChevronRight className="h-6 w-6" strokeWidth={2.5} />
      </div>
    </motion.button>
  );
}

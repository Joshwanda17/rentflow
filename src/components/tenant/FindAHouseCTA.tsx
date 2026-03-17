import { useState, useEffect } from 'react';
import { Search, Sparkles } from 'lucide-react';
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
          .in('status', ['available', 'pending']),
        supabase
          .from('house_listings')
          .select('id', { count: 'exact', head: true })
          .in('status', ['available', 'pending'])
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
    <button
      onClick={onClick}
      className="w-full relative flex items-center gap-4 px-5 py-5 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.01] active:scale-[0.98] transition-all touch-manipulation overflow-hidden"
    >
      {/* Subtle animated background shimmer */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer pointer-events-none" />

      <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm relative">
        <Search className="h-6 w-6" />
        {/* Pulsing dot for new listings */}
        <AnimatePresence>
          {newCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive border-2 border-primary"
            >
              <span className="absolute inset-0 rounded-full bg-destructive animate-ping opacity-75" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 text-left min-w-0 relative">
        <div className="flex items-center gap-2">
          <p className="font-bold text-base">Find a House Nearby</p>
          {newCount > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/25 text-[10px] font-bold uppercase tracking-wide">
              <Sparkles className="h-2.5 w-2.5" /> {newCount} new
            </span>
          )}
        </div>
        <p className="text-sm opacity-80">
          {totalCount !== null ? (
            <>{totalCount} house{totalCount !== 1 ? 's' : ''} available · Pay daily</>
          ) : (
            <>Daily rent · Pay as you stay</>
          )}
        </p>
      </div>

      <span className="text-2xl relative">→</span>
    </button>
  );
}

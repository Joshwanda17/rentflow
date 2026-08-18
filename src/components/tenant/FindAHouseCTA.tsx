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
          .eq('status', 'available')
          .eq('is_hidden', false)
          .eq('verified', true)
          .is('tenant_id', null),
        supabase
          .from('house_listings')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'available')
          .eq('is_hidden', false)
          .eq('verified', true)
          .is('tenant_id', null)
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
      className="w-full relative portfolio-hero-card rounded-[28px] p-3.5 text-left
        flex items-center gap-3
        active:scale-[0.99] transition-transform duration-200 touch-manipulation overflow-hidden"
    >
      {/* Decorative depth elements matching the wallet hero card */}
      <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-white/[0.06] pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-44 h-44 rounded-full bg-white/[0.04] pointer-events-none" />

      {/* Icon container — larger, more contrast */}
      <div className="relative z-10 shrink-0">
        <div className="p-1.5 rounded-lg bg-white/15 backdrop-blur-sm">
          <Home className="h-3.5 w-3.5 text-white/90" strokeWidth={2.5} />
        </div>
        {/* Pulsing dot for new listings */}
        <AnimatePresence>
          {newCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive shadow-sm"
            >
              <span className="absolute inset-1 rounded-full bg-destructive animate-ping opacity-75" />
              <span className="absolute inset-1 rounded-full bg-destructive" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 text-left min-w-0 relative z-10">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-semibold text-white/70 uppercase tracking-[0.12em] truncate">Find a House Nearby</p>
          {newCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 text-[9px] font-bold uppercase tracking-wider shrink-0">
              <Sparkles className="h-2.5 w-2.5" /> {newCount} new
            </span>
          )}
        </div>
        <p className="block text-[15px] font-black leading-tight text-white truncate">
          {totalCount !== null ? (
            <>{totalCount} house{totalCount !== 1 ? 's' : ''} available · Pay daily</>
          ) : (
            <>Daily rent · Pay as you stay</>
          )}
        </p>
      </div>

      <ChevronRight className="h-4 w-4 text-white/60 shrink-0 relative z-10" />
    </motion.button>
  );
}

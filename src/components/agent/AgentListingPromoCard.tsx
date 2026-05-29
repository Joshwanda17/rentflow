import { Home, MapPin, Users, Sparkles, ArrowRight, Coins } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';

interface Props {
  onClick: () => void;
}

const TOTAL_BONUS = 10000;

/**
 * Full-width hero card that makes the "List a House" action impossible to miss.
 * Displays the UGX 10,000 combined earning potential (house listing + LC1)
 * in a professional, high-contrast gold-on-dark design that motivates agents
 * to register landlords and LC1 chairpersons.
 */
export function AgentListingPromoCard({ onClick }: Props) {
  return (
    <motion.button
      onClick={() => { hapticTap(); onClick(); }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className="relative w-full overflow-hidden rounded-2xl text-left touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={{ WebkitTapHighlightColor: 'transparent' }}
      aria-label={`List a house and LC1 — earn up to ${formatUGX(TOTAL_BONUS)}`}
    >
      {/* Background gradient — deep amber to warm gold, optimized for dark theme */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, hsl(32 95% 45%) 0%, hsl(28 90% 40%) 40%, hsl(20 85% 35%) 100%)',
        }}
      />

      {/* Subtle shimmer overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: 'linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s ease-in-out infinite',
        }}
      />

      {/* Content */}
      <div className="relative z-10 px-5 py-5">
        {/* Top row: Badge + Arrow */}
        <div className="flex items-center justify-between mb-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/20">
            <Sparkles className="h-3 w-3 text-amber-200" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-100">
              Earning opportunity
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-white/70" />
        </div>

        {/* Main headline */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-black text-lg leading-tight tracking-tight">
              List a House &amp; LC1
            </h3>
            <p className="text-amber-100/90 text-xs mt-1 leading-relaxed">
              Register a landlord, list their property, and add the LC1 chairperson
            </p>
          </div>

          {/* Large bonus amount */}
          <div className="shrink-0 text-right">
            <div className="flex items-center justify-end gap-1">
              <Coins className="h-4 w-4 text-amber-200" />
              <span className="text-amber-200 text-[10px] font-bold uppercase tracking-wider">
                Earn up to
              </span>
            </div>
            <p className="text-white font-black text-2xl tracking-tight leading-none mt-0.5">
              {formatUGX(TOTAL_BONUS)}
            </p>
          </div>
        </div>

        {/* Bottom: 3 mini highlights */}
        <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-3 gap-2">
          <div className="flex items-center gap-1.5">
            <Home className="h-3.5 w-3.5 text-amber-200 shrink-0" />
            <span className="text-amber-100 text-[10px] font-medium truncate">List house</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-amber-200 shrink-0" />
            <span className="text-amber-100 text-[10px] font-medium truncate">Landlord</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-amber-200 shrink-0" />
            <span className="text-amber-100 text-[10px] font-medium truncate">LC1 Chair</span>
          </div>
        </div>
      </div>

      {/* Corner glow for extra visibility */}
      <div
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-20 blur-2xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,200,100,0.6) 0%, transparent 70%)' }}
      />
    </motion.button>
  );
}

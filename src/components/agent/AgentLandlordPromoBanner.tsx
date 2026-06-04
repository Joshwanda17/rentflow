import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Home, Users, Calendar, ArrowRight, Sparkles, X } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';

const BONUS_PER_LANDLORD = 5000;
const WEEKLY_PRIZE = 70000;
const CAMPAIGN_DAYS = 7;

function getCampaignEndDate(): Date {
  const now = new Date();
  const end = new Date(now);
  end.setDate(now.getDate() + CAMPAIGN_DAYS);
  end.setHours(23, 59, 59, 999);
  return end;
}

function formatCountdown(target: Date): string {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return `${days}d ${hours}h left`;
}

interface AgentLandlordPromoBannerProps {
  onRegisterLandlord?: () => void;
}

/**
 * Prominent, professional marketing banner for the agent dashboard.
 * Drives landlord registrations with empty houses by offering:
 *  - UGX 5,000 per registered landlord with an empty house
 *  - UGX 70,000 weekly prize for the agent who registers 10+ such landlords
 */
export function AgentLandlordPromoBanner({ onRegisterLandlord }: AgentLandlordPromoBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [countdown, setCountdown] = useState('');
  const campaignEnd = getCampaignEndDate();

  useEffect(() => {
    const tick = () => setCountdown(formatCountdown(campaignEnd));
    tick();
    const iv = setInterval(tick, 60000);
    return () => clearInterval(iv);
  }, [campaignEnd]);

  // Persist dismissal for this session only (refresh brings it back — marketing wants visibility)
  if (dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="relative w-full overflow-hidden rounded-2xl text-left"
    >
      {/* Deep emerald-to-teal gradient — signals money/growth, professional */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, hsl(160 84% 28%) 0%, hsl(158 72% 32%) 35%, hsl(150 65% 25%) 100%)',
        }}
      />

      {/* Subtle animated shimmer overlay */}
      <div
        className="absolute inset-0 opacity-15"
        style={{
          background: 'linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.14) 50%, transparent 60%)',
          backgroundSize: '250% 100%',
          animation: 'shimmer 3.5s ease-in-out infinite',
        }}
      />

      {/* Corner glow */}
      <div
        className="absolute -top-8 -right-8 w-28 h-28 rounded-full opacity-25 blur-2xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(180,255,220,0.5) 0%, transparent 70%)' }}
      />

      {/* Content */}
      <div className="relative z-10 p-4 space-y-3">
        {/* Top row: badge + dismiss + countdown */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/20">
              <Sparkles className="h-3 w-3 text-emerald-100" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-50">
                This Week Only
              </span>
            </div>
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/20 border border-amber-400/30">
              <Calendar className="h-3 w-3 text-amber-200" />
              <span className="text-[10px] font-bold text-amber-100 uppercase tracking-wider">
                {countdown}
              </span>
            </div>
          </div>
          <button
            onClick={() => { hapticTap(); setDismissed(true); }}
            aria-label="Dismiss"
            className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/15 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Headline */}
        <div>
          <h3 className="text-white font-black text-lg leading-tight tracking-tight">
            Register Landlords with Empty Houses
          </h3>
          <p className="text-emerald-100/90 text-sm mt-1 leading-relaxed">
            Every landlord you register who has an empty house earns you an instant{' '}
            <span className="font-bold text-white">UGX {BONUS_PER_LANDLORD.toLocaleString()}</span>{' '}
            bonus — paid straight to your withdrawable wallet.
          </p>
        </div>

        {/* Prize highlight card */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15">
          <div className="h-10 w-10 rounded-lg bg-amber-500/25 flex items-center justify-center shrink-0">
            <Trophy className="h-5 w-5 text-amber-200" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm leading-tight">
              Win UGX {WEEKLY_PRIZE.toLocaleString()} this week
            </p>
            <p className="text-emerald-100/80 text-xs leading-snug">
              The first agent to register <span className="font-bold text-white">10 landlords</span> with empty houses takes the prize from Welile Technologies.
            </p>
          </div>
        </div>

        {/* Two mini stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/10">
            <Home className="h-4 w-4 text-emerald-200 shrink-0" />
            <div>
              <p className="text-white font-bold text-sm">UGX {BONUS_PER_LANDLORD.toLocaleString()}</p>
              <p className="text-emerald-100/70 text-[10px]">Per empty house</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/10">
            <Users className="h-4 w-4 text-emerald-200 shrink-0" />
            <div>
              <p className="text-white font-bold text-sm">10 Landlords</p>
              <p className="text-emerald-100/70 text-[10px]">To win UGX {WEEKLY_PRIZE.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => { hapticTap(); onRegisterLandlord?.(); }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-emerald-800 font-bold text-sm hover:bg-white/90 active:scale-[0.98] transition-all touch-manipulation"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Home className="h-4 w-4" />
          Register a Landlord Now
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

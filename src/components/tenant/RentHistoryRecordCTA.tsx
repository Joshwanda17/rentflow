import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  History,
  Sparkles,
  TrendingUp,
  ArrowRight,
  Lock,
  Unlock,
  Crown,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';
import { formatUGX } from '@/lib/rentCalculations';
import TenantBusinessAdvanceRequestDialog from './TenantBusinessAdvanceRequestDialog';

interface Tier {
  months: number;
  limit: number;
  label: string;
  emoji: string;
}

const TIERS: Tier[] = [
  { months: 0, limit: 50_000, label: 'Starter', emoji: '🌱' },
  { months: 3, limit: 200_000, label: 'Building', emoji: '🏗️' },
  { months: 6, limit: 800_000, label: 'Established', emoji: '⭐' },
  { months: 12, limit: 10_000_000, label: 'Welile Trusted', emoji: '👑' },
];

function getTierInfo(months: number) {
  let current = TIERS[0];
  let next: Tier | null = TIERS[1];
  for (let i = 0; i < TIERS.length; i++) {
    if (months >= TIERS[i].months) {
      current = TIERS[i];
      next = TIERS[i + 1] ?? null;
    }
  }
  return { current, next };
}

/**
 * Marketing-grade CTA: shows the tenant exactly how much MORE they can
 * unlock by recording their rent history. Designed to feel like a
 * "treasure unlock" — bold limit reveal, locked next tier, progress bar,
 * shimmer animation, and social-proof microcopy.
 */
export default function RentHistoryRecordCTA() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [monthsRecorded, setMonthsRecorded] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('rent_history_records')
      .select('id')
      .eq('tenant_id', user.id);
    setMonthsRecorded(data?.length ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [user?.id]);

  const { current, next } = getTierInfo(monthsRecorded);
  const isMaxed = !next;
  const monthsToNext = next ? Math.max(0, next.months - monthsRecorded) : 0;
  const progress = next
    ? Math.min(100, ((monthsRecorded - current.months) / (next.months - current.months)) * 100)
    : 100;
  const upliftMultiplier = next ? Math.round((next.limit / Math.max(current.limit, 1)) * 10) / 10 : 0;

  return (
    <>
      <motion.button
        onClick={() => {
          hapticTap();
          setOpen(true);
        }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.985 }}
        className="relative w-full overflow-hidden rounded-3xl text-left shadow-2xl ring-2 ring-primary/30 group"
        aria-label="Record rent payment history to unlock a higher limit"
      >
        {/* Layered gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-accent" />
        <div className="absolute inset-0 bg-gradient-to-tr from-black/30 via-transparent to-transparent" />

        {/* Shimmer sweep */}
        <motion.div
          aria-hidden
          className="absolute inset-y-0 -inset-x-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-20deg] pointer-events-none"
          animate={{ x: ['-30%', '230%'] }}
          transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }}
        />

        {/* Floating coins / sparkle motifs */}
        <motion.div
          aria-hidden
          className="absolute top-3 right-4 text-2xl select-none pointer-events-none"
          animate={{ y: [0, -6, 0], rotate: [0, 8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          💰
        </motion.div>
        <motion.div
          aria-hidden
          className="absolute bottom-3 right-10 text-lg select-none pointer-events-none opacity-80"
          animate={{ y: [0, -4, 0], rotate: [0, -10, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        >
          ✨
        </motion.div>

        {/* Decorative blobs */}
        <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-52 h-52 rounded-full bg-white/10 blur-3xl" />

        <div className="relative p-5 text-white space-y-4">
          {/* Top row: live badge + tier chip */}
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-black bg-white/25 backdrop-blur px-2.5 py-1 rounded-full">
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-emerald-300"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
              Limit unlock
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-black bg-black/25 backdrop-blur px-2.5 py-1 rounded-full">
              <span>{current.emoji}</span> {current.label}
            </span>
          </div>

          {/* Big "you can access" reveal */}
          <div>
            <p className="text-[11px] uppercase tracking-widest font-bold opacity-90 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> You can access today
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <p className="text-4xl sm:text-5xl font-black tracking-tight leading-none">
                {formatUGX(current.limit)}
              </p>
            </div>
            {!loading && (
              <p className="text-[11px] opacity-90 mt-1.5">
                {monthsRecorded === 0
                  ? '🔓 Start recording your rent history to unlock more'
                  : `Based on ${monthsRecorded} verified month${monthsRecorded === 1 ? '' : 's'} of rent history`}
              </p>
            )}
          </div>

          {/* Locked next tier — the "carrot" */}
          <AnimatePresence>
            {next && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-2xl bg-white/10 backdrop-blur border border-white/20 p-3.5 space-y-2.5 overflow-hidden"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <motion.div
                      animate={{ rotate: [0, -10, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 1.5 }}
                      className="p-1.5 rounded-lg bg-amber-300/30 shrink-0"
                    >
                      <Lock className="h-3.5 w-3.5 text-amber-100" />
                    </motion.div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider font-bold opacity-80">
                        Next unlock {next.emoji} {next.label}
                      </p>
                      <p className="text-2xl font-black leading-none mt-0.5 truncate">
                        {formatUGX(next.limit)}
                      </p>
                    </div>
                  </div>
                  {upliftMultiplier > 1 && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-black bg-amber-300 text-amber-950 px-2 py-1 rounded-full">
                      <Zap className="h-3 w-3" />
                      {upliftMultiplier}× more
                    </span>
                  )}
                </div>

                {/* Progress to next */}
                <div className="space-y-1.5">
                  <div className="h-2 w-full rounded-full bg-black/25 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-amber-300 to-amber-100 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.9, ease: 'easeOut' }}
                    />
                  </div>
                  <p className="text-[11px] font-semibold flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Add{' '}
                    <span className="bg-amber-300 text-amber-950 px-1.5 rounded font-black">
                      {monthsToNext} more month{monthsToNext === 1 ? '' : 's'}
                    </span>{' '}
                    of rent history to unlock
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Maxed state */}
          {isMaxed && (
            <div className="rounded-2xl bg-amber-300/20 border border-amber-200/40 p-3 flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-200 shrink-0" />
              <p className="text-xs font-semibold leading-tight">
                Top tier unlocked! Keep recording on-time payments to grow even further.
              </p>
            </div>
          )}

          {/* Months pill row — visual progress 0/12 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] uppercase tracking-wider font-bold opacity-80">
                Rent history recorded
              </p>
              <p className="text-[11px] font-black">{monthsRecorded}/12 months</p>
            </div>
            <div className="grid grid-cols-12 gap-1">
              {Array.from({ length: 12 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.025 }}
                  className={`h-1.5 rounded-full ${
                    i < monthsRecorded ? 'bg-amber-300' : 'bg-white/20'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Big CTA button row */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold opacity-90">
              {monthsRecorded > 0 ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                  Tap to add more months
                </>
              ) : (
                <>
                  <Unlock className="h-3.5 w-3.5 text-amber-200" />
                  Takes ~2 minutes • Free
                </>
              )}
            </div>
            <span className="inline-flex items-center gap-1.5 font-black text-sm bg-white text-primary px-4 py-2 rounded-full shadow-lg group-hover:shadow-xl transition-shadow">
              {monthsRecorded === 0 ? (
                <>
                  <History className="h-3.5 w-3.5" /> Start now
                </>
              ) : isMaxed ? (
                <>
                  <Sparkles className="h-3.5 w-3.5" /> Add more
                </>
              ) : (
                <>
                  Unlock {formatUGX(next!.limit).replace('UGX ', '')} <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </span>
          </div>

          {/* Social proof microcopy */}
          <p className="text-center text-[10px] opacity-75 pt-1">
            🌍 Trusted by tenants across Africa — your records are private &amp; verified by Welile
          </p>
        </div>
      </motion.button>

      <TenantBusinessAdvanceRequestDialog open={open} onOpenChange={setOpen} onSuccess={refresh} />
    </>
  );
}

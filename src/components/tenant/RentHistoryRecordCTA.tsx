import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { History, Sparkles, TrendingUp, ArrowRight, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';
import { formatUGX } from '@/lib/rentCalculations';
import RentHistoryCaptureDialog from './RentHistoryCaptureDialog';

/**
 * Highly visible, attention-grabbing CTA shown on the tenant dashboard.
 * Encourages tenants to record their last 12 months of rent payments to
 * unlock a higher Welile credit access limit.
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

  const isComplete = monthsRecorded >= 12;
  const remaining = Math.max(0, 12 - monthsRecorded);
  const progress = Math.min(100, (monthsRecorded / 12) * 100);

  // Reward growth: rough mirror of the agent advance limit tiers
  const currentLimit =
    monthsRecorded === 0
      ? 50_000
      : monthsRecorded < 3
      ? 200_000
      : monthsRecorded < 6
      ? 800_000
      : monthsRecorded < 12
      ? 3_000_000
      : 10_000_000;

  const nextLimit =
    monthsRecorded < 3
      ? 200_000
      : monthsRecorded < 6
      ? 800_000
      : monthsRecorded < 12
      ? 3_000_000
      : null;

  return (
    <>
      <motion.button
        onClick={() => {
          hapticTap();
          setOpen(true);
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.98 }}
        className="relative w-full overflow-hidden rounded-2xl text-left shadow-lg ring-2 ring-primary/20 group"
        aria-label="Record rent payment history"
      >
        {/* Animated gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-purple-600" />

        {/* Shimmer sweep — keeps the button "alive" */}
        <motion.div
          aria-hidden
          className="absolute inset-y-0 -inset-x-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent skew-x-[-20deg]"
          animate={{ x: ['-30%', '230%'] }}
          transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }}
        />

        {/* Decorative blobs */}
        <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -bottom-12 -left-6 w-40 h-40 rounded-full bg-white/10 blur-3xl" />

        <div className="relative p-4 sm:p-5 text-white space-y-3">
          {/* Top row: badge + status */}
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold bg-white/25 backdrop-blur px-2.5 py-1 rounded-full">
              <Sparkles className="h-3 w-3" /> Boost your limit
            </span>
            {!loading && (
              <span className="text-[10px] uppercase tracking-wider font-bold opacity-90">
                {monthsRecorded}/12 months
              </span>
            )}
          </div>

          {/* Headline */}
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5 p-2 rounded-xl bg-white/20 backdrop-blur">
              <History className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-base sm:text-lg leading-tight">
                {isComplete
                  ? 'Your rent history is complete 🎉'
                  : monthsRecorded === 0
                  ? 'Record your last 12 months of rent'
                  : `Add ${remaining} more month${remaining === 1 ? '' : 's'} to unlock more`}
              </p>
              <p className="text-[12px] opacity-90 mt-0.5">
                {isComplete
                  ? 'Keep paying on time to grow even further'
                  : 'Tell us who your landlord was and how much you paid — unlock a bigger Welile limit instantly.'}
              </p>
            </div>
          </div>

          {/* Limit highlight */}
          <div className="rounded-xl bg-white/15 backdrop-blur px-3 py-2.5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold opacity-80">
                You can access today
              </p>
              <p className="text-2xl sm:text-3xl font-black leading-none mt-0.5 truncate">
                {formatUGX(currentLimit)}
              </p>
            </div>
            {nextLimit && (
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-wider font-bold opacity-80 flex items-center gap-1 justify-end">
                  <TrendingUp className="h-3 w-3" /> Next
                </p>
                <p className="text-base sm:text-lg font-black leading-none mt-0.5">
                  {formatUGX(nextLimit)}
                </p>
              </div>
            )}
          </div>

          {/* Progress */}
          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
              <motion.div
                className="h-full bg-white rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold flex items-center gap-1">
                {isComplete ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" /> Verified history active
                  </>
                ) : (
                  <>Tap to record now</>
                )}
              </span>
              <span className="inline-flex items-center gap-1 font-bold bg-white/25 px-2 py-1 rounded-full">
                {isComplete ? 'Add more' : 'Start now'} <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </div>
        </div>
      </motion.button>

      <RentHistoryCaptureDialog open={open} onOpenChange={setOpen} onSaved={refresh} />
    </>
  );
}

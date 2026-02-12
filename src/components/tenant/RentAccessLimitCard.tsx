import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Wallet, Flame, TrendingUp, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';

interface RentAccessLimitCardProps {
  userId: string;
}

const MAX_LIMIT = 5000000;

// Format to short form like "2.5M" or "500K"
const formatShort = (amount: number): string => {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}K`;
  }
  return amount.toString();
};

export function RentAccessLimitCard({ userId }: RentAccessLimitCardProps) {
  const [limit, setLimit] = useState({
    availableLimit: 0,
    usedLimit: 0,
  });
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLimitData();
  }, [userId]);

  const fetchLimitData = async () => {
    try {
      // loan_limits and repayments tables removed - stub
      setLimit({ availableLimit: 0, usedLimit: 0 });
      setStreak(0);
    } catch (error) {
      console.error('Error fetching limit data:', error);
    } finally {
      setLoading(false);
    }
  };

  const remainingLimit = limit.availableLimit - limit.usedLimit;
  const usagePercentage = limit.availableLimit > 0 
    ? ((remainingLimit) / limit.availableLimit) * 100 
    : 0;

  // Calculate ring properties
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (usagePercentage / 100) * circumference;

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-primary/90 to-primary border-0 shadow-xl">
        <CardContent className="p-4">
          <div className="animate-pulse flex items-center gap-4">
            <div className="w-24 h-24 bg-white/20 rounded-full" />
            <div className="flex-1 space-y-3">
              <div className="h-4 bg-white/20 rounded w-1/2" />
              <div className="h-8 bg-white/20 rounded w-3/4" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="bg-gradient-to-br from-primary via-primary/95 to-primary/80 border-0 shadow-2xl overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            {/* Circular Progress Ring */}
            <div className="relative flex-shrink-0">
              <svg width="96" height="96" className="transform -rotate-90">
                {/* Background ring */}
                <circle
                  cx="48"
                  cy="48"
                  r={radius}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="8"
                  fill="none"
                />
                {/* Progress ring */}
                <motion.circle
                  cx="48"
                  cy="48"
                  r={radius}
                  stroke="white"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </svg>
              {/* Center content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Wallet className="h-5 w-5 text-white/80 mb-0.5" />
                <span className="text-white font-bold text-lg leading-none">
                  {formatShort(remainingLimit)}
                </span>
              </div>
            </div>

            {/* Main Info */}
            <div className="flex-1 min-w-0">
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide mb-1">
                Available to Use
              </p>
              <p className="text-white text-2xl font-bold leading-tight mb-2">
                UGX {formatShort(remainingLimit)}
              </p>
              
              {/* Quick Stats Row */}
              <div className="flex items-center gap-3">
                {streak > 0 && (
                  <div className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-1">
                    <Flame className="h-3.5 w-3.5 text-orange-300" />
                    <span className="text-white text-xs font-semibold">{streak}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-1">
                  <TrendingUp className="h-3.5 w-3.5 text-green-300" />
                  <span className="text-white text-xs font-semibold">
                    {formatShort(limit.availableLimit)}
                  </span>
                </div>
              </div>
            </div>

            {/* Arrow indicator */}
            <ChevronRight className="h-5 w-5 text-white/40 flex-shrink-0" />
          </div>

          {/* Simple tip - only show when no streak */}
          {streak === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-3 pt-3 border-t border-white/10"
            >
              <p className="text-white/60 text-xs text-center">
                💡 Pay on time to grow your limit
              </p>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

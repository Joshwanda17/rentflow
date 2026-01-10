import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Star, Zap, Shield, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';

interface RentAccessLimitCardProps {
  userId: string;
}

const MAX_LIMIT = 5000000; // UGX 5,000,000 maximum

export function RentAccessLimitCard({ userId }: RentAccessLimitCardProps) {
  const [limit, setLimit] = useState({
    availableLimit: 0,
    usedLimit: 0,
    totalVerified: 0,
  });
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLimitData();
  }, [userId]);

  const fetchLimitData = async () => {
    try {
      // Fetch loan limit
      const { data: limitData } = await supabase
        .from('loan_limits')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (limitData) {
        setLimit({
          availableLimit: limitData.available_limit,
          usedLimit: limitData.used_limit,
          totalVerified: limitData.total_verified_amount,
        });
      }

      // Calculate payment streak from repayments
      const { data: repayments } = await supabase
        .from('repayments')
        .select('payment_date')
        .eq('tenant_id', userId)
        .order('payment_date', { ascending: false })
        .limit(30);

      if (repayments && repayments.length > 0) {
        // Count consecutive days with payments
        let consecutiveDays = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        for (let i = 0; i < repayments.length; i++) {
          const paymentDate = new Date(repayments[i].payment_date);
          paymentDate.setHours(0, 0, 0, 0);
          
          const expectedDate = new Date(today);
          expectedDate.setDate(expectedDate.getDate() - i);
          
          if (paymentDate.getTime() === expectedDate.getTime()) {
            consecutiveDays++;
          } else {
            break;
          }
        }
        setStreak(consecutiveDays);
      }
    } catch (error) {
      console.error('Error fetching limit data:', error);
    } finally {
      setLoading(false);
    }
  };

  const progressPercentage = (limit.availableLimit / MAX_LIMIT) * 100;
  const remainingLimit = limit.availableLimit - limit.usedLimit;

  const getLevelInfo = () => {
    if (limit.availableLimit >= 4000000) return { level: 'Platinum', color: 'text-purple-300', icon: Shield };
    if (limit.availableLimit >= 2000000) return { level: 'Gold', color: 'text-yellow-400', icon: Star };
    if (limit.availableLimit >= 1000000) return { level: 'Silver', color: 'text-gray-300', icon: Zap };
    return { level: 'Bronze', color: 'text-orange-400', icon: Target };
  };

  const levelInfo = getLevelInfo();
  const LevelIcon = levelInfo.icon;

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 border-0 shadow-xl">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-white/20 rounded w-1/2"></div>
            <div className="h-8 bg-white/20 rounded w-3/4"></div>
            <div className="h-2 bg-white/20 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 border-0 shadow-2xl overflow-hidden relative">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        
        <CardContent className="p-6 relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-purple-200 text-sm font-medium">Rent Access Limit</p>
                <p className="text-white/60 text-xs">Pay on time to increase</p>
              </div>
            </div>
            <Badge className={`${levelInfo.color} bg-white/10 border-0 flex items-center gap-1`}>
              <LevelIcon className="h-3 w-3" />
              {levelInfo.level}
            </Badge>
          </div>

          {/* Main Amount */}
          <div className="mb-6">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">
                {formatUGX(remainingLimit)}
              </span>
              <span className="text-purple-200 text-sm">available</span>
            </div>
            <p className="text-purple-300 text-xs mt-1">
              of {formatUGX(limit.availableLimit)} total limit
            </p>
          </div>

          {/* Progress to max limit */}
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-xs">
              <span className="text-purple-200">Progress to max limit</span>
              <span className="text-white font-medium">{progressPercentage.toFixed(0)}%</span>
            </div>
            <Progress 
              value={progressPercentage} 
              className="h-2 bg-white/20"
            />
            <p className="text-purple-300 text-xs text-right">
              Max: {formatUGX(MAX_LIMIT)}
            </p>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
            <div className="text-center">
              <p className="text-white font-semibold text-lg">{streak}</p>
              <p className="text-purple-200 text-xs">Day Streak</p>
            </div>
            <div className="text-center border-x border-white/10">
              <p className="text-white font-semibold text-lg">
                {formatUGX(limit.usedLimit).replace('UGX', '').trim()}
              </p>
              <p className="text-purple-200 text-xs">In Use</p>
            </div>
            <div className="text-center">
              <p className="text-white font-semibold text-lg">
                {formatUGX(limit.totalVerified).replace('UGX', '').trim()}
              </p>
              <p className="text-purple-200 text-xs">Verified</p>
            </div>
          </div>

          {/* Motivation message */}
          {streak > 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-4 p-3 bg-white/10 rounded-lg flex items-center gap-2"
            >
              <Star className="h-4 w-4 text-yellow-400" />
              <p className="text-white text-sm">
                {streak >= 7 
                  ? `Amazing! ${streak} days streak! Your limit is growing!` 
                  : `Keep it up! ${7 - streak} more days for bonus increase!`}
              </p>
            </motion.div>
          )}

          {streak === 0 && (
            <div className="mt-4 p-3 bg-white/10 rounded-lg">
              <p className="text-purple-200 text-sm text-center">
                💡 Make daily payments on time to increase your limit!
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

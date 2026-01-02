import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Receipt, TrendingUp, Sparkles, ArrowRight, Zap, Gift } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';

interface LoanLimitPromoCardProps {
  userId: string;
}

const MAX_LOAN_LIMIT = 30000000; // UGX 30M
const MIN_LOAN_LIMIT = 30000; // UGX 30K

export function LoanLimitPromoCard({ userId }: LoanLimitPromoCardProps) {
  const navigate = useNavigate();
  const [loanLimit, setLoanLimit] = useState<number>(MIN_LOAN_LIMIT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLoanLimit = async () => {
      if (!userId) return;
      
      const { data } = await supabase
        .from('loan_limits')
        .select('available_limit, total_verified_amount')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (data) {
        setLoanLimit(Math.max(data.available_limit || MIN_LOAN_LIMIT, MIN_LOAN_LIMIT));
      }
      setLoading(false);
    };

    fetchLoanLimit();
  }, [userId]);

  const progressPercentage = Math.min((loanLimit / MAX_LOAN_LIMIT) * 100, 100);
  const remainingToMax = MAX_LOAN_LIMIT - loanLimit;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative group"
    >
      {/* Animated background glow */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-success to-primary rounded-2xl opacity-30 group-hover:opacity-50 blur-lg transition-all duration-500 animate-pulse" />
      
      <div className="relative overflow-hidden rounded-2xl bg-card border border-border/50 backdrop-blur-xl">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-success/5" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        
        {/* Floating particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{ y: [-10, 10, -10], x: [-5, 5, -5] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-4 right-8"
          >
            <Sparkles className="h-4 w-4 text-warning/60" />
          </motion.div>
          <motion.div
            animate={{ y: [10, -10, 10], x: [5, -5, 5] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="absolute top-12 right-4"
          >
            <Zap className="h-3 w-3 text-primary/50" />
          </motion.div>
          <motion.div
            animate={{ y: [-5, 15, -5], rotate: [0, 180, 360] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-16 right-6"
          >
            <Gift className="h-3 w-3 text-success/40" />
          </motion.div>
        </div>

        <div className="relative p-5 space-y-4">
          {/* Header with animated icon */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                whileTap={{ scale: 0.95 }}
                className="relative"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary to-success rounded-xl blur-md opacity-50" />
                <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg">
                  <TrendingUp className="h-5 w-5 text-primary-foreground" />
                </div>
              </motion.div>
              <div>
                <h3 className="font-bold text-foreground text-base tracking-tight">
                  Unlock Up to <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-success">UGX 30M!</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Post shopping receipts to increase your limit
                </p>
              </div>
            </div>
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="p-1.5 rounded-full bg-warning/10 border border-warning/20">
                <Sparkles className="h-4 w-4 text-warning" />
              </div>
            </motion.div>
          </div>

          {/* Current Limit Display with enhanced styling */}
          <div className="relative p-4 rounded-xl bg-gradient-to-br from-secondary/80 to-secondary/40 border border-border/30 backdrop-blur-sm">
            <div className="absolute inset-0 bg-grid-pattern opacity-5 rounded-xl" />
            
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground font-medium">Your Current Limit</span>
                <motion.span
                  key={loanLimit}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/80"
                >
                  {loading ? '...' : formatUGX(loanLimit)}
                </motion.span>
              </div>
              
              {/* Enhanced progress bar */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-success/20 rounded-full blur-sm" />
                <div className="relative h-3 bg-muted/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercentage}%` }}
                    transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                    className="h-full bg-gradient-to-r from-primary via-primary/80 to-success rounded-full relative"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                  </motion.div>
                </div>
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">UGX 30K</span>
                <span className="text-muted-foreground font-medium">UGX 30M</span>
              </div>
            </div>
          </div>

          {/* Encouragement Message with enhanced styling */}
          {!loading && remainingToMax > 0 && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className="relative overflow-hidden"
            >
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-success/10 to-success/5 border border-success/20">
                <div className="p-1.5 rounded-lg bg-success/20">
                  <Receipt className="h-4 w-4 text-success" />
                </div>
                <p className="text-xs text-success font-medium flex-1">
                  Shop at partner stores & post receipts to unlock <span className="font-bold">{formatUGX(remainingToMax)}</span> more!
                </p>
              </div>
            </motion.div>
          )}

          {/* Enhanced CTA Button */}
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button 
              onClick={() => navigate('/my-receipts')} 
              className="w-full gap-2 h-11 text-sm font-semibold bg-gradient-to-r from-primary via-primary to-primary/90 hover:from-primary/90 hover:via-primary/80 hover:to-primary/70 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
            >
              <Receipt className="h-4 w-4" />
              Post Receipt & Increase Limit
              <ArrowRight className="h-4 w-4 ml-auto group-hover:translate-x-1 transition-transform" />
            </Button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

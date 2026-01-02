import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Receipt, TrendingUp, Sparkles, ArrowRight } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

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
    <Card className="elevated-card overflow-hidden relative border-primary/20">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-success/10" />
      
      {/* Sparkle Effects */}
      <div className="absolute top-3 right-3">
        <Sparkles className="h-5 w-5 text-primary/40 animate-pulse" />
      </div>
      
      <CardContent className="pt-5 pb-4 relative">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-glow">
                <TrendingUp className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Unlock Up to UGX 30M!</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Post shopping receipts to increase your limit
                </p>
              </div>
            </div>
          </div>

          {/* Current Limit Display */}
          <div className="p-3 rounded-xl bg-secondary/50 border border-border/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Your Current Limit</span>
              <span className="text-sm font-medium text-primary">
                {loading ? '...' : formatUGX(loanLimit)}
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">UGX 30K</span>
              <span className="text-xs text-muted-foreground">UGX 30M</span>
            </div>
          </div>

          {/* Encouragement Message */}
          {!loading && remainingToMax > 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/10 border border-success/20">
              <Receipt className="h-4 w-4 text-success shrink-0" />
              <p className="text-xs text-success font-medium">
                Shop at partner stores & post receipts to unlock {formatUGX(remainingToMax)} more!
              </p>
            </div>
          )}

          {/* CTA Button */}
          <Button 
            onClick={() => navigate('/my-receipts')} 
            className="w-full gap-2 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80"
            size="sm"
          >
            <Receipt className="h-4 w-4" />
            Post Receipt & Increase Limit
            <ArrowRight className="h-4 w-4 ml-auto" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

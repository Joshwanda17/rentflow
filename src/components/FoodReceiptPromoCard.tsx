import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ShoppingBag, 
  Percent, 
  ArrowRight, 
  Sparkles, 
  TrendingUp, 
  Zap,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';

interface FoodReceiptPromoCardProps {
  userId: string;
}

export function FoodReceiptPromoCard({ userId }: FoodReceiptPromoCardProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [rentDiscount, setRentDiscount] = useState(0);
  const [loanLimit, setLoanLimit] = useState(0);
  const [monthlySpent, setMonthlySpent] = useState(0);
  const [estimatedRent, setEstimatedRent] = useState(500000);

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    if (!userId) return;
    setLoading(false);
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const [receiptsRes, landlordRes] = await Promise.all([
      supabase
        .from('user_receipts')
        .select('claimed_amount')
        .eq('user_id', userId)
        .eq('verified', true)
        .gte('verified_at', startOfMonth)
        .lte('verified_at', endOfMonth),
      supabase
        .from('landlords')
        .select('monthly_rent')
        .eq('tenant_id', userId)
    ]);

    const totalSpent = receiptsRes.data?.reduce((sum, r) => sum + Number(r.claimed_amount), 0) || 0;
    const discount = Math.round(totalSpent * 0.01);
    const limit = 0;
    const totalRent = landlordRes.data?.reduce((sum, l) => sum + Number(l.monthly_rent || 0), 0) || 0;
    
    setMonthlySpent(totalSpent);
    setRentDiscount(discount);
    setLoanLimit(limit);
    if (totalRent > 0) setEstimatedRent(totalRent);
    setLoading(false);
  };

  const maxDiscount = Math.round(estimatedRent * 0.7);
  const discountProgress = maxDiscount > 0 ? Math.min((rentDiscount / maxDiscount) * 100, 100) : 0;
  const potentialSavings = maxDiscount - rentDiscount;

  const toggleOpen = () => {
    hapticTap();
    setIsOpen(!isOpen);
  };

  if (loading) {
    return (
      <div className="animate-pulse bg-muted rounded-lg h-12" />
    );
  }

  return (
    <div className="space-y-2">
      {/* Collapsible Trigger */}
      <Button
        variant="outline"
        onClick={toggleOpen}
        className="w-full justify-between h-12 px-4 border-dashed border-success/50 bg-success/5 hover:bg-success/10"
      >
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-success" />
          <span className="font-medium">Post your shopping receipt</span>
          {rentDiscount > 0 && (
            <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-xs px-1.5 py-0.5">
              {formatUGX(rentDiscount)} earned
            </Badge>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>

      {/* Collapsible Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <button 
              onClick={() => navigate('/my-receipts')}
              className="w-full text-left block"
            >
              <Card className="overflow-hidden border-2 border-success/30 bg-gradient-to-br from-success/5 via-background to-primary/5 relative hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer">
                {/* Decorative elements */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-success/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary/10 rounded-full translate-y-1/2 -translate-x-1/2" />
                
                <CardContent className="p-5 relative z-10">
                  {/* Header with promo badge */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-xl bg-success/20 ring-2 ring-success/30">
                        <ShoppingBag className="h-6 w-6 text-success" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg">Shop & Save</h3>
                          <Badge className="bg-success/20 text-success border-success/30 gap-1">
                            <Sparkles className="h-3 w-3" />
                            Up to 70% Off
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">Tap to post food receipts</p>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>

                  {/* Key benefits grid */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 rounded-xl bg-success/10 border border-success/20">
                      <div className="flex items-center gap-2 mb-1">
                        <Percent className="h-4 w-4 text-success" />
                        <span className="text-xs font-medium text-success">Rent Discount</span>
                      </div>
                      <p className="text-xl font-bold">{formatUGX(rentDiscount)}</p>
                      <p className="text-xs text-muted-foreground">earned this month</p>
                    </div>
                    
                    <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <span className="text-xs font-medium text-primary">Rent Access</span>
                      </div>
                      <p className="text-xl font-bold">{formatUGX(loanLimit)}</p>
                      <p className="text-xs text-muted-foreground">available</p>
                    </div>
                  </div>

                  {/* Progress towards max discount */}
                  <div className="p-3 rounded-xl bg-background/50 border border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">Progress to Max Discount</span>
                      <span className="text-xs text-success font-medium">{Math.round(discountProgress)}%</span>
                    </div>
                    <Progress value={discountProgress} className="h-2" />
                    {potentialSavings > 0 && (
                      <p className="text-xs text-success mt-2 flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        Shop {formatUGX(potentialSavings * 100)} more to unlock full discount!
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

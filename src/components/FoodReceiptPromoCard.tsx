import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  ShoppingBag, 
  Percent, 
  ArrowRight, 
  Receipt, 
  Sparkles, 
  TrendingUp, 
  Home,
  Star,
  Zap
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface FoodReceiptPromoCardProps {
  userId: string;
}

export function FoodReceiptPromoCard({ userId }: FoodReceiptPromoCardProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
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

    const [receiptsRes, loanLimitRes, landlordRes] = await Promise.all([
      supabase
        .from('user_receipts')
        .select('claimed_amount')
        .eq('user_id', userId)
        .eq('verified', true)
        .gte('verified_at', startOfMonth)
        .lte('verified_at', endOfMonth),
      supabase
        .from('loan_limits')
        .select('available_limit')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('landlords')
        .select('monthly_rent')
        .eq('tenant_id', userId)
    ]);

    const totalSpent = receiptsRes.data?.reduce((sum, r) => sum + Number(r.claimed_amount), 0) || 0;
    const discount = Math.round(totalSpent * 0.01);
    const limit = loanLimitRes.data?.available_limit || 0;
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

  if (loading) {
    return (
      <Card className="animate-pulse bg-gradient-to-br from-success/10 via-background to-primary/10">
        <CardContent className="p-6">
          <div className="h-32 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-2 border-success/30 bg-gradient-to-br from-success/5 via-background to-primary/5 relative">
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
              <p className="text-sm text-muted-foreground">Post food receipts → Reduce rent</p>
            </div>
          </div>
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
              <span className="text-xs font-medium text-primary">Loan Limit</span>
            </div>
            <p className="text-xl font-bold">{formatUGX(loanLimit)}</p>
            <p className="text-xs text-muted-foreground">available</p>
          </div>
        </div>

        {/* Progress towards max discount */}
        <div className="p-3 rounded-xl bg-background/50 border border-border/50 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium">Progress to Max Discount</span>
            <span className="text-xs text-success font-medium">{Math.round(discountProgress)}%</span>
          </div>
          <Progress value={discountProgress} className="h-2 mb-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Current: {formatUGX(rentDiscount)}</span>
            <span>Max: {formatUGX(maxDiscount)}</span>
          </div>
          {potentialSavings > 0 && (
            <p className="text-xs text-success mt-2 flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Shop {formatUGX(potentialSavings * 100)} more to unlock full discount!
            </p>
          )}
        </div>

        {/* How it works */}
        <div className="p-3 rounded-xl bg-muted/50 border border-border/50 mb-4">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <Star className="h-4 w-4 text-warning" />
            How it Works
          </h4>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>🛒 <strong className="text-foreground">Shop for food</strong> at partner vendors</p>
            <p>📱 <strong className="text-foreground">Post your receipt</strong> with Welile code</p>
            <p>✅ <strong className="text-foreground">Get verified</strong> automatically</p>
            <p>💰 <strong className="text-foreground">Save up to 70%</strong> on rent + grow loan limit</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            onClick={() => navigate('/my-receipts')} 
            className="gap-2 bg-success hover:bg-success/90"
          >
            <Receipt className="h-4 w-4" />
            Post Receipt
          </Button>
          <Button 
            variant="outline"
            onClick={() => navigate('/pay-landlord')} 
            className="gap-2 border-success/30 text-success hover:bg-success/10"
          >
            <Home className="h-4 w-4" />
            Pay Rent
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

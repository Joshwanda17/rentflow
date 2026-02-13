import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { Percent, Receipt, TrendingUp, Home, Sparkles, ArrowRight, History } from 'lucide-react';

interface RentDiscountWidgetProps {
  userId: string;
  estimatedRent?: number;
}

export function RentDiscountWidget({ userId, estimatedRent }: RentDiscountWidgetProps) {
  const navigate = useNavigate();
  const [monthlyReceipts, setMonthlyReceipts] = useState(0);
  const [rentDiscount, setRentDiscount] = useState(0);
  const [receiptCount, setReceiptCount] = useState(0);
  const [actualRent, setActualRent] = useState(estimatedRent || 500000);
  const [hasRegisteredLandlord, setHasRegisteredLandlord] = useState(false);
  const [loading, setLoading] = useState(true);
  const notificationSentRef = useRef(false);

  useEffect(() => {
    fetchData();
  }, [userId]);

  // Notification check removed - table dropped

  const fetchData = async () => {
    setLoading(true);
    
    // Get current month's verified receipts
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    // Fetch receipts and landlord data in parallel
    const [receiptsResult, landlordResult] = await Promise.all([
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

    const receipts = receiptsResult.data;
    const landlords = landlordResult.data;

    const totalVerified = receipts?.reduce((sum, r) => sum + Number(r.claimed_amount), 0) || 0;
    const discount = Math.round(totalVerified * 0.01); // 1% of verified receipts
    
    // Use actual rent from registered landlords if available
    const totalMonthlyRent = landlords?.reduce((sum, l) => sum + Number(l.monthly_rent || 0), 0) || 0;
    let rent = estimatedRent || 500000;
    if (totalMonthlyRent > 0) {
      rent = totalMonthlyRent;
      setActualRent(totalMonthlyRent);
      setHasRegisteredLandlord(true);
    }
    
    // Calculate max discount and progress
    const maxDiscount = Math.round(rent * 0.7);
    const progress = maxDiscount > 0 ? Math.min((discount / maxDiscount) * 100, 100) : 0;
    
    
    setMonthlyReceipts(totalVerified);
    setRentDiscount(discount);
    setReceiptCount(receipts?.length || 0);
    setLoading(false);
  };

  // Calculate max possible discount (70% of actual rent)
  const maxDiscount = Math.round(actualRent * 0.7);
  
  // Progress towards max discount
  const discountProgress = maxDiscount > 0 ? Math.min((rentDiscount / maxDiscount) * 100, 100) : 0;
  
  // Receipts needed to reach max discount
  // 1% of receipts = discount, so receipts needed = maxDiscount * 100
  const receiptsNeededForMax = maxDiscount * 100;
  const receiptsRemaining = Math.max(0, receiptsNeededForMax - monthlyReceipts);

  const currentMonth = new Date().toLocaleDateString('en-UG', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <Card className="elevated-card animate-pulse">
        <CardHeader className="pb-2">
          <div className="h-6 bg-muted rounded w-1/3" />
        </CardHeader>
        <CardContent>
          <div className="h-16 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="elevated-card overflow-hidden border-success/20 bg-gradient-to-br from-success/5 via-background to-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-2 rounded-lg bg-success/10">
              <Percent className="h-4 w-4 text-success" />
            </div>
            Rent Discount
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {currentMonth}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Discount */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold text-success">{formatUGX(rentDiscount)}</p>
            <p className="text-xs text-muted-foreground">earned this month</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-muted-foreground">
              Max: {formatUGX(maxDiscount)}
            </p>
            <p className="text-xs text-muted-foreground">(70% of {hasRegisteredLandlord ? 'your' : 'est.'} rent)</p>
          </div>
        </div>

        {/* Register landlord prompt */}
        {!hasRegisteredLandlord && (
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Register your landlord to unlock full discounts
            </p>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/settings')}
              className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 h-7 px-2"
            >
              Setup
            </Button>
          </div>
        )}

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={discountProgress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{Math.round(discountProgress)}% of max discount</span>
            {discountProgress < 100 && (
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Shop {formatUGX(receiptsRemaining)} more
              </span>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-background/50 border border-border/50">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Receipt className="h-3.5 w-3.5" />
              <span className="text-xs">Receipts</span>
            </div>
            <p className="text-lg font-bold">{receiptCount}</p>
            <p className="text-xs text-muted-foreground">verified this month</p>
          </div>
          <div className="p-3 rounded-xl bg-background/50 border border-border/50">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-xs">Total Spent</span>
            </div>
            <p className="text-lg font-bold">{formatUGX(monthlyReceipts)}</p>
            <p className="text-xs text-muted-foreground">at partner shops</p>
          </div>
        </div>

        {/* How it works */}
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">How it works:</strong> Earn 1% of your verified shopping receipts as rent discount. 
            Pay your landlord through Welile and save up to 70% on rent!
          </p>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate('/my-receipts')}
            className="gap-1"
          >
            <Receipt className="h-4 w-4" />
            Add
          </Button>
          <Button 
            variant="outline"
            size="sm" 
            onClick={() => navigate('/rent-discount-history')}
            className="gap-1"
          >
            <History className="h-4 w-4" />
            History
          </Button>
          <Button 
            size="sm" 
            className="gap-1 bg-success hover:bg-success/90"
            onClick={() => navigate('/pay-landlord')}
          >
            <Home className="h-4 w-4" />
            Pay
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Receipt, 
  Loader2, 
  TrendingUp, 
  CreditCard, 
  Gift,
  Percent,
  Home,
  ArrowRight,
  ShoppingBag,
  CheckCircle2,
  Clock,
  CheckCircle,
  Info,
  ChevronDown
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useConfetti } from '@/components/Confetti';
import { formatDistanceToNow } from 'date-fns';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface DashboardReceiptPromptProps {
  userId: string;
}

interface LoanLimit {
  total_verified_amount: number;
  available_limit: number;
  used_limit: number;
}

interface RecentReceipt {
  id: string;
  items_description: string;
  claimed_amount: number;
  verified: boolean;
  created_at: string;
}

const MAX_LOAN_LIMIT = 30000000;

export function DashboardReceiptPrompt({ userId }: DashboardReceiptPromptProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { fireSuccess } = useConfetti();
  const [submitting, setSubmitting] = useState(false);
  const [receiptCode, setReceiptCode] = useState('');
  const [itemsDescription, setItemsDescription] = useState('');
  const [claimedAmount, setClaimedAmount] = useState('');
  const [loanLimit, setLoanLimit] = useState<LoanLimit | null>(null);
  const [loadingLimit, setLoadingLimit] = useState(true);
  const [lastIncrease, setLastIncrease] = useState<number | null>(null);
  const [rentDiscount, setRentDiscount] = useState(0);
  const [recentReceipts, setRecentReceipts] = useState<RecentReceipt[]>([]);
  const [showBenefits, setShowBenefits] = useState(false);
  const [showPulse, setShowPulse] = useState(true);

  // Stop pulse animation after a few seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowPulse(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    if (!userId) return;
    setLoadingLimit(true);
    
    // Fetch loan limit
    const { data: limitData } = await supabase
      .from('loan_limits')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    setLoanLimit(limitData);

    // Fetch monthly verified receipts for rent discount calculation
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: receipts } = await supabase
      .from('user_receipts')
      .select('claimed_amount')
      .eq('user_id', userId)
      .eq('verified', true)
      .gte('verified_at', startOfMonth.toISOString());

    const totalVerified = receipts?.reduce((sum, r) => sum + (r.claimed_amount || 0), 0) || 0;
    const discount = Math.min(totalVerified * 0.007, 70); // 0.7% of receipts, max 70%
    setRentDiscount(Math.round(discount));

    // Fetch last 5 receipts
    const { data: recentData } = await supabase
      .from('user_receipts')
      .select('id, items_description, claimed_amount, verified, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    
    setRecentReceipts(recentData || []);
    
    setLoadingLimit(false);
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    const previousLimit = loanLimit?.available_limit || 0;
    setSubmitting(true);

    const { data: receiptNumber, error: findError } = await supabase
      .from('receipt_numbers')
      .select('id, status, vendor_amount')
      .eq('receipt_code', receiptCode.toUpperCase().trim())
      .maybeSingle();

    if (findError || !receiptNumber) {
      toast({
        title: 'Invalid Receipt',
        description: 'This receipt number does not exist in our system',
        variant: 'destructive'
      });
      setSubmitting(false);
      return;
    }

    if (receiptNumber.status === 'used') {
      toast({
        title: 'Receipt Already Used',
        description: 'This receipt has already been submitted',
        variant: 'destructive'
      });
      setSubmitting(false);
      return;
    }

    const { error: submitError } = await supabase
      .from('user_receipts')
      .insert({
        user_id: userId,
        receipt_number_id: receiptNumber.id,
        items_description: itemsDescription.trim(),
        claimed_amount: parseFloat(claimedAmount)
      });

    if (submitError) {
      toast({
        title: 'Error',
        description: submitError.message,
        variant: 'destructive'
      });
    } else {
      fireSuccess();
      
      toast({
        title: '🎉 Receipt Submitted!',
        description: 'Your loan limit will increase by 20% of the amount after verification.'
      });
      setReceiptCode('');
      setItemsDescription('');
      setClaimedAmount('');
      
      await fetchData();
      const newLimit = loanLimit?.available_limit || 0;
      if (newLimit > previousLimit) {
        setLastIncrease(newLimit - previousLimit);
        setTimeout(() => setLastIncrease(null), 5000);
      }
    }

    setSubmitting(false);
  };

  const availableLimit = Math.min(loanLimit?.available_limit || 0, MAX_LOAN_LIMIT);
  const progressPercent = (availableLimit / MAX_LOAN_LIMIT) * 100;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-secondary/5 overflow-hidden">
      <CardContent className="p-4 space-y-4">
        {/* Hero Section */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <div className="p-2 rounded-full bg-primary/10">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold">Post Your Shopping Receipt</h2>
          </div>
        </div>

        {/* Current Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-1.5 mb-1">
              <Percent className="h-3.5 w-3.5 text-success" />
              <span className="text-[10px] font-medium text-muted-foreground">Rent Discount</span>
            </div>
            <p className="text-lg font-bold text-success">{rentDiscount}%</p>
            <p className="text-[10px] text-muted-foreground">This month</p>
          </div>
          
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-1.5 mb-1">
              <CreditCard className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-medium text-muted-foreground">Loan Limit</span>
              {lastIncrease && lastIncrease > 0 && (
                <Badge variant="secondary" className="text-[8px] h-4 px-1 text-success">
                  <TrendingUp className="h-2 w-2 mr-0.5" />
                  +{formatUGX(lastIncrease)}
                </Badge>
              )}
            </div>
            {loadingLimit ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <p className="text-lg font-bold">{formatUGX(availableLimit)}</p>
                <Progress value={progressPercent} className="h-1 mt-1" />
              </>
            )}
          </div>
        </div>

        {/* Receipt Form */}
        <form onSubmit={handleSubmitReceipt} className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dashboard-receipt-code" className="text-sm font-medium">Receipt Number</Label>
              <Input
                id="dashboard-receipt-code"
                placeholder="WL-001234"
                value={receiptCode}
                onChange={(e) => setReceiptCode(e.target.value.toUpperCase())}
                required
                className="font-mono uppercase h-11 text-base"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="dashboard-amount" className="text-sm font-medium">Amount (UGX)</Label>
              <Input
                id="dashboard-amount"
                type="number"
                placeholder="50000"
                value={claimedAmount}
                onChange={(e) => setClaimedAmount(e.target.value)}
                required
                min="1000"
                className="h-11 text-base"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="dashboard-items" className="text-sm font-medium">Items Bought</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {["Groceries", "Vegetables", "Meat", "Bread", "Rice", "Milk", "Fruits", "Cooking Oil"].map((item) => (
                  <Button
                    key={item}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2.5 rounded-full"
                    onClick={() => {
                      const current = itemsDescription.trim();
                      if (current.toLowerCase().includes(item.toLowerCase())) return;
                      setItemsDescription(current ? `${current}, ${item}` : item);
                    }}
                  >
                    {item}
                  </Button>
                ))}
              </div>
              <Input
                id="dashboard-items"
                placeholder="Tap items above or type: rice, beans, sugar..."
                value={itemsDescription}
                onChange={(e) => setItemsDescription(e.target.value)}
                required
                className="h-11 text-base"
              />
            </div>
          </div>
          
          <Button type="submit" className="w-full gap-2" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Submit Receipt & Earn Benefits
              </>
            )}
          </Button>
        </form>

        {/* Recent Receipts */}
        {recentReceipts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Recent Receipts</span>
              <Button 
                variant="link" 
                size="sm" 
                className="h-auto p-0 text-xs text-primary"
                onClick={() => navigate('/my-receipts')}
              >
                View all
              </Button>
            </div>
            <div className="space-y-1.5">
              {recentReceipts.map((receipt) => (
                <div 
                  key={receipt.id} 
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/50"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {receipt.verified ? (
                      <CheckCircle className="h-3.5 w-3.5 text-success flex-shrink-0" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-warning flex-shrink-0" />
                    )}
                    <span className="text-xs truncate">{receipt.items_description}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-medium">{formatUGX(receipt.claimed_amount)}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(receipt.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Benefits Collapsible */}
        <Collapsible open={showBenefits} onOpenChange={setShowBenefits}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className={`w-full gap-1.5 text-xs text-muted-foreground ${showPulse ? 'animate-pulse' : ''}`}
              onClick={() => setShowPulse(false)}
            >
              <Info className="h-3 w-3" />
              Why Post?
              <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showBenefits ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/10 border border-success/20">
                <div className="p-1.5 rounded-full bg-success/20">
                  <Home className="h-3.5 w-3.5 text-success" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-success">Save on Rent</p>
                  <p className="text-[10px] text-muted-foreground">Up to 70% off</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                <div className="p-1.5 rounded-full bg-primary/20">
                  <CreditCard className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-primary">Grow Loan Limit</p>
                  <p className="text-[10px] text-muted-foreground">+20% per receipt</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-warning/10 border border-warning/20">
                <div className="p-1.5 rounded-full bg-warning/20">
                  <Gift className="h-3.5 w-3.5 text-warning" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-warning">Earn Rewards</p>
                  <p className="text-[10px] text-muted-foreground">Points & cashback</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/30 border border-secondary/40">
                <div className="p-1.5 rounded-full bg-secondary/50">
                  <ShoppingBag className="h-3.5 w-3.5 text-secondary-foreground" />
                </div>
                <div>
                  <p className="text-xs font-semibold">Shop Anywhere</p>
                  <p className="text-[10px] text-muted-foreground">Any store works</p>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* View All Link */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full gap-1.5 text-xs text-muted-foreground" 
          onClick={() => navigate('/my-receipts')}
        >
          View All Receipts & History
          <ArrowRight className="h-3 w-3" />
        </Button>
      </CardContent>
    </Card>
  );
}

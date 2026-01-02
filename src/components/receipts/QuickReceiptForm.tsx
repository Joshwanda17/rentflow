import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Receipt, Loader2, FileText, ArrowRight, TrendingUp, CreditCard } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface QuickReceiptFormProps {
  userId: string;
  onSuccess?: () => void;
}

interface LoanLimit {
  total_verified_amount: number;
  available_limit: number;
  used_limit: number;
}

const MAX_LOAN_LIMIT = 30000000; // UGX 30,000,000

export function QuickReceiptForm({ userId, onSuccess }: QuickReceiptFormProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [receiptCode, setReceiptCode] = useState('');
  const [itemsDescription, setItemsDescription] = useState('');
  const [claimedAmount, setClaimedAmount] = useState('');
  const [loanLimit, setLoanLimit] = useState<LoanLimit | null>(null);
  const [loadingLimit, setLoadingLimit] = useState(true);
  const [lastIncrease, setLastIncrease] = useState<number | null>(null);

  useEffect(() => {
    fetchLoanLimit();
  }, [userId]);

  const fetchLoanLimit = async () => {
    if (!userId) return;
    setLoadingLimit(true);
    
    const { data } = await supabase
      .from('loan_limits')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    setLoanLimit(data);
    setLoadingLimit(false);
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    const previousLimit = loanLimit?.available_limit || 0;
    setSubmitting(true);

    // Find the receipt number by code
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
        description: 'This receipt has already been submitted by another user',
        variant: 'destructive'
      });
      setSubmitting(false);
      return;
    }

    // Submit the receipt
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
      toast({
        title: 'Receipt Submitted',
        description: 'Your receipt has been submitted for verification'
      });
      setReceiptCode('');
      setItemsDescription('');
      setClaimedAmount('');
      
      // Refresh loan limit and calculate increase
      await fetchLoanLimit();
      const newLimit = loanLimit?.available_limit || 0;
      if (newLimit > previousLimit) {
        setLastIncrease(newLimit - previousLimit);
        // Clear the increase indicator after 5 seconds
        setTimeout(() => setLastIncrease(null), 5000);
      }
      
      onSuccess?.();
    }

    setSubmitting(false);
  };

  const availableLimit = Math.min(loanLimit?.available_limit || 0, MAX_LOAN_LIMIT);
  const progressPercent = (availableLimit / MAX_LOAN_LIMIT) * 100;
  const remainingToMax = MAX_LOAN_LIMIT - availableLimit;

  return (
    <Card className="elevated-card border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Receipt className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Quick Receipt Submission</CardTitle>
              <CardDescription className="text-xs">Submit receipts to grow your loan limit</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/my-receipts')} className="gap-1 text-xs">
            View All
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Loan Limit Progress */}
        <div className="p-3 rounded-xl bg-gradient-to-r from-primary/10 to-success/10 border border-primary/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Your Loan Limit</span>
            </div>
            {lastIncrease && lastIncrease > 0 && (
              <div className="flex items-center gap-1 text-success text-xs font-medium animate-pulse">
                <TrendingUp className="h-3 w-3" />
                +{formatUGX(lastIncrease)}
              </div>
            )}
          </div>
          
          {loadingLimit ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-xs text-muted-foreground">Loading...</span>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-lg font-bold text-primary">{formatUGX(availableLimit)}</span>
                <span className="text-xs text-muted-foreground">of {formatUGX(MAX_LOAN_LIMIT)}</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
                <span>{progressPercent.toFixed(1)}% unlocked</span>
                <span>{formatUGX(remainingToMax)} to max</span>
              </div>
              {loanLimit && loanLimit.used_limit > 0 && (
                <p className="text-xs text-warning mt-2">
                  Currently using: {formatUGX(loanLimit.used_limit)}
                </p>
              )}
            </>
          )}
        </div>

        {/* Receipt Form */}
        <form onSubmit={handleSubmitReceipt} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quick-receipt-code" className="text-xs">Receipt Number</Label>
              <Input
                id="quick-receipt-code"
                placeholder="WL-001234"
                value={receiptCode}
                onChange={(e) => setReceiptCode(e.target.value.toUpperCase())}
                required
                className="font-mono uppercase h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-amount" className="text-xs">Amount (UGX)</Label>
              <Input
                id="quick-amount"
                type="number"
                placeholder="Enter amount"
                value={claimedAmount}
                onChange={(e) => setClaimedAmount(e.target.value)}
                required
                min="1000"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="quick-items" className="text-xs">Items Purchased</Label>
              <Input
                id="quick-items"
                placeholder="Brief description..."
                value={itemsDescription}
                onChange={(e) => setItemsDescription(e.target.value)}
                required
                className="h-9 text-sm"
              />
            </div>
          </div>
          <Button type="submit" size="sm" className="w-full gap-2" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <FileText className="h-3.5 w-3.5" />
                Submit Receipt
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
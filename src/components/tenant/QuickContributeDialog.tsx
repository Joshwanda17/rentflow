import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { formatUGX } from '@/lib/rentCalculations';
import { z } from 'zod';

const contributionSchema = z.object({
  amount: z.number().min(1000, 'Minimum contribution is UGX 1,000').max(10000000, 'Maximum contribution is UGX 10,000,000'),
});

interface QuickContributeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionId: string;
  tenantId: string;
  currentBalance: number;
}

export function QuickContributeDialog({ 
  open, 
  onOpenChange, 
  subscriptionId, 
  tenantId,
  currentBalance 
}: QuickContributeDialogProps) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const quickAmounts = [5000, 10000, 20000, 50000];

  const handleSubmit = async () => {
    const amountNum = parseInt(amount.replace(/,/g, ''), 10);
    
    const validation = contributionSchema.safeParse({ amount: amountNum });
    if (!validation.success) {
      toast({
        title: 'Invalid amount',
        description: validation.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const newBalance = currentBalance + amountNum;

      // Insert contribution record
      // welile_homes_contributions table removed
      toast({ title: 'Not Available', description: 'Contributions feature is currently disabled.', variant: 'destructive' });
      setLoading(false);
      return;

      // Update subscription total
      const { error: updateError } = await supabase
        .from('welile_homes_subscriptions')
        .update({ 
          total_savings: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId);

      if (updateError) throw updateError;

      toast({
        title: '✅ Contribution Added!',
        description: `${formatUGX(amountNum)} has been added to your savings.`,
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['welile-homes-subscription-check'] });
      queryClient.invalidateQueries({ queryKey: ['welile-homes-contributions-sparkline'] });

      setAmount('');
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add contribution',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatInputAmount = (value: string) => {
    const numericValue = value.replace(/[^0-9]/g, '');
    if (!numericValue) return '';
    return parseInt(numericValue, 10).toLocaleString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-green-600" />
            Quick Contribute
          </DialogTitle>
          <DialogDescription>
            Add to your Welile Homes savings fund. Current balance: <span className="font-medium text-green-600">{formatUGX(currentBalance)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (UGX)</Label>
            <Input
              id="amount"
              type="text"
              inputMode="numeric"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(formatInputAmount(e.target.value))}
              className="text-lg font-medium"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {quickAmounts.map((quickAmount) => (
              <Button
                key={quickAmount}
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 min-w-[70px]"
                onClick={() => setAmount(quickAmount.toLocaleString())}
              >
                {formatUGX(quickAmount)}
              </Button>
            ))}
          </div>

          {amount && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200">
              <p className="text-sm text-green-700">
                New balance will be: <span className="font-bold">{formatUGX(currentBalance + parseInt(amount.replace(/,/g, '') || '0', 10))}</span>
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || !amount}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Wallet className="h-4 w-4 mr-2" />
                Add {amount ? formatUGX(parseInt(amount.replace(/,/g, '') || '0', 10)) : 'Contribution'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

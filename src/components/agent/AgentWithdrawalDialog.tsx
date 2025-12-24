import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowUpCircle } from 'lucide-react';

interface AgentWithdrawalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AgentWithdrawalDialog({ open, onOpenChange, onSuccess }: AgentWithdrawalDialogProps) {
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    details?: {
      amount: number;
      user_name: string;
      new_balance: number;
    };
  } | null>(null);
  const { toast } = useToast();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', { 
      style: 'currency', 
      currency: 'UGX',
      minimumFractionDigits: 0 
    }).format(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phone.trim() || !amount.trim()) {
      toast({ title: 'Please fill all fields', variant: 'destructive' });
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('agent-withdrawal', {
        body: { user_phone: phone.trim(), amount: amountNum },
      });

      if (error) throw error;

      setResult({ success: true, details: data.details });
      toast({ title: 'Withdrawal successful!' });
      onSuccess?.();
    } catch (error: any) {
      toast({ 
        title: 'Withdrawal failed', 
        description: error.message || 'Please try again',
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPhone('');
    setAmount('');
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-warning" />
            Process Customer Withdrawal
          </DialogTitle>
        </DialogHeader>

        {result?.success ? (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto bg-warning/20 rounded-full flex items-center justify-center mb-3">
                <ArrowUpCircle className="h-8 w-8 text-warning" />
              </div>
              <h3 className="text-lg font-semibold">Withdrawal Complete!</h3>
              <p className="text-muted-foreground">{result.details?.user_name}</p>
            </div>

            <div className="space-y-2 bg-secondary/50 rounded-lg p-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Withdrawn</span>
                <span className="font-mono font-semibold">{formatCurrency(result.details?.amount || 0)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-muted-foreground">Customer's New Balance</span>
                <span className="font-mono">{formatCurrency(result.details?.new_balance || 0)}</span>
              </div>
            </div>

            <div className="bg-warning/10 border border-warning/20 rounded-lg p-3">
              <p className="text-sm text-warning-foreground">
                💵 Please give the customer {formatCurrency(result.details?.amount || 0)} in cash.
              </p>
            </div>

            <Button onClick={handleClose} className="w-full">Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Customer Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="e.g. 0700123456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (UGX)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="e.g. 50000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
                min="1"
              />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1" disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Process Withdrawal'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

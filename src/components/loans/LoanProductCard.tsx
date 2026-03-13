import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Banknote, Percent, Calendar, User, ShoppingCart, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface LoanProduct {
  id: string;
  agent_id: string;
  title: string;
  description: string | null;
  min_amount: number;
  max_amount: number;
  interest_rate: number;
  min_duration_days: number;
  max_duration_days: number;
  agent_name?: string;
}

interface LoanProductCardProps {
  product: LoanProduct;
  onApply?: () => void;
}

export function LoanProductCard({ product, onApply }: LoanProductCardProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(product.min_amount);
  const [duration, setDuration] = useState(product.min_duration_days);
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);

  const interest = (amount * product.interest_rate) / 100;
  const totalRepayment = amount + interest;
  const dailyPayment = totalRepayment / duration;

  const handleApply = async () => {
    if (!user) {
      toast.error('Please login to apply for a loan');
      return;
    }

    if (user.id === product.agent_id) {
      toast.error('You cannot apply for your own rent plan');
      return;
    }

    setLoading(true);
    try {
      // loan_applications table removed
      toast.error('Rent plan applications feature is currently unavailable');
      setLoading(false);
      return;

      toast.success('Rent plan application submitted! Waiting for manager approval.');
      setOpen(false);
      onApply?.();
    } catch (error: any) {
      console.error('Apply error:', error);
      toast.error(error.message || 'Failed to submit application');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow border-primary/20 bg-gradient-to-br from-background to-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <ShoppingCart className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-lg">{product.title}</CardTitle>
          </div>
          <Badge variant="secondary" className="bg-success/10 text-success border-success/20 gap-1">
            <Sparkles className="h-3 w-3" />
            {product.interest_rate}%
          </Badge>
        </div>
        {product.agent_name && (
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
            <User className="h-3 w-3" />
            by {product.agent_name}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {product.description && (
          <p className="text-sm text-muted-foreground">{product.description}</p>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-muted-foreground" />
            <span>
              UGX {product.min_amount.toLocaleString()} - {product.max_amount.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>
              {product.min_duration_days} - {product.max_duration_days} days
            </span>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full gap-2 bg-primary hover:bg-primary/90" disabled={user?.id === product.agent_id}>
              <ShoppingCart className="h-4 w-4" />
              {user?.id === product.agent_id ? 'Your Product' : 'Get This Loan'}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                Apply for Food Shopping Loan
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Amount: UGX {amount.toLocaleString()}</Label>
                <Slider
                  value={[amount]}
                  onValueChange={([v]) => setAmount(v)}
                  min={product.min_amount}
                  max={product.max_amount}
                  step={1000}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Min: {product.min_amount.toLocaleString()}</span>
                  <span>Max: {product.max_amount.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Duration: {duration} days</Label>
                <Slider
                  value={[duration]}
                  onValueChange={([v]) => setDuration(v)}
                  min={product.min_duration_days}
                  max={product.max_duration_days}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <Label>Purpose (What will you shop for?)</Label>
                <Textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g., Groceries, food supplies, household items..."
                />
              </div>

              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Principal Amount</span>
                  <span>UGX {amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Interest ({product.interest_rate}%)</span>
                  <span>UGX {interest.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Total Repayment</span>
                  <span>UGX {totalRepayment.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Daily Payment</span>
                  <span>UGX {Math.ceil(dailyPayment).toLocaleString()}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm">
                <p className="text-success font-medium">💡 Pro Tip</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Shop at Welile agents and post your receipts to save up to 70% on rent!
                </p>
              </div>

              <Button onClick={handleApply} disabled={loading} className="w-full gap-2">
                <ShoppingCart className="h-4 w-4" />
                {loading ? 'Submitting...' : 'Get Food Shopping Loan'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

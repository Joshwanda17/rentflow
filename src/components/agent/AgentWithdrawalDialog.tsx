import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowUpCircle, AlertCircle, Search } from 'lucide-react';

interface AgentWithdrawalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AgentWithdrawalDialog({ open, onOpenChange, onSuccess }: AgentWithdrawalDialogProps) {
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
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

  // Lookup user balance when phone changes
  const lookupUserBalance = async () => {
    if (!phone.trim() || phone.trim().length < 9) {
      setUserBalance(null);
      setUserName(null);
      return;
    }

    setLookingUp(true);
    try {
      // Find user by phone
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name')
        .or(`phone.eq.${phone.trim()},phone.ilike.%${phone.trim()}`)
        .maybeSingle();

      if (profile) {
        setUserName(profile.full_name);
        
        // Get wallet balance
        const { data: wallet } = await supabase
          .from('wallets')
          .select('balance')
          .eq('user_id', profile.id)
          .maybeSingle();
        
        setUserBalance(wallet?.balance || 0);
      } else {
        setUserBalance(null);
        setUserName(null);
      }
    } catch (error) {
      console.error('Error looking up user:', error);
      setUserBalance(null);
      setUserName(null);
    } finally {
      setLookingUp(false);
    }
  };

  // Auto-lookup when phone changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (phone.trim().length >= 9) {
        lookupUserBalance();
      } else {
        setUserBalance(null);
        setUserName(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [phone]);

  // Handle amount change with auto-cap
  const handleAmountChange = (value: string) => {
    if (value === '') {
      setAmount('');
      return;
    }
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setAmount(value);
      return;
    }

    // Auto-cap to user balance if known
    if (userBalance !== null && numValue > userBalance) {
      setAmount(String(userBalance));
      toast({
        title: 'Amount capped to balance',
        description: `Maximum withdrawal is ${formatCurrency(userBalance)}`,
      });
    } else {
      setAmount(value);
    }
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

    // Check against known balance
    if (userBalance !== null && amountNum > userBalance) {
      toast({ 
        title: 'Insufficient balance', 
        description: `Customer only has ${formatCurrency(userBalance)} available`,
        variant: 'destructive' 
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('agent-withdrawal', {
        body: { user_phone: phone.trim(), amount: amountNum },
      });

      if (error) {
        const { extractFromErrorObject } = await import('@/lib/extractEdgeFunctionError');
        const msg = await extractFromErrorObject(error, 'Withdrawal failed');
        throw new Error(msg);
      }

      setResult({ success: true, details: data.details });
      toast({ title: 'Withdrawal submitted!', description: 'Please wait for manager approval before funds are released.' });
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
    setUserBalance(null);
    setUserName(null);
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
              <div className="relative">
                <Input
                  id="phone"
                  type="tel"
                  placeholder="e.g. 0700123456"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                />
                {lookingUp && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {userName && userBalance !== null && (
                <div className="p-3 rounded-xl bg-success/10 border border-success/20">
                  <p className="text-sm font-medium text-success">{userName}</p>
                  <p className="text-xs text-muted-foreground">Available: <span className="font-bold text-foreground">{formatCurrency(userBalance)}</span></p>
                </div>
              )}
              {phone.trim().length >= 9 && !lookingUp && !userName && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    User not found with this phone number
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (UGX)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="e.g. 50000"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                disabled={loading}
                min="1"
                max={userBalance || undefined}
              />
              {userBalance !== null && userBalance > 0 && (
                <div className="flex gap-2">
                  {[10000, 50000, 100000].map((amt) => (
                    <Button
                      key={amt}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAmount(String(Math.min(amt, userBalance)))}
                      disabled={amt > userBalance}
                      className="flex-1 text-xs"
                    >
                      {amt >= 1000 ? `${amt / 1000}K` : amt}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(String(userBalance))}
                    className="flex-1 text-xs"
                  >
                    All
                  </Button>
                </div>
              )}
              {userBalance !== null && parseFloat(amount) > userBalance && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Amount exceeds available balance
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1" disabled={loading}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="flex-1" 
                disabled={loading || !userName || userBalance === null || userBalance <= 0}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Process Withdrawal'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

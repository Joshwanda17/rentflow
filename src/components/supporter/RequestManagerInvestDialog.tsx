import { useState, forwardRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { Loader2, Send, Smartphone, CheckCircle2, Users, Sparkles } from 'lucide-react';

interface RequestManagerInvestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestedAmount?: number;
  tenantsCount?: number;
  onSuccess?: () => void;
}

const MERCHANT_CODES = {
  mtn: { name: 'MTN MoMo', code: '123456', color: 'bg-yellow-500' },
  airtel: { name: 'Airtel Money', code: '789012', color: 'bg-red-500' },
  mpesa: { name: 'M-Pesa', code: '345678', color: 'bg-green-500' },
  orange: { name: 'Orange Money', code: '456789', color: 'bg-orange-500' },
  wave: { name: 'Wave', code: '567890', color: 'bg-blue-500' },
  ecocash: { name: 'EcoCash', code: '678901', color: 'bg-emerald-500' },
};

export const RequestManagerInvestDialog = forwardRef<HTMLDivElement, RequestManagerInvestDialogProps>(({ 
  open, 
  onOpenChange, 
  suggestedAmount = 0,
  tenantsCount = 0,
  onSuccess 
}, ref) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<'amount' | 'deposit' | 'success'>('amount');
  const [amount, setAmount] = useState(suggestedAmount.toString());
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user) return;
    
    hapticTap();
    setSubmitting(true);

    try {
      // Get user profile for name/phone
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', user.id)
        .single();

      // manager_investment_requests table removed
      toast({ title: 'Not Available', description: 'Support requests feature is currently disabled.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep('amount');
    setAmount(suggestedAmount.toString());
    onOpenChange(false);
    if (step === 'success') {
      onSuccess?.();
    }
  };

  const estimatedReturn = parseFloat(amount || '0') * 0.15;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {step === 'amount' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Let Manager Support Tenants For You
              </DialogTitle>
              <DialogDescription>
                Deposit to Welile's merchant codes and we'll handle everything for you.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {tenantsCount > 0 && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-2 rounded-full bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{tenantsCount} Tenants Available</p>
                      <p className="text-xs text-muted-foreground">Ready to be funded</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                <Label htmlFor="amount">Support Amount (UGX)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="h-14 text-lg font-semibold"
                />
              </div>

              {parseFloat(amount) > 0 && (
                <div className="p-4 rounded-xl bg-success/10 border border-success/20 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Expected Monthly Reward</span>
                    <Badge className="bg-success/20 text-success border-0">15% Reward</Badge>
                  </div>
                  <p className="text-2xl font-black text-success mt-1">
                    +{formatUGX(estimatedReturn)}
                  </p>
                </div>
              )}

              <Button
                onClick={() => setStep('deposit')}
                disabled={!amount || parseFloat(amount) <= 0}
                className="w-full h-14 text-lg font-bold"
                haptic
              >
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 'deposit' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" />
                Deposit {formatUGX(parseFloat(amount))}
              </DialogTitle>
              <DialogDescription>
                Send money to any of these merchant codes, then submit your request.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {Object.entries(MERCHANT_CODES).map(([key, merchant]) => (
                <Card key={key} className="overflow-hidden">
                  <div className={`h-1 ${merchant.color}`} />
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold">{merchant.name}</p>
                        <p className="text-xs text-muted-foreground">Merchant Code</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black font-mono">{merchant.code}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">What happens next:</p>
                <ul className="space-y-1 list-disc pl-4">
                  <li>Manager receives your request</li>
                  <li>They create your support account</li>
                  <li>They fund tenants on your behalf</li>
                  <li>You receive 15% monthly platform rewards</li>
                </ul>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep('amount')}
                  className="flex-1 h-12"
                >
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 h-12 font-bold bg-gradient-to-r from-primary to-success"
                >
                  {submitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-2" />
                      Submit Request
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}

        {step === 'success' && (
          <div className="text-center py-8 space-y-4 animate-scale-in">
            <div className="w-20 h-20 mx-auto rounded-full bg-success/20 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Request Submitted!</h3>
              <p className="text-muted-foreground mt-1">
                A manager will process your support contribution of {formatUGX(parseFloat(amount))} soon.
              </p>
            </div>
            <p className="text-sm text-success font-semibold">
              Expected reward: +{formatUGX(estimatedReturn)}/month
            </p>
            <Button onClick={handleClose} className="w-full h-12 font-bold">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});

RequestManagerInvestDialog.displayName = 'RequestManagerInvestDialog';

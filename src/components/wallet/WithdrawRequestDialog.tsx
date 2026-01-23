import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowDownToLine, Wallet, Loader2, CheckCircle, AlertCircle, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface WithdrawRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletBalance: number;
  onSuccess?: () => void;
}

type MobileProvider = 'mtn' | 'airtel';

export function WithdrawRequestDialog({ 
  open, 
  onOpenChange, 
  walletBalance,
  onSuccess 
}: WithdrawRequestDialogProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState<number>(0);
  const [mobileNumber, setMobileNumber] = useState('');
  const [provider, setProvider] = useState<MobileProvider>('mtn');
  const [hasSavedNumber, setHasSavedNumber] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(false);
  const [success, setSuccess] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  // Fetch saved mobile money details when dialog opens
  useEffect(() => {
    const fetchSavedNumber = async () => {
      if (!user || !open) return;
      
      setFetchingProfile(true);
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('mobile_money_number, mobile_money_provider')
          .eq('id', user.id)
          .maybeSingle();
        
        if (profile?.mobile_money_number) {
          setMobileNumber(profile.mobile_money_number);
          setProvider((profile.mobile_money_provider as MobileProvider) || 'mtn');
          setHasSavedNumber(true);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setFetchingProfile(false);
      }
    };

    fetchSavedNumber();
  }, [user, open]);

  const validatePhoneNumber = (phone: string): boolean => {
    const ugandaPhoneRegex = /^(0[0-9]{9}|\+256[0-9]{9})$/;
    return ugandaPhoneRegex.test(phone.trim());
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please log in first');
      return;
    }

    const MIN_WITHDRAWAL = 500;
    if (amount < MIN_WITHDRAWAL) {
      toast.error(`Minimum withdrawal is UGX ${MIN_WITHDRAWAL.toLocaleString()}`);
      return;
    }

    if (amount > walletBalance) {
      toast.error('Insufficient balance');
      return;
    }

    if (!validatePhoneNumber(mobileNumber)) {
      toast.error('Please enter a valid Uganda phone number');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('withdrawal_requests')
        .insert({
          user_id: user.id,
          amount,
          status: 'pending',
          mobile_money_number: mobileNumber.trim(),
          mobile_money_provider: provider
        });

      if (error) throw error;

      // Save the mobile money number to profile if not saved
      if (!hasSavedNumber) {
        await supabase
          .from('profiles')
          .update({
            mobile_money_number: mobileNumber.trim(),
            mobile_money_provider: provider
          })
          .eq('id', user.id);
      }

      setSuccess(true);
      toast.success('Withdrawal request submitted! 🎉');
      onSuccess?.();
    } catch (error: any) {
      console.error('Error submitting withdrawal request:', error);
      toast.error(error.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAmount(0);
    setSuccess(false);
    onOpenChange(false);
  };

  const handleSliderChange = (value: number[]) => {
    setAmount(value[0]);
  };

  const isFormValid = amount >= 500 && amount <= walletBalance && validatePhoneNumber(mobileNumber);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            Withdraw Funds
          </DialogTitle>
          <DialogDescription>
            Withdraw to MTN or Airtel Mobile Money. Min: UGX 500
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Request Submitted! 🎉</h3>
              <p className="text-muted-foreground mt-1">
                Your withdrawal of {formatCurrency(amount)} to {provider.toUpperCase()} ({mobileNumber}) is pending approval.
              </p>
            </div>
            <Button onClick={handleClose} className="w-full h-12 text-base">
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-5 py-4">
              {/* Current Balance */}
              <div className="bg-muted/50 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-full bg-primary/10">
                    <Wallet className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Available Balance</p>
                    <p className="font-bold text-lg">{formatCurrency(walletBalance)}</p>
                  </div>
                </div>
              </div>

              {walletBalance <= 0 ? (
                <div className="flex items-center gap-2 p-3 bg-warning/10 rounded-lg text-warning">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <p className="text-sm">No funds available to withdraw</p>
                </div>
              ) : (
                <>
                  {/* Mobile Money Provider */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      Mobile Money Provider
                    </Label>
                    <RadioGroup
                      value={provider}
                      onValueChange={(val) => setProvider(val as MobileProvider)}
                      className="grid grid-cols-2 gap-3"
                    >
                      <Label
                        htmlFor="mtn"
                        className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all touch-manipulation ${
                          provider === 'mtn'
                            ? 'border-yellow-500 bg-yellow-500/10'
                            : 'border-border hover:border-yellow-500/50'
                        }`}
                      >
                        <RadioGroupItem value="mtn" id="mtn" className="sr-only" />
                        <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center">
                          <span className="text-black font-bold text-xs">MTN</span>
                        </div>
                        <span className="font-medium">MTN MoMo</span>
                      </Label>
                      <Label
                        htmlFor="airtel"
                        className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all touch-manipulation ${
                          provider === 'airtel'
                            ? 'border-red-500 bg-red-500/10'
                            : 'border-border hover:border-red-500/50'
                        }`}
                      >
                        <RadioGroupItem value="airtel" id="airtel" className="sr-only" />
                        <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
                          <span className="text-white font-bold text-[10px]">Airtel</span>
                        </div>
                        <span className="font-medium">Airtel Money</span>
                      </Label>
                    </RadioGroup>
                  </div>

                  {/* Mobile Number Input */}
                  <div className="space-y-2">
                    <Label htmlFor="mobileNumber">Mobile Money Number</Label>
                    <Input
                      id="mobileNumber"
                      type="tel"
                      placeholder="0771234567 or +256771234567"
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      className="h-12 text-base"
                      disabled={fetchingProfile}
                    />
                    {hasSavedNumber && (
                      <p className="text-xs text-muted-foreground">
                        ✓ Using your saved mobile money number
                      </p>
                    )}
                  </div>

                  {/* Amount Input */}
                  <div className="space-y-3">
                    <Label htmlFor="amount">Amount to Withdraw</Label>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="Min: UGX 500"
                      value={amount || ''}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      min={500}
                      max={walletBalance}
                      className="h-12 text-lg font-semibold"
                    />
                    
                    {/* Slider */}
                    <div className="pt-2">
                      <Slider
                        value={[amount]}
                        onValueChange={handleSliderChange}
                        max={walletBalance}
                        min={500}
                        step={500}
                        className="cursor-pointer"
                      />
                      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>UGX 500</span>
                        <span>{formatCurrency(walletBalance)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Amount Buttons */}
                  <div className="flex gap-2 flex-wrap">
                    {[0.25, 0.5, 0.75, 1].map((fraction) => {
                      const quickAmount = Math.max(500, Math.floor(walletBalance * fraction));
                      return (
                        <Button
                          key={fraction}
                          variant={amount === quickAmount ? "default" : "outline"}
                          size="sm"
                          onClick={() => setAmount(quickAmount)}
                          className="flex-1 h-10 touch-manipulation"
                        >
                          {fraction === 1 ? 'All' : `${fraction * 100}%`}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Summary */}
                  {amount >= 500 && validatePhoneNumber(mobileNumber) && (
                    <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 space-y-2">
                      <p className="text-sm text-muted-foreground">You will receive</p>
                      <p className="text-2xl font-bold text-primary">{formatCurrency(amount)}</p>
                      <div className="flex items-center gap-2 text-sm">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          provider === 'mtn' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}>
                          <span className={`font-bold text-[8px] ${provider === 'mtn' ? 'text-black' : 'text-white'}`}>
                            {provider === 'mtn' ? 'MTN' : 'A'}
                          </span>
                        </div>
                        <span className="text-muted-foreground">{mobileNumber}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pt-1">
                        Remaining balance: {formatCurrency(walletBalance - amount)}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1 h-12 text-base">
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={loading || !isFormValid}
                className="flex-1 gap-2 h-12 text-base"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <ArrowDownToLine className="h-4 w-4" />
                    Withdraw
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

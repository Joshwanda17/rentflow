import { useState } from 'react';
import StepperModal, { Step } from './StepperModal';
import PaymentMethodCard from './PaymentMethodCard';
import ConfirmSummaryCard from './ConfirmSummaryCard';
import ProcessingScreen from './ProcessingScreen';
import ReceiptCard from './ReceiptCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { LOCAL_PAYMENT_METHODS, INTERNATIONAL_PAYMENT_METHODS, formatCurrency, calculateFee, SUPPORTED_CURRENCIES } from '@/lib/paymentMethods';
import { PaymentMethod } from './PaymentMethodCard';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Wallet, TrendingUp, Lock, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface WithdrawFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableBalance?: number;
  roiBalance?: number;
  onSuccess?: () => void;
}

const STEPS: Step[] = [
  { id: 'source', title: 'Select Source' },
  { id: 'amount', title: 'Amount' },
  { id: 'momo', title: 'Mobile Money' },
  { id: 'destination', title: 'Destination' },
  { id: 'security', title: 'Verify' },
  { id: 'process', title: 'Processing' },
];

export default function WithdrawFlow({
  open,
  onOpenChange,
  availableBalance = 0,
  roiBalance = 0,
  onSuccess,
}: WithdrawFlowProps) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [source, setSource] = useState<'available' | 'roi'>('available');
  const [amount, setAmount] = useState(100000);
  const [currency, setCurrency] = useState('UGX');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [pin, setPin] = useState('');
  const [momoNumber, setMomoNumber] = useState('');
  const [momoName, setMomoName] = useState('');
  const [momoProvider, setMomoProvider] = useState<'MTN' | 'Airtel'>('MTN');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed'>('success');
  const [withdrawalRef, setWithdrawalRef] = useState('');

  const maxAmount = source === 'available' ? availableBalance : roiBalance;
  const fee = selectedMethod ? calculateFee(amount, selectedMethod) : 0;
  const netAmount = amount - fee;

  const handleReset = () => {
    setCurrentStep(0);
    setSource('available');
    setAmount(100000);
    setCurrency('UGX');
    setSelectedMethod(null);
    setPin('');
    setMomoNumber('');
    setMomoName('');
    setMomoProvider('MTN');
    setIsProcessing(false);
    setIsComplete(false);
    setWithdrawalRef('');
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(handleReset, 300);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return true;
      case 1: return amount > 0 && amount <= maxAmount;
      case 2: return momoNumber.trim().length >= 9 && momoName.trim().length >= 2;
      case 3: return selectedMethod !== null;
      case 4: return pin.length === 4;
      default: return false;
    }
  };

  const processWithdrawal = async () => {
    if (!user) return;

    try {
      // Fetch fresh wallet balance
      const { data: freshWallet, error: fetchError } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .single();

      if (fetchError || !freshWallet) {
        throw new Error('Failed to fetch wallet balance');
      }

      if (freshWallet.balance < amount) {
        throw new Error('Insufficient balance. Your balance may have changed.');
      }

      // Deduct from wallet using optimistic locking
      const { data: updatedWallet, error: updateError } = await supabase
        .from('wallets')
        .update({ 
          balance: freshWallet.balance - amount, 
          updated_at: new Date().toISOString() 
        })
        .eq('user_id', user.id)
        .eq('balance', freshWallet.balance) // Optimistic lock
        .select()
        .maybeSingle();

      if (updateError || !updatedWallet) {
        throw new Error('Balance changed during withdrawal. Please try again.');
      }

      // Record the withdrawal in wallet_withdrawals
      const ref = `WTH-${Date.now()}`;
      const { error: recordError } = await supabase
        .from('wallet_withdrawals')
        .insert({
          user_id: user.id,
          agent_id: user.id,
          amount: amount,
        });

      if (recordError) {
        console.error('Failed to record withdrawal:', recordError);
      }

      // Also record in withdrawal_requests for manager approval tracking
      const { error: requestError } = await supabase
        .from('withdrawal_requests')
        .insert({
          user_id: user.id,
          amount: amount,
          mobile_money_number: momoNumber.trim(),
          mobile_money_name: momoName.trim(),
          mobile_money_provider: momoProvider.toLowerCase(),
          status: 'pending',
        });

      if (requestError) {
        console.error('Failed to record withdrawal request:', requestError);
      }

      setWithdrawalRef(ref);
      setPaymentStatus('success');
      toast.success('Withdrawal request submitted! Please wait for manager approval before funds are released.');
      onSuccess?.();
    } catch (error: any) {
      console.error('Withdrawal failed:', error);
      setPaymentStatus('failed');
      toast.error(error.message || 'Withdrawal failed');
    }
  };

  const handleNext = () => {
    if (currentStep === 4) {
      setCurrentStep(5);
      setIsProcessing(true);
    }
  };

  const handleProcessingComplete = async () => {
    await processWithdrawal();
    setIsProcessing(false);
    setIsComplete(true);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <Label>Withdraw From</Label>
            <div className="space-y-3">
              <Card 
                className={`p-4 cursor-pointer transition-all ${source === 'available' ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'}`}
                onClick={() => setSource('available')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">Available Balance</h4>
                    <p className="text-sm text-muted-foreground">Ready to withdraw</p>
                  </div>
                  <span className="font-bold text-lg">{formatCurrency(availableBalance, 'UGX')}</span>
                </div>
              </Card>
              
              <Card 
                className={`p-4 cursor-pointer transition-all ${source === 'roi' ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'}`}
                onClick={() => setSource('roi')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">ROI Earnings</h4>
                    <p className="text-sm text-muted-foreground">Investment returns</p>
                  </div>
                  <span className="font-bold text-lg text-emerald-600">{formatCurrency(roiBalance, 'UGX')}</span>
                </div>
              </Card>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            {/* Currency selector */}
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((curr) => (
                    <SelectItem key={curr} value={curr}>{curr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount input */}
            <div className="space-y-2">
              <Label htmlFor="amount">Withdrawal Amount</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(Math.min(Number(e.target.value), maxAmount))}
                max={maxAmount}
                min={1000}
                className="text-2xl h-14 font-bold text-center"
              />
              <p className="text-xs text-muted-foreground text-center">
                Max: {formatCurrency(maxAmount, currency)}
              </p>
            </div>

            {/* Quick amounts */}
            <div className="grid grid-cols-4 gap-2">
              {[0.25, 0.5, 0.75, 1].map((pct) => (
                <Button
                  key={pct}
                  variant={amount === Math.round(maxAmount * pct) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAmount(Math.round(maxAmount * pct))}
                >
                  {pct * 100}%
                </Button>
              ))}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <Tabs defaultValue="local" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="local">Local</TabsTrigger>
                <TabsTrigger value="international">International</TabsTrigger>
              </TabsList>
              
              <TabsContent value="local" className="space-y-3 mt-4">
                {LOCAL_PAYMENT_METHODS.filter(m => m.type !== 'wallet').map((method) => (
                  <PaymentMethodCard
                    key={method.id}
                    method={method}
                    selected={selectedMethod?.id === method.id}
                    onSelect={() => setSelectedMethod(method)}
                  />
                ))}
              </TabsContent>
              
              <TabsContent value="international" className="space-y-3 mt-4">
                {INTERNATIONAL_PAYMENT_METHODS.filter(m => m.type === 'bank').map((method) => (
                  <PaymentMethodCard
                    key={method.id}
                    method={method}
                    selected={selectedMethod?.id === method.id}
                    onSelect={() => setSelectedMethod(method)}
                  />
                ))}
              </TabsContent>
            </Tabs>

            {selectedMethod && (
              <Card className="bg-muted/30">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Withdrawal Amount</span>
                    <span>{formatCurrency(amount, currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fee ({selectedMethod.fee})</span>
                    <span className="text-red-500">-{formatCurrency(fee, currency)}</span>
                  </div>
                  <div className="flex justify-between font-semibold pt-2 border-t">
                    <span>You'll Receive</span>
                    <span className="text-primary">{formatCurrency(netAmount, currency)}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            
            <div>
              <h3 className="font-semibold text-lg">Enter Your PIN</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Enter your 4-digit security PIN to confirm
              </p>
            </div>

            <div className="flex justify-center">
              <InputOTP value={pin} onChange={setPin} maxLength={4}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <ConfirmSummaryCard
              title="Withdrawal Summary"
              items={[
                { label: 'From', value: source === 'available' ? 'Available Balance' : 'ROI Earnings' },
                { label: 'Amount', value: formatCurrency(amount, currency) },
                { label: 'Fee', value: formatCurrency(fee, currency), secondary: true },
                { label: 'To', value: selectedMethod?.name || '' },
              ]}
              total={{ label: "You'll Receive", value: formatCurrency(netAmount, currency) }}
              showSecurityNote={false}
            />
          </div>
        );

      case 4:
        if (isProcessing) {
          return <ProcessingScreen onComplete={handleProcessingComplete} />;
        }
        return (
          <ReceiptCard
            status={paymentStatus}
            amount={netAmount}
            currency={currency}
            fees={fee}
            recipient={selectedMethod?.name || 'Bank Account'}
            reference={withdrawalRef || `WTH-${Date.now()}`}
            method={selectedMethod?.name || ''}
            date={new Date()}
            onDownload={() => {}}
            onShare={() => {}}
            onTryAgain={() => setCurrentStep(2)}
            onChangeMethod={() => setCurrentStep(2)}
            onContactSupport={() => {}}
            onClose={handleClose}
          />
        );

      default:
        return null;
    }
  };

  return (
    <StepperModal
      open={open}
      onOpenChange={handleClose}
      title="Withdraw Funds"
      steps={STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      canGoNext={canProceed()}
      onNext={handleNext}
      showNavigation={currentStep < 4 && !isProcessing && !isComplete}
      nextLabel={currentStep === 3 ? 'Confirm Withdrawal' : 'Continue'}
      isProcessing={isProcessing}
      isComplete={isComplete}
    >
      {renderStep()}
    </StepperModal>
  );
}
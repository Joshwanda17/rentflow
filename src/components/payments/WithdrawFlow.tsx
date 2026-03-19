import { useState } from 'react';
import StepperModal, { Step } from './StepperModal';
import ConfirmSummaryCard from './ConfirmSummaryCard';
import ProcessingScreen from './ProcessingScreen';
import ReceiptCard from './ReceiptCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { formatCurrency, SUPPORTED_CURRENCIES } from '@/lib/paymentMethods';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Wallet, TrendingUp, Lock, Phone, Building2, Banknote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { UGANDA_BANKS, PAYOUT_METHODS } from '@/lib/ugandaBanks';

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
  { id: 'payout', title: 'Payout Mode' },
  { id: 'details', title: 'Details' },
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
  const [pin, setPin] = useState('');

  // Payout mode state
  const [payoutMode, setPayoutMode] = useState<'mobile_money' | 'bank_transfer' | 'cash'>('mobile_money');
  
  // Mobile Money details
  const [momoNumber, setMomoNumber] = useState('');
  const [momoName, setMomoName] = useState('');
  const [momoProvider, setMomoProvider] = useState<'MTN' | 'Airtel'>('MTN');

  // Bank details
  const [bankName, setBankName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed'>('success');
  const [withdrawalRef, setWithdrawalRef] = useState('');

  const maxAmount = source === 'available' ? availableBalance : roiBalance;

  const handleReset = () => {
    setCurrentStep(0);
    setSource('available');
    setAmount(100000);
    setCurrency('UGX');
    setPin('');
    setPayoutMode('mobile_money');
    setMomoNumber('');
    setMomoName('');
    setMomoProvider('MTN');
    setBankName('');
    setBankAccountName('');
    setBankAccountNumber('');
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
      case 2: return !!payoutMode;
      case 3: {
        if (payoutMode === 'mobile_money') return momoNumber.trim().length >= 9 && momoName.trim().length >= 2;
        if (payoutMode === 'bank_transfer') return !!bankName && bankAccountName.trim().length >= 2 && bankAccountNumber.trim().length >= 5;
        if (payoutMode === 'cash') return true;
        return false;
      }
      case 4: return pin.length === 4;
      default: return false;
    }
  };

  const getPayoutSummary = () => {
    if (payoutMode === 'mobile_money') return `${momoProvider} - ${momoNumber}`;
    if (payoutMode === 'bank_transfer') return `${bankName.split(' ').slice(0, 2).join(' ')} - ${bankAccountNumber}`;
    return 'Cash Pickup at Office';
  };

  const getPayoutName = () => {
    if (payoutMode === 'mobile_money') return momoName;
    if (payoutMode === 'bank_transfer') return bankAccountName;
    return 'Cash Collection';
  };

  const processWithdrawal = async () => {
    if (!user) return;

    try {
      const ref = `WTH-${Date.now()}`;

      const insertData: any = {
        user_id: user.id,
        amount: amount,
        status: 'pending',
        mobile_money_number: payoutMode === 'mobile_money' ? momoNumber.trim() : null,
        mobile_money_name: payoutMode === 'mobile_money' ? momoName.trim() : (payoutMode === 'bank_transfer' ? bankAccountName.trim() : 'Cash Pickup'),
        mobile_money_provider: payoutMode === 'mobile_money' ? momoProvider.toLowerCase() : (payoutMode === 'bank_transfer' ? 'bank' : 'cash'),
      };

      const { error: requestError } = await supabase
        .from('withdrawal_requests')
        .insert(insertData);

      if (requestError) {
        throw new Error(requestError.message || 'Failed to submit withdrawal request');
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
                    <p className="text-sm text-muted-foreground">Platform rewards</p>
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
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((curr) => (
                    <SelectItem key={curr} value={curr}>{curr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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

      // ═══ NEW: PAYOUT MODE SELECTION ═══
      case 2:
        return (
          <div className="space-y-4">
            <div className="text-center mb-2">
              <h3 className="font-semibold text-lg">How do you want to receive?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Choose your preferred payout method
              </p>
            </div>

            <div className="space-y-3">
              {PAYOUT_METHODS.map((method) => (
                <Card
                  key={method.value}
                  className={`p-4 cursor-pointer transition-all ${
                    payoutMode === method.value
                      ? 'ring-2 ring-primary border-primary bg-primary/5'
                      : 'hover:border-primary/50'
                  }`}
                  onClick={() => setPayoutMode(method.value as any)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
                      method.value === 'mobile_money' ? 'bg-yellow-500/10' :
                      method.value === 'bank_transfer' ? 'bg-blue-500/10' :
                      'bg-emerald-500/10'
                    }`}>
                      {method.icon}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">{method.label}</h4>
                      <p className="text-xs text-muted-foreground">
                        {method.value === 'mobile_money' && 'MTN or Airtel Mobile Money'}
                        {method.value === 'bank_transfer' && 'Direct bank deposit'}
                        {method.value === 'cash' && 'Collect cash at the office'}
                      </p>
                    </div>
                    {payoutMode === method.value && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );

      // ═══ PAYOUT DETAILS ═══
      case 3:
        return (
          <div className="space-y-5">
            {payoutMode === 'mobile_money' && (
              <>
                <div className="text-center mb-2">
                  <h3 className="font-semibold text-lg">📱 Mobile Money Details</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enter the mobile money number to receive funds
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Mobile Money Provider</Label>
                  <RadioGroup
                    value={momoProvider}
                    onValueChange={(v) => setMomoProvider(v as 'MTN' | 'Airtel')}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="MTN" id="withdraw-mtn" />
                      <Label htmlFor="withdraw-mtn" className="font-medium text-yellow-600 cursor-pointer">MTN</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="Airtel" id="withdraw-airtel" />
                      <Label htmlFor="withdraw-airtel" className="font-medium text-red-600 cursor-pointer">Airtel</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="momo-number">Mobile Money Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="momo-number"
                      type="tel"
                      placeholder="e.g. 0770123456"
                      value={momoNumber}
                      onChange={(e) => setMomoNumber(e.target.value)}
                      className="h-12 text-base pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="momo-name">Registered Name (as shown on Mobile Money)</Label>
                  <Input
                    id="momo-name"
                    type="text"
                    placeholder="e.g. JOHN DOE"
                    value={momoName}
                    onChange={(e) => setMomoName(e.target.value)}
                    className="h-12 text-base"
                  />
                </div>
              </>
            )}

            {payoutMode === 'bank_transfer' && (
              <>
                <div className="text-center mb-2">
                  <h3 className="font-semibold text-lg">🏦 Bank Account Details</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enter the bank account to receive your funds
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Select value={bankName} onValueChange={setBankName}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Select your bank..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {UGANDA_BANKS.map(b => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Account Holder Name</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="e.g. JOHN DOE"
                      value={bankAccountName}
                      onChange={(e) => setBankAccountName(e.target.value)}
                      className="h-12 text-base pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Account Number</Label>
                  <div className="relative">
                    <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="e.g. 9030012345678"
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value)}
                      className="h-12 text-base pl-10"
                    />
                  </div>
                </div>
              </>
            )}

            {payoutMode === 'cash' && (
              <div className="space-y-4">
                <div className="text-center mb-2">
                  <h3 className="font-semibold text-lg">💵 Cash Pickup</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    You will collect your funds at the office
                  </p>
                </div>

                <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
                  <div className="space-y-2 text-sm">
                    <p className="font-bold text-foreground">How it works:</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
                      <li>Your request will be reviewed by a manager</li>
                      <li>Once approved, you'll be notified</li>
                      <li>Visit the office with your ID to collect</li>
                    </ol>
                  </div>
                </Card>
              </div>
            )}
          </div>
        );

      case 4:
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
                { label: 'Payout Mode', value: payoutMode === 'mobile_money' ? '📱 Mobile Money' : payoutMode === 'bank_transfer' ? '🏦 Bank Transfer' : '💵 Cash Pickup' },
                { label: 'To', value: getPayoutSummary() },
                { label: 'Name', value: getPayoutName() },
              ]}
              total={{ label: "You'll Receive", value: formatCurrency(amount, currency) }}
              showSecurityNote={false}
            />
          </div>
        );

      case 5:
        if (isProcessing) {
          return <ProcessingScreen onComplete={handleProcessingComplete} />;
        }
        return (
          <ReceiptCard
            status={paymentStatus}
            amount={amount}
            currency={currency}
            fees={0}
            recipient={getPayoutSummary()}
            reference={withdrawalRef || `WTH-${Date.now()}`}
            method={payoutMode === 'mobile_money' ? 'Mobile Money' : payoutMode === 'bank_transfer' ? 'Bank Transfer' : 'Cash Pickup'}
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
      showNavigation={currentStep < 5 && !isProcessing && !isComplete}
      nextLabel={currentStep === 4 ? 'Confirm Withdrawal' : 'Continue'}
      isProcessing={isProcessing}
      isComplete={isComplete}
    >
      {renderStep()}
    </StepperModal>
  );
}

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LOCAL_PAYMENT_METHODS, INTERNATIONAL_PAYMENT_METHODS, formatCurrency, calculateFee, SUPPORTED_CURRENCIES } from '@/lib/paymentMethods';
import { PaymentMethod } from './PaymentMethodCard';

interface DepositFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletBalance?: number;
}

const STEPS: Step[] = [
  { id: 'amount', title: 'Amount & Currency' },
  { id: 'method', title: 'Payment Method' },
  { id: 'confirm', title: 'Confirm' },
  { id: 'process', title: 'Processing' },
];

const QUICK_AMOUNTS = [50000, 100000, 250000, 500000, 1000000];

export default function DepositFlow({
  open,
  onOpenChange,
  walletBalance = 0,
}: DepositFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [amount, setAmount] = useState(100000);
  const [currency, setCurrency] = useState('UGX');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed'>('success');

  const fee = selectedMethod ? calculateFee(amount, selectedMethod) : 0;
  const total = amount + fee;

  const handleReset = () => {
    setCurrentStep(0);
    setAmount(100000);
    setCurrency('UGX');
    setSelectedMethod(null);
    setConfirmed(false);
    setIsProcessing(false);
    setIsComplete(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(handleReset, 300);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return amount > 0;
      case 1: return selectedMethod !== null;
      case 2: return confirmed;
      default: return false;
    }
  };

  const handleNext = () => {
    if (currentStep === 2) {
      setCurrentStep(3);
      setIsProcessing(true);
    }
  };

  const handleProcessingComplete = () => {
    setIsProcessing(false);
    setIsComplete(true);
    setPaymentStatus(Math.random() > 0.2 ? 'success' : 'failed');
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
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
              <Label htmlFor="amount">Amount to Deposit</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                min={1000}
                className="text-2xl h-14 font-bold text-center"
              />
            </div>

            {/* Quick amounts */}
            {currency === 'UGX' && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Quick Select</Label>
                <div className="grid grid-cols-3 gap-2">
                  {QUICK_AMOUNTS.map((amt) => (
                    <Button
                      key={amt}
                      variant={amount === amt ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAmount(amt)}
                    >
                      {formatCurrency(amt, currency)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Current balance */}
            <div className="p-4 bg-muted/30 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Current Balance</p>
              <p className="text-xl font-semibold">{formatCurrency(walletBalance, 'UGX')}</p>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <Tabs defaultValue={currency === 'UGX' ? 'local' : 'international'} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="local">Local</TabsTrigger>
                <TabsTrigger value="international">International</TabsTrigger>
              </TabsList>
              
              <TabsContent value="local" className="space-y-3 mt-4">
                {LOCAL_PAYMENT_METHODS.map((method) => (
                  <PaymentMethodCard
                    key={method.id}
                    method={method}
                    selected={selectedMethod?.id === method.id}
                    onSelect={() => setSelectedMethod(method)}
                  />
                ))}
              </TabsContent>
              
              <TabsContent value="international" className="space-y-3 mt-4">
                {INTERNATIONAL_PAYMENT_METHODS.map((method) => (
                  <PaymentMethodCard
                    key={method.id}
                    method={method}
                    selected={selectedMethod?.id === method.id}
                    onSelect={() => setSelectedMethod(method)}
                  />
                ))}
              </TabsContent>
            </Tabs>
          </div>
        );

      case 2:
        return (
          <ConfirmSummaryCard
            items={[
              { label: 'Deposit Amount', value: formatCurrency(amount, currency), highlight: true },
              { label: 'To', value: 'Welile Wallet' },
              { label: 'Method', value: selectedMethod?.name || '' },
            ]}
            fees={[
              { label: 'Transaction Fee', value: formatCurrency(fee, currency) },
            ]}
            total={{ label: 'Total to Pay', value: formatCurrency(total, currency) }}
            confirmed={confirmed}
            onConfirmChange={setConfirmed}
          />
        );

      case 3:
        if (isProcessing) {
          return <ProcessingScreen onComplete={handleProcessingComplete} />;
        }
        return (
          <ReceiptCard
            status={paymentStatus}
            amount={amount}
            currency={currency}
            fees={fee}
            recipient="Welile Wallet"
            reference={`DEP-${Date.now()}`}
            method={selectedMethod?.name || ''}
            date={new Date()}
            onDownload={() => {}}
            onShare={() => {}}
            onTryAgain={() => setCurrentStep(1)}
            onChangeMethod={() => setCurrentStep(1)}
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
      title="Deposit Money"
      steps={STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      canGoNext={canProceed()}
      onNext={handleNext}
      showNavigation={currentStep < 3 && !isProcessing && !isComplete}
      nextLabel={currentStep === 2 ? 'Confirm Deposit' : 'Continue'}
      isProcessing={isProcessing}
      isComplete={isComplete}
    >
      {renderStep()}
    </StepperModal>
  );
}

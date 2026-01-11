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
import { Badge } from '@/components/ui/badge';
import { LOCAL_PAYMENT_METHODS, INTERNATIONAL_PAYMENT_METHODS, formatCurrency, calculateFee } from '@/lib/paymentMethods';
import { PaymentMethod } from './PaymentMethodCard';
import { Home, Calendar, User } from 'lucide-react';

interface PayRentFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rentDue?: number;
  dueDate?: Date;
  landlord?: string;
  property?: string;
  currency?: string;
}

const STEPS: Step[] = [
  { id: 'type', title: 'Payment Type' },
  { id: 'amount', title: 'Enter Amount' },
  { id: 'method', title: 'Payment Method' },
  { id: 'confirm', title: 'Confirm' },
  { id: 'process', title: 'Processing' },
];

export default function PayRentFlow({
  open,
  onOpenChange,
  rentDue = 500000,
  dueDate = new Date(),
  landlord = 'John Mukasa',
  property = 'Bukoto Apartments, Unit 3B',
  currency = 'UGX',
}: PayRentFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [paymentType, setPaymentType] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState(rentDue);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed'>('success');

  const fee = selectedMethod ? calculateFee(amount, selectedMethod) : 0;
  const total = amount + fee;

  const handleReset = () => {
    setCurrentStep(0);
    setPaymentType('full');
    setAmount(rentDue);
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
      case 0: return true;
      case 1: return amount > 0 && amount <= rentDue;
      case 2: return selectedMethod !== null;
      case 3: return confirmed;
      default: return false;
    }
  };

  const handleNext = () => {
    if (currentStep === 0 && paymentType === 'full') {
      setAmount(rentDue);
      setCurrentStep(2); // Skip amount step
    } else if (currentStep === 3) {
      setCurrentStep(4);
      setIsProcessing(true);
    }
  };

  const handleProcessingComplete = () => {
    setIsProcessing(false);
    setIsComplete(true);
    // Simulate random success/failure
    setPaymentStatus(Math.random() > 0.2 ? 'success' : 'failed');
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            {/* Rent info card */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Home className="w-4 h-4 text-primary" />
                  <span className="font-medium">{property}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span>Landlord: {landlord}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Due: {dueDate.toLocaleDateString()}</span>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">Rent Due</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(rentDue, currency)}</p>
                </div>
              </CardContent>
            </Card>

            {/* Payment type selection */}
            <div className="space-y-3">
              <Label>Select Payment Type</Label>
              <div className="grid grid-cols-2 gap-3">
                <Card 
                  className={`p-4 cursor-pointer transition-all ${paymentType === 'full' ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'}`}
                  onClick={() => setPaymentType('full')}
                >
                  <h4 className="font-semibold">Full Amount</h4>
                  <p className="text-sm text-muted-foreground mt-1">{formatCurrency(rentDue, currency)}</p>
                </Card>
                <Card 
                  className={`p-4 cursor-pointer transition-all ${paymentType === 'partial' ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'}`}
                  onClick={() => setPaymentType('partial')}
                >
                  <h4 className="font-semibold">Partial Amount</h4>
                  <p className="text-sm text-muted-foreground mt-1">Pay what you can</p>
                </Card>
              </div>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount to Pay ({currency})</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                max={rentDue}
                min={1000}
                className="text-2xl h-14 font-bold text-center"
              />
            </div>

            {/* Quick amount chips */}
            <div className="flex flex-wrap gap-2">
              {[0.25, 0.5, 0.75, 1].map((pct) => (
                <Button
                  key={pct}
                  variant={amount === rentDue * pct ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAmount(Math.round(rentDue * pct))}
                >
                  {pct * 100}%
                </Button>
              ))}
            </div>

            {/* Coverage info */}
            <Card className="bg-muted/30">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">This covers</p>
                <p className="text-lg font-semibold">
                  {Math.round((amount / rentDue) * 30)} days
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({Math.round((amount / rentDue) * 100)}% of month)
                  </span>
                </p>
              </CardContent>
            </Card>
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

      case 3:
        return (
          <ConfirmSummaryCard
            items={[
              { label: 'Amount', value: formatCurrency(amount, currency) },
              { label: 'Recipient', value: landlord },
              { label: 'Property', value: property, secondary: true },
              { label: 'Method', value: selectedMethod?.name || '' },
            ]}
            fees={[
              { label: 'Transaction Fee', value: formatCurrency(fee, currency) },
            ]}
            total={{ label: 'Total', value: formatCurrency(total, currency) }}
            confirmed={confirmed}
            onConfirmChange={setConfirmed}
          />
        );

      case 4:
        if (isProcessing) {
          return <ProcessingScreen onComplete={handleProcessingComplete} />;
        }
        return (
          <ReceiptCard
            status={paymentStatus}
            amount={amount}
            currency={currency}
            fees={fee}
            recipient={landlord}
            reference={`PAY-${Date.now()}`}
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
      title="Pay Rent"
      steps={STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      canGoNext={canProceed()}
      onNext={handleNext}
      showNavigation={currentStep < 4 && !isProcessing && !isComplete}
      nextLabel={currentStep === 3 ? 'Confirm Payment' : 'Continue'}
      isProcessing={isProcessing}
      isComplete={isComplete}
    >
      {renderStep()}
    </StepperModal>
  );
}

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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LOCAL_PAYMENT_METHODS, INTERNATIONAL_PAYMENT_METHODS, formatCurrency, calculateFee } from '@/lib/paymentMethods';
import { PaymentMethod } from './PaymentMethodCard';
import { Search, MapPin, Users, CheckCircle2, Lock, Calendar, TrendingUp } from 'lucide-react';

interface FundTenantsFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletBalance?: number;
}

interface Tenant {
  id: string;
  name: string;
  avatar?: string;
  location: string;
  rentDue: number;
  verified: boolean;
}

const MOCK_TENANTS: Tenant[] = [
  { id: '1', name: 'Sarah Nalubega', location: 'Bukoto, Kampala', rentDue: 450000, verified: true },
  { id: '2', name: 'David Ssempijja', location: 'Ntinda, Kampala', rentDue: 380000, verified: true },
  { id: '3', name: 'Grace Namukasa', location: 'Kira, Wakiso', rentDue: 520000, verified: true },
  { id: '4', name: 'Peter Okello', location: 'Entebbe, Wakiso', rentDue: 600000, verified: false },
];

const STEPS: Step[] = [
  { id: 'mode', title: 'Funding Mode' },
  { id: 'select', title: 'Select Tenants' },
  { id: 'amount', title: 'Funding Amount' },
  { id: 'source', title: 'Payment Source' },
  { id: 'confirm', title: 'Confirm' },
  { id: 'process', title: 'Processing' },
];

export default function FundTenantsFlow({
  open,
  onOpenChange,
  walletBalance = 2500000,
}: FundTenantsFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [fundingMode, setFundingMode] = useState<'specific' | 'location' | 'auto'>('specific');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTenants, setSelectedTenants] = useState<Tenant[]>([]);
  const [coverageType, setCoverageType] = useState<'full' | 'partial' | 'daily'>('full');
  const [fundingDays, setFundingDays] = useState(30);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed'>('success');

  const totalRentDue = selectedTenants.reduce((sum, t) => sum + t.rentDue, 0);
  const fundingAmount = coverageType === 'full' ? totalRentDue : 
                        coverageType === 'partial' ? totalRentDue * 0.5 :
                        totalRentDue * (fundingDays / 30);
  const fee = selectedMethod ? calculateFee(fundingAmount, selectedMethod) : 0;
  const total = fundingAmount + fee;
  const expectedROI = fundingAmount * 0.08; // 8% return

  const handleReset = () => {
    setCurrentStep(0);
    setFundingMode('specific');
    setSelectedTenants([]);
    setCoverageType('full');
    setFundingDays(30);
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
      case 0: return fundingMode !== 'auto';
      case 1: return selectedTenants.length > 0;
      case 2: return fundingAmount > 0;
      case 3: return selectedMethod !== null;
      case 4: return confirmed;
      default: return false;
    }
  };

  const handleNext = () => {
    if (currentStep === 4) {
      setCurrentStep(5);
      setIsProcessing(true);
    }
  };

  const handleProcessingComplete = () => {
    setIsProcessing(false);
    setIsComplete(true);
    setPaymentStatus(Math.random() > 0.2 ? 'success' : 'failed');
  };

  const toggleTenant = (tenant: Tenant) => {
    setSelectedTenants(prev => 
      prev.find(t => t.id === tenant.id) 
        ? prev.filter(t => t.id !== tenant.id)
        : [...prev, tenant]
    );
  };

  const filteredTenants = MOCK_TENANTS.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <Label>Choose Funding Mode</Label>
            <div className="space-y-3">
              <Card 
                className={`p-4 cursor-pointer transition-all ${fundingMode === 'specific' ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'}`}
                onClick={() => setFundingMode('specific')}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Search className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Fund Specific Tenant</h4>
                    <p className="text-sm text-muted-foreground">Search and select individual tenants to fund</p>
                  </div>
                </div>
              </Card>
              
              <Card 
                className={`p-4 cursor-pointer transition-all ${fundingMode === 'location' ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'}`}
                onClick={() => setFundingMode('location')}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Fund by Location</h4>
                    <p className="text-sm text-muted-foreground">Select tenants from a specific area</p>
                  </div>
                </div>
              </Card>
              
              <Card className="p-4 opacity-60 cursor-not-allowed relative overflow-hidden">
                <Badge className="absolute top-2 right-2" variant="secondary">Coming Soon</Badge>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Auto-Fund Program</h4>
                    <p className="text-sm text-muted-foreground">Automated recurring funding</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search tenant name or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Selected count */}
            {selectedTenants.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                <span className="text-sm font-medium">{selectedTenants.length} tenant(s) selected</span>
                <span className="text-sm text-primary font-semibold">
                  Total: {formatCurrency(totalRentDue, 'UGX')}
                </span>
              </div>
            )}

            {/* Tenant list */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {filteredTenants.map((tenant) => {
                const isSelected = selectedTenants.find(t => t.id === tenant.id);
                return (
                  <Card 
                    key={tenant.id}
                    className={`p-3 cursor-pointer transition-all ${isSelected ? 'ring-2 ring-primary border-primary bg-primary/5' : 'hover:border-primary/50'}`}
                    onClick={() => toggleTenant(tenant)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={tenant.avatar} />
                        <AvatarFallback>{tenant.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{tenant.name}</span>
                          {tenant.verified && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{tenant.location}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm">{formatCurrency(tenant.rentDue, 'UGX')}</p>
                        <p className="text-xs text-muted-foreground">Rent Due</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <Label>Coverage Type</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={coverageType === 'full' ? 'default' : 'outline'}
                onClick={() => setCoverageType('full')}
                className="h-auto py-3 flex-col"
              >
                <span className="font-semibold">Full</span>
                <span className="text-xs opacity-80">100%</span>
              </Button>
              <Button
                variant={coverageType === 'partial' ? 'default' : 'outline'}
                onClick={() => setCoverageType('partial')}
                className="h-auto py-3 flex-col"
              >
                <span className="font-semibold">Partial</span>
                <span className="text-xs opacity-80">50%</span>
              </Button>
              <Button
                variant={coverageType === 'daily' ? 'default' : 'outline'}
                onClick={() => setCoverageType('daily')}
                className="h-auto py-3 flex-col"
              >
                <span className="font-semibold">Daily</span>
                <span className="text-xs opacity-80">Custom</span>
              </Button>
            </div>

            {coverageType === 'daily' && (
              <div className="space-y-2">
                <Label>Funding Days</Label>
                <Select value={String(fundingDays)} onValueChange={(v) => setFundingDays(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[7, 14, 21, 30].map((days) => (
                      <SelectItem key={days} value={String(days)}>{days} days</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Summary card */}
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Funding Amount</span>
                  <span className="font-bold text-lg">{formatCurrency(fundingAmount, 'UGX')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Beneficiaries</span>
                  <span className="font-medium">{selectedTenants.length} tenant(s)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">{coverageType === 'daily' ? fundingDays : 30} days</span>
                </div>
                <div className="pt-2 border-t flex justify-between items-center">
                  <div className="flex items-center gap-1 text-emerald-600">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm">Expected Return</span>
                  </div>
                  <span className="font-bold text-emerald-600">+{formatCurrency(expectedROI, 'UGX')}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <Tabs defaultValue="wallet" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="wallet">Wallet</TabsTrigger>
                <TabsTrigger value="external">External</TabsTrigger>
              </TabsList>
              
              <TabsContent value="wallet" className="space-y-3 mt-4">
                <PaymentMethodCard
                  method={{
                    id: 'welile-wallet',
                    name: 'Welile Wallet',
                    type: 'wallet',
                    region: 'local',
                    fee: 'Free',
                    feeAmount: 0,
                    eta: 'Instant',
                  }}
                  selected={selectedMethod?.id === 'welile-wallet'}
                  onSelect={() => setSelectedMethod({
                    id: 'welile-wallet',
                    name: 'Welile Wallet',
                    type: 'wallet',
                    region: 'local',
                    fee: 'Free',
                    feeAmount: 0,
                    eta: 'Instant',
                  })}
                />
                <p className="text-sm text-muted-foreground text-center">
                  Balance: {formatCurrency(walletBalance, 'UGX')}
                </p>
              </TabsContent>
              
              <TabsContent value="external" className="space-y-3 mt-4">
                {[...LOCAL_PAYMENT_METHODS.slice(0, 2), ...INTERNATIONAL_PAYMENT_METHODS.slice(0, 1)].map((method) => (
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

      case 4:
        return (
          <ConfirmSummaryCard
            items={[
              { label: 'Funding Amount', value: formatCurrency(fundingAmount, 'UGX'), highlight: true },
              { label: 'Beneficiaries', value: `${selectedTenants.length} tenant(s)` },
              { label: 'Duration', value: `${coverageType === 'daily' ? fundingDays : 30} days` },
              { label: 'Expected ROI', value: `+${formatCurrency(expectedROI, 'UGX')}` },
              { label: 'Payment Source', value: selectedMethod?.name || '' },
            ]}
            fees={fee > 0 ? [{ label: 'Transaction Fee', value: formatCurrency(fee, 'UGX') }] : []}
            total={{ label: 'Total Investment', value: formatCurrency(total, 'UGX') }}
            confirmText="I agree to the funding terms and conditions"
            confirmed={confirmed}
            onConfirmChange={setConfirmed}
          />
        );

      case 5:
        if (isProcessing) {
          return <ProcessingScreen onComplete={handleProcessingComplete} />;
        }
        return (
          <ReceiptCard
            status={paymentStatus}
            amount={fundingAmount}
            currency="UGX"
            fees={fee}
            recipient={`${selectedTenants.length} Tenant(s)`}
            reference={`FUND-${Date.now()}`}
            method={selectedMethod?.name || ''}
            date={new Date()}
            onDownload={() => {}}
            onShare={() => {}}
            onTryAgain={() => setCurrentStep(3)}
            onChangeMethod={() => setCurrentStep(3)}
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
      title="Fund Tenants"
      steps={STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      canGoNext={canProceed()}
      onNext={handleNext}
      showNavigation={currentStep < 5 && !isProcessing && !isComplete}
      nextLabel={currentStep === 4 ? 'Confirm Funding' : 'Continue'}
      isProcessing={isProcessing}
      isComplete={isComplete}
    >
      {renderStep()}
    </StepperModal>
  );
}

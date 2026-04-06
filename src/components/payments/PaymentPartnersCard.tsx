import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCard, Phone, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import PaymentConfirmationForm from './PaymentConfirmationForm';

interface PaymentPartnersCardProps {
  dashboardType: 'tenant' | 'supporter';
  onPaymentSubmitted?: () => void;
}

const PROVIDERS = {
  mtn: {
    name: 'MTN MoMo',
    merchantId: '090777',
    steps: [
      'Dial *165*3#',
      'Choose "Pay with MoMo"',
      'Enter Merchant ID: 090777',
      'Enter amount & confirm with PIN',
    ],
    buildDial: (amount: string) => `tel:*165*3*${amount}%23`,
  },
  airtel: {
    name: 'Airtel Money',
    merchantId: '4380664',
    steps: [
      'Dial *185*9#',
      'Select "Pay Merchant"',
      'Enter Merchant ID: 4380664',
      'Enter amount & confirm with PIN',
    ],
    buildDial: () => `tel:*185*9%23`,
  },
};

const MERCHANT_NAME = 'WELILE TECHNOLOGIES LIMITTED';

export default function PaymentPartnersCard({ dashboardType, onPaymentSubmitted }: PaymentPartnersCardProps) {
  const [provider, setProvider] = useState<'mtn' | 'airtel'>('mtn');
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const data = PROVIDERS[provider];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.merchantId);
      setCopied(true);
      toast.success(`Copied ${data.merchantId}`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handlePayNow = () => {
    const dial = provider === 'mtn' ? PROVIDERS.mtn.buildDial(amount) : PROVIDERS.airtel.buildDial();
    window.location.href = dial;
    setTimeout(() => {
      toast.info(`Merchant ID: ${data.merchantId}`, {
        duration: 10000,
        action: { label: 'Copy', onClick: handleCopy },
      });
    }, 500);
  };

  const isMtn = provider === 'mtn';

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Pay via Mobile Money
          </CardTitle>
          <CardDescription>Select your provider and pay in seconds</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Provider Tabs */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setProvider('mtn')}
              className={cn(
                'flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 transition-all font-semibold text-sm',
                isMtn
                  ? 'border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 shadow-sm'
                  : 'border-border hover:border-[hsl(var(--warning))]/50'
              )}
            >
              <div className="w-7 h-7 rounded-full bg-[hsl(var(--warning))] flex items-center justify-center text-[hsl(var(--warning-foreground))] font-bold text-[9px]">MTN</div>
              MTN MoMo
            </button>
            <button
              type="button"
              onClick={() => setProvider('airtel')}
              className={cn(
                'flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 transition-all font-semibold text-sm',
                !isMtn
                  ? 'border-destructive bg-destructive/10 shadow-sm'
                  : 'border-border hover:border-destructive/50'
              )}
            >
              <div className="w-7 h-7 rounded-full bg-destructive flex items-center justify-center text-destructive-foreground font-bold text-[9px]">AIR</div>
              Airtel
            </button>
          </div>

          {/* Merchant ID */}
          <div className="p-3 bg-muted/60 rounded-xl text-center space-y-0.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Merchant ID</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-mono font-bold tracking-widest">{data.merchantId}</span>
              <button type="button" onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
              </button>
            </div>
            <p className="text-[10px] text-primary font-medium">{MERCHANT_NAME}</p>
          </div>

          {/* Timeline Steps */}
          <div className="pl-2">
            {data.steps.map((step, i) => (
              <div key={i} className="flex gap-2.5 items-start">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                    isMtn
                      ? 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]'
                      : 'bg-destructive text-destructive-foreground'
                  )}>
                    {i + 1}
                  </div>
                  {i < data.steps.length - 1 && <div className="w-px h-3.5 bg-border" />}
                </div>
                <p className="text-xs text-muted-foreground pt-0.5 pb-1.5">{step}</p>
              </div>
            ))}
          </div>

          {/* Amount Input */}
          <div className="space-y-1.5">
            <Label className="text-xs">Amount (UGX)</Label>
            <Input
              type="number"
              placeholder="Enter amount to pay"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="500"
              className="h-10 text-base font-semibold"
            />
          </div>

          {/* Pay Now */}
          {amount && parseFloat(amount) > 0 && (
            <Button
              type="button"
              className={cn(
                'w-full h-11 font-semibold',
                isMtn
                  ? 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] hover:bg-[hsl(var(--warning))]/90'
                  : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              )}
              onClick={handlePayNow}
            >
              <Phone className="h-4 w-4 mr-2" />
              Pay Now via {isMtn ? 'MTN' : 'Airtel'}
            </Button>
          )}
        </CardContent>
      </Card>

      <PaymentConfirmationForm
        dashboardType={dashboardType}
        onSuccess={onPaymentSubmitted}
      />
    </div>
  );
}

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Phone, Copy, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PaymentPartnerCardProps {
  partner: 'mtn' | 'airtel';
  onPayNow?: () => void;
}

const PARTNER_DATA = {
  mtn: {
    name: 'MTN MoMo',
    merchantId: '090777',
    ussd: '*165*3#',
    dialString: 'tel:*165*3%23',
    bgColor: 'bg-[#FFCC00]',
    textColor: 'text-black',
    borderColor: 'border-[#FFCC00]',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/New-mtn-logo.svg/200px-New-mtn-logo.svg.png',
    steps: [
      'Dial *165*3#',
      'Choose "Pay with MoMo"',
      'Enter Merchant ID: 090777',
      'Enter Amount',
      'Enter PIN and confirm'
    ]
  },
  airtel: {
    name: 'Airtel Money',
    merchantId: '4380664',
    ussd: '*185*9#',
    dialString: 'tel:*185*9%23',
    bgColor: 'bg-[#ED1C24]',
    textColor: 'text-white',
    borderColor: 'border-[#ED1C24]',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Airtel_logo.svg/200px-Airtel_logo.svg.png',
    steps: [
      'Dial *185*9#',
      'Select "Pay Merchant"',
      'Enter Merchant ID: 4380664',
      'Enter Amount',
      'Enter PIN and confirm'
    ]
  }
};

export default function PaymentPartnerCard({ partner, onPayNow }: PaymentPartnerCardProps) {
  const [isStepsOpen, setIsStepsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const data = PARTNER_DATA[partner];

  const handleCopyMerchantId = async () => {
    try {
      await navigator.clipboard.writeText(data.merchantId);
      setCopied(true);
      toast.success(`Merchant ID ${data.merchantId} copied!`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handlePayNow = () => {
    // Try to open phone dialer with USSD code
    window.location.href = data.dialString;
    
    // Show merchant ID reminder
    setTimeout(() => {
      toast.info(`Merchant ID: ${data.merchantId}`, {
        duration: 10000,
        action: {
          label: 'Copy',
          onClick: handleCopyMerchantId
        }
      });
    }, 500);
    
    onPayNow?.();
  };

  return (
    <Card className={cn('overflow-hidden border-2', data.borderColor)}>
      {/* Header */}
      <div className={cn('p-2.5 sm:p-4 flex items-center gap-2 sm:gap-3', data.bgColor)}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-white flex items-center justify-center p-0.5 sm:p-1 shadow-sm shrink-0">
          <img 
            src={data.logoUrl} 
            alt={data.name}
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
        <div className="min-w-0">
          <h3 className={cn('font-bold text-sm sm:text-lg leading-tight truncate', data.textColor)}>{data.name}</h3>
          <Badge variant="secondary" className="bg-white/90 text-black font-mono text-[10px] sm:text-xs px-1.5 py-0">
            Pay Merchant
          </Badge>
        </div>
      </div>

      <CardContent className="p-2.5 sm:p-4 space-y-2.5 sm:space-y-4">
        {/* Merchant ID - Large & Prominent */}
        <div className="text-center py-2 sm:py-3 bg-muted/50 rounded-lg">
          <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Merchant ID</p>
          <p className="text-xl sm:text-3xl font-bold font-mono tracking-wider">{data.merchantId}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:grid sm:grid-cols-2 gap-1.5 sm:gap-2">
          <Button 
            onClick={handlePayNow}
            className={cn('font-semibold text-xs sm:text-sm', data.bgColor, data.textColor, 'hover:opacity-90')}
            size="sm"
          >
            <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            Pay Now
          </Button>
          <Button 
            variant="outline"
            onClick={handleCopyMerchantId}
            size="sm"
            className="font-semibold text-xs sm:text-sm"
          >
            {copied ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-success" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                Copy ID
              </>
            )}
          </Button>
        </div>

        {/* Manual Steps Collapsible */}
        <Collapsible open={isStepsOpen} onOpenChange={setIsStepsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between text-muted-foreground text-xs sm:text-sm h-8 sm:h-10">
              <span>View Manual Steps</span>
              {isStepsOpen ? <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="bg-muted/30 rounded-lg p-2 sm:p-3 space-y-1.5 sm:space-y-2">
              {data.steps.map((step, index) => (
                <div key={index} className="flex gap-2 sm:gap-3 items-start">
                  <span className={cn(
                    'flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold',
                    data.bgColor, data.textColor
                  )}>
                    {index + 1}
                  </span>
                  <p className="text-xs sm:text-sm pt-0.5">{step}</p>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

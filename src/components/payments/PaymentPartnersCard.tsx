import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CreditCard } from 'lucide-react';
import PaymentPartnerCard from './PaymentPartnerCard';
import PaymentConfirmationForm from './PaymentConfirmationForm';

interface PaymentPartnersCardProps {
  dashboardType: 'tenant' | 'supporter';
  onPaymentSubmitted?: () => void;
}

export default function PaymentPartnersCard({ dashboardType, onPaymentSubmitted }: PaymentPartnersCardProps) {
  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Payment Partners
          </CardTitle>
          <CardDescription>
            Pay in 10 seconds using Mobile Money
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Partner Cards - Side by side on desktop, stacked on mobile */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <PaymentPartnerCard partner="mtn" />
            <PaymentPartnerCard partner="airtel" />
          </div>
        </CardContent>
      </Card>

      {/* Payment Confirmation Form */}
      <PaymentConfirmationForm 
        dashboardType={dashboardType} 
        onSuccess={onPaymentSubmitted}
      />
    </div>
  );
}

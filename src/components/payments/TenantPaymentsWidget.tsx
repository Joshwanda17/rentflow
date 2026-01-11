import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, ArrowUpRight, ArrowDownLeft, History, CreditCard } from 'lucide-react';
import { formatCurrency } from '@/lib/paymentMethods';
import PayRentFlow from './PayRentFlow';
import DepositFlow from './DepositFlow';

interface TenantPaymentsWidgetProps {
  walletBalance?: number;
  rentDue?: number;
  dueDate?: Date;
  onViewHistory?: () => void;
}

export default function TenantPaymentsWidget({
  walletBalance = 150000,
  rentDue = 500000,
  dueDate = new Date(),
}: TenantPaymentsWidgetProps) {
  const [showPayRent, setShowPayRent] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);

  return (
    <>
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Payments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Balances */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-background/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Wallet Balance</p>
              <p className="text-lg font-bold">{formatCurrency(walletBalance, 'UGX')}</p>
            </div>
            <div className="p-3 bg-background/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Rent Due</p>
              <p className="text-lg font-bold text-orange-600">{formatCurrency(rentDue, 'UGX')}</p>
              <p className="text-xs text-muted-foreground">{dueDate.toLocaleDateString()}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setShowPayRent(true)} className="gap-2">
              <ArrowUpRight className="w-4 h-4" />
              Pay Rent
            </Button>
            <Button onClick={() => setShowDeposit(true)} variant="outline" className="gap-2">
              <ArrowDownLeft className="w-4 h-4" />
              Deposit
            </Button>
          </div>
        </CardContent>
      </Card>

      <PayRentFlow open={showPayRent} onOpenChange={setShowPayRent} rentDue={rentDue} dueDate={dueDate} />
      <DepositFlow open={showDeposit} onOpenChange={setShowDeposit} walletBalance={walletBalance} />
    </>
  );
}

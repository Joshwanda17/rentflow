import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, Users, ArrowDownLeft, ArrowUpRight, FileText, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/paymentMethods';
import FundTenantsFlow from './FundTenantsFlow';
import DepositFlow from './DepositFlow';
import WithdrawFlow from './WithdrawFlow';

interface PartnerWalletWidgetProps {
  availableBalance?: number;
  lockedBalance?: number;
  roiEarned?: number;
}

export default function PartnerWalletWidget({
  availableBalance = 2500000,
  lockedBalance = 1800000,
  roiEarned = 250000,
}: PartnerWalletWidgetProps) {
  const [showFundTenants, setShowFundTenants] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  return (
    <>
      <Card className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 border-emerald-500/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            Wallet Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Balances */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 bg-background/50 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Available</p>
              <p className="text-sm font-bold">{formatCurrency(availableBalance, 'UGX')}</p>
            </div>
            <div className="p-3 bg-background/50 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Invested</p>
              <p className="text-sm font-bold text-blue-600">{formatCurrency(lockedBalance, 'UGX')}</p>
            </div>
            <div className="p-3 bg-background/50 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">ROI Earned</p>
              <p className="text-sm font-bold text-emerald-600">+{formatCurrency(roiEarned, 'UGX')}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2">
            <Button onClick={() => setShowFundTenants(true)} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Users className="w-4 h-4" />
              Fund Tenants
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setShowDeposit(true)} variant="outline" className="gap-2">
                <ArrowDownLeft className="w-4 h-4" />
                Deposit
              </Button>
              <Button onClick={() => setShowWithdraw(true)} variant="outline" className="gap-2">
                <ArrowUpRight className="w-4 h-4" />
                Withdraw
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <FundTenantsFlow open={showFundTenants} onOpenChange={setShowFundTenants} walletBalance={availableBalance} />
      <DepositFlow open={showDeposit} onOpenChange={setShowDeposit} walletBalance={availableBalance} />
      <WithdrawFlow open={showWithdraw} onOpenChange={setShowWithdraw} availableBalance={availableBalance} roiBalance={roiEarned} onSuccess={() => setShowWithdraw(false)} />
    </>
  );
}

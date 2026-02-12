import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, AlertTriangle } from 'lucide-react';

export function InvestmentAccountsManager() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Investment Accounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Feature Currently Disabled</p>
            <p className="text-sm text-muted-foreground mt-2">
              Investment accounts management will be available in a future update.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

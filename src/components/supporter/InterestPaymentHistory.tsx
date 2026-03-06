import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, PiggyBank } from 'lucide-react';


interface InterestPaymentHistoryProps {
  userId: string;
}

export function InterestPaymentHistory({ userId }: InterestPaymentHistoryProps) {
  return (
    <div className="animate-fade-in">
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-success/5 via-background to-emerald-500/5 shadow-xl">
        <CardHeader className="relative pb-2 sm:pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-success via-emerald-500 to-green-500 shadow-lg shadow-success/30">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-black tracking-tight">Interest Payments 💰</CardTitle>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Feature currently disabled</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="text-center py-10">
            <div className="p-4 rounded-full bg-gradient-to-br from-success/20 to-success/5 w-fit mx-auto mb-4">
              <PiggyBank className="h-8 w-8 text-success/60" />
            </div>
            <p className="text-foreground font-bold text-base">Interest payments unavailable 🌱</p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto">
              This feature will be available in a future update
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Receipt, TrendingUp, ArrowRight } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface LoanLimitPromoCardProps {
  userId: string;
}

const MAX_LOAN_LIMIT = 30000000;
const MIN_LOAN_LIMIT = 30000;

export function LoanLimitPromoCard({ userId }: LoanLimitPromoCardProps) {
  const navigate = useNavigate();
  const [loanLimit] = useState<number>(MIN_LOAN_LIMIT);

  const progressPercentage = Math.min((loanLimit / MAX_LOAN_LIMIT) * 100, 100);
  const remainingToMax = MAX_LOAN_LIMIT - loanLimit;

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.02] to-transparent">
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground text-sm">
                Unlock Up to <span className="text-primary">UGX 30M</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Post shopping receipts to increase your limit
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Current Limit</span>
              <span className="font-medium text-foreground">
                {formatUGX(loanLimit)}
              </span>
            </div>
            <Progress value={progressPercentage} className="h-1.5" />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>UGX 30K</span>
              <span>UGX 30M</span>
            </div>
          </div>

          {remainingToMax > 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/5 border border-success/10">
              <Receipt className="h-3.5 w-3.5 text-success shrink-0" />
              <p className="text-xs text-success">
                Shop & post receipts to unlock {formatUGX(remainingToMax)} more
              </p>
            </div>
          )}

          <Button 
            onClick={() => navigate('/my-receipts')} 
            className="w-full gap-2"
            size="sm"
          >
            <Receipt className="h-3.5 w-3.5" />
            Post Receipt
            <ArrowRight className="h-3.5 w-3.5 ml-auto" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

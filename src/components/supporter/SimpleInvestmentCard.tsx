import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Plus, ArrowRight, Sparkles } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';


interface SimpleInvestmentCardProps {
  totalInvested: number;
  expectedReturns: number;
  onAddInvestment: () => void;
  onViewDetails: () => void;
}

export function SimpleInvestmentCard({ 
  totalInvested, 
  expectedReturns, 
  onAddInvestment,
  onViewDetails
}: SimpleInvestmentCardProps) {
  const monthlyReturn = totalInvested * 0.15;

  return (
    <div className="animate-fade-in">
      <Card className="relative overflow-hidden border-0 bg-gradient-to-r from-primary/10 via-background to-success/5">
        <CardContent className="relative p-3">
          {/* Compact single-row layout */}
          <div className="flex items-center justify-between gap-3">
            {/* Left: Icon + Stats */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-md shadow-primary/20 shrink-0">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold text-foreground truncate">My Investment</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-success/10 text-success border-success/30 shrink-0">
                    15% ROI
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">💰 <span className="font-bold text-foreground">{formatUGX(totalInvested)}</span></span>
                  <span className="text-success font-bold">+{formatUGX(monthlyReturn)}/mo</span>
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Button 
                onClick={onAddInvestment}
                size="sm"
                className="h-9 px-3 text-xs font-bold bg-primary hover:bg-primary/90 gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
              <Button 
                onClick={onViewDetails}
                size="sm"
                variant="ghost"
                className="h-9 w-9 p-0"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

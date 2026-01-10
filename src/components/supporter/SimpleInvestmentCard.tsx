import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Plus, ArrowRight, Sparkles } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';

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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary/15 via-background to-success/10 shadow-xl">
        {/* Subtle glow */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-success/20 rounded-full blur-3xl" />
        
        <CardContent className="relative p-5 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/30">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-black text-foreground">My Investment</h2>
                <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30">
                  15% Monthly Returns
                </Badge>
              </div>
            </div>
          </div>

          {/* Big Numbers - Super Clear */}
          <div className="grid grid-cols-2 gap-4">
            {/* Total Invested */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
              <p className="text-xs text-muted-foreground font-semibold mb-1">💰 Invested</p>
              <p className="text-xl font-black text-foreground">{formatUGX(totalInvested)}</p>
            </div>
            
            {/* Monthly Earnings */}
            <div className="p-4 rounded-2xl bg-success/10 border border-success/20 text-center">
              <p className="text-xs text-success font-semibold mb-1">✨ Monthly Earnings</p>
              <p className="text-xl font-black text-success">+{formatUGX(monthlyReturn)}</p>
            </div>
          </div>

          {/* Simple Actions */}
          <div className="flex gap-3">
            <Button 
              onClick={onAddInvestment}
              size="lg"
              className="flex-1 h-14 text-base font-bold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 gap-2"
            >
              <Plus className="h-5 w-5" />
              Add Money
            </Button>
            <Button 
              onClick={onViewDetails}
              size="lg"
              variant="outline"
              className="h-14 px-5 border-primary/30 hover:bg-primary/10"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

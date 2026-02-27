import { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Home, MapPin, HandCoins } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { useOpportunitySummary } from '@/hooks/useOpportunitySummary';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import { FundRentDialog } from './FundRentDialog';
import { InvestmentWithdrawButton } from './InvestmentWithdrawButton';

export function OpportunitySummaryCard() {
  const { summary, loading } = useOpportunitySummary();
  const { formatAmount } = useCurrency();
  const [showFundDialog, setShowFundDialog] = useState(false);

  if (loading) {
    return <div className="h-36 rounded-2xl bg-muted/50 animate-pulse" />;
  }

  if (!summary) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground rounded-2xl border-2 border-dashed border-border/60 font-medium">
        No opportunity summary available yet
      </div>
    );
  }

  const stats = [
    { icon: Home, label: 'Requests', value: summary.total_requests },
    { icon: Users, label: 'Landlords', value: summary.total_landlords },
    { icon: MapPin, label: 'Agents', value: summary.total_agents },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-card to-primary/10 p-5 shadow-sm space-y-4"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/15">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-foreground text-base">Opportunity Summary</h3>
            <p className="text-xs text-muted-foreground font-medium">Current market snapshot</p>
          </div>
        </div>

        {/* Total rent */}
        <div className="px-4 py-3 rounded-xl bg-primary/10">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Rent Requested</p>
          <p className="text-2xl font-black text-primary">{formatAmount(summary.total_rent_requested)}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl bg-muted/40">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <p className="text-lg font-black text-foreground leading-none">{value}</p>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>

        {/* Fund button */}
        <Button
          onClick={() => setShowFundDialog(true)}
          className="w-full gap-2 rounded-xl font-bold h-11"
        >
          <HandCoins className="h-5 w-5" />
          Fund Rent Requests
        </Button>

        {/* Withdraw investment button */}
        <InvestmentWithdrawButton />

        {/* Notes */}
        {summary.notes && (
          <p className="text-xs text-muted-foreground italic px-1">📝 {summary.notes}</p>
        )}
      </motion.div>

      {/* Fund Dialog */}
      <FundRentDialog
        open={showFundDialog}
        onOpenChange={setShowFundDialog}
        summary={summary}
      />
    </>
  );
}

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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';

export function OpportunitySummaryCard() {
  const { summary, loading } = useOpportunitySummary();
  const { formatAmount } = useCurrency();
  const { wallet } = useWallet();
  const { user } = useAuth();
  const { toast } = useToast();

  const [showFundDialog, setShowFundDialog] = useState(false);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDepositPrompt, setShowDepositPrompt] = useState(false);

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

  const walletBalance = wallet?.balance ?? 0;
  const amountNum = Number(amount) || 0;
  const exceedsBalance = amountNum > walletBalance;
  const exceedsRequested = amountNum > summary.total_rent_requested;
  const isValid = amountNum > 0 && !exceedsBalance && !exceedsRequested;

  const handleFundSubmit = async () => {
    if (!user || !isValid) return;

    if (exceedsBalance) {
      setShowDepositPrompt(true);
      return;
    }

    setSubmitting(true);
    try {
      // Generate reference ID: WRF + YYMMDD + random 4 digits
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const seq = String(Math.floor(1000 + Math.random() * 9000));
      const referenceId = `WRF${yy}${mm}${dd}${seq}`;

      // Insert pending operation for manager approval
      const { error } = await supabase.from('pending_wallet_operations').insert({
        user_id: user.id,
        amount: amountNum,
        direction: 'cash_out',
        category: 'supporter_rent_fund',
        source_table: 'opportunity_summaries',
        source_id: summary.id,
        description: `Supporter rent funding: ${formatUGX(amountNum)} towards rent requests`,
        reference_id: referenceId,
        linked_party: 'Rent Management Pool',
        status: 'pending',
      });

      if (error) throw error;

      toast({
        title: '✅ Funding request submitted',
        description: `${formatUGX(amountNum)} pending manager approval. Thank you!`,
      });

      setAmount('');
      setShowFundDialog(false);
    } catch (err) {
      console.error('[OpportunitySummaryCard] Fund error:', err);
      toast({
        title: 'Failed to submit',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

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

        {/* Notes */}
        {summary.notes && (
          <p className="text-xs text-muted-foreground italic px-1">📝 {summary.notes}</p>
        )}
      </motion.div>

      {/* Fund Dialog */}
      <Dialog open={showFundDialog} onOpenChange={setShowFundDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-primary" />
              Fund Rent Requests
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Wallet balance */}
            <div className="px-4 py-3 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground font-semibold">Your Wallet Balance</p>
              <p className="text-xl font-black text-foreground">{formatUGX(walletBalance)}</p>
            </div>

            {/* Amount input */}
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-foreground">Amount to Fund (UGX)</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="e.g. 500000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="text-lg font-bold h-12"
              />
              {exceedsBalance && amountNum > 0 && (
                <p className="text-xs text-destructive font-semibold">
                  Insufficient balance. You need {formatUGX(amountNum - walletBalance)} more.
                </p>
              )}
              {exceedsRequested && amountNum > 0 && (
                <p className="text-xs text-destructive font-semibold">
                  Amount exceeds total rent requested ({formatAmount(summary.total_rent_requested)}).
                </p>
              )}
            </div>

            {/* Deposit prompt */}
            {exceedsBalance && amountNum > 0 ? (
              <Button
                variant="outline"
                className="w-full gap-2 rounded-xl font-bold border-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10 h-11"
                onClick={() => {
                  setShowFundDialog(false);
                  // Trigger deposit flow — dispatches custom event picked up by the dashboard
                  window.dispatchEvent(new CustomEvent('open-deposit'));
                }}
              >
                💳 Deposit to Wallet First
              </Button>
            ) : (
              <Button
                onClick={handleFundSubmit}
                disabled={!isValid || submitting}
                className="w-full gap-2 rounded-xl font-bold h-11"
              >
                {submitting ? 'Submitting…' : `Fund ${amountNum > 0 ? formatUGX(amountNum) : ''}`}
              </Button>
            )}

            <p className="text-[10px] text-muted-foreground text-center">
              Funds will be deducted after manager approval
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

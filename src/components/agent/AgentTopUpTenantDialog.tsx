import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Wallet, Search, User } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface AgentTopUpTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AgentTopUpTenantDialog({ open, onOpenChange, onSuccess }: AgentTopUpTenantDialogProps) {
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [tenantInfo, setTenantInfo] = useState<{ id: string; full_name: string; phone: string } | null>(null);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();

  const searchTenant = async () => {
    if (!phone.trim() || phone.trim().length < 10) {
      toast({ title: 'Enter a valid phone number', variant: 'destructive' });
      return;
    }
    setSearching(true);
    setTenantInfo(null);

    try {
      // Normalize phone - try with and without leading 0 / +256
      const normalized = phone.trim().replace(/^\+?256/, '0');
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .or(`phone.eq.${normalized},phone.eq.+256${normalized.slice(1)}`)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast({ title: 'Tenant not found', description: 'No user found with that phone number.', variant: 'destructive' });
        return;
      }
      setTenantInfo(data);
    } catch (err: any) {
      toast({ title: 'Search failed', description: err.message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const handleTopUp = async () => {
    if (!tenantInfo) return;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Use the existing agent-deposit edge function
      const { data, error } = await supabase.functions.invoke('agent-deposit', {
        body: {
          user_phone: tenantInfo.phone,
          amount: amountNum,
          provider: 'wallet_topup',
          transaction_id: `TOPUP-${Date.now()}`,
        },
      });

      if (error) throw error;

      setSuccess(true);
      toast({ title: `${formatUGX(amountNum)} deposited to ${tenantInfo.full_name}'s wallet` });
      onSuccess?.();
    } catch (err: any) {
      toast({ title: 'Top-up failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPhone('');
    setAmount('');
    setTenantInfo(null);
    setSuccess(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Top Up Tenant Wallet
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 mx-auto bg-success/20 rounded-full flex items-center justify-center">
              <Wallet className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold">Top-Up Successful!</h3>
            <p className="text-muted-foreground">{formatUGX(parseFloat(amount))} deposited to {tenantInfo?.full_name}</p>
            <Button onClick={handleClose} className="w-full">Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Step 1: Find tenant */}
            <div className="space-y-2">
              <Label>Tenant Phone Number</Label>
              <div className="flex gap-2">
                <Input
                  type="tel"
                  placeholder="e.g. 0700123456"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setTenantInfo(null); }}
                  disabled={loading}
                  className="h-12 flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={searchTenant}
                  disabled={searching || loading}
                  className="h-12 px-4"
                >
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Found tenant */}
            {tenantInfo && (
              <div className="bg-secondary/50 rounded-xl p-4 flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{tenantInfo.full_name}</p>
                  <p className="text-sm text-muted-foreground">{tenantInfo.phone}</p>
                </div>
              </div>
            )}

            {/* Step 2: Amount */}
            {tenantInfo && (
              <>
                <div className="space-y-2">
                  <Label>Amount (UGX)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 50000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={loading}
                    min="1"
                    className="h-12"
                  />
                </div>

                <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                  💡 This will deposit directly into the tenant's wallet. If they have an active repayment schedule, it'll be auto-deducted.
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleClose} className="flex-1 h-12" disabled={loading}>
                    Cancel
                  </Button>
                  <Button onClick={handleTopUp} className="flex-1 h-12" disabled={loading || !amount}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Deposit ${amount ? formatUGX(parseFloat(amount) || 0) : ''}`}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

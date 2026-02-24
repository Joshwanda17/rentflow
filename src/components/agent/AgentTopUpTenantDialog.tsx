import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Wallet, Search, User } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface AgentTopUpTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AgentTopUpTenantDialog({ open, onOpenChange, onSuccess }: AgentTopUpTenantDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ id: string; full_name: string; phone: string }[]>([]);
  const [tenantInfo, setTenantInfo] = useState<{ id: string; full_name: string; phone: string } | null>(null);
  const [success, setSuccess] = useState(false);
  const [agentBalance, setAgentBalance] = useState<number | null>(null);
  const [tenantRentBalance, setTenantRentBalance] = useState<number | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch agent's wallet balance when dialog opens
  useEffect(() => {
    if (!open || !user) return;
    const fetchBalance = async () => {
      const { data } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();
      setAgentBalance(data?.balance ?? 0);
    };
    fetchBalance();
  }, [open, user]);

  // Search tenants by name or phone
  const searchTenant = async () => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      toast({ title: 'Enter at least 2 characters to search', variant: 'destructive' });
      return;
    }
    setSearching(true);
    setTenantInfo(null);
    setSearchResults([]);
    setTenantRentBalance(null);

    try {
      const isPhone = /^\+?\d{7,}$/.test(q.replace(/\s/g, ''));
      let query = supabase.from('profiles').select('id, full_name, phone');

      if (isPhone) {
        const normalized = q.replace(/^\+?256/, '0');
        query = query.or(`phone.eq.${normalized},phone.eq.+256${normalized.slice(1)}`);
      } else {
        query = query.ilike('full_name', `%${q}%`);
      }

      const { data, error } = await query.limit(8);
      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: 'No tenant found', description: `No user matching "${q}"`, variant: 'destructive' });
        return;
      }
      if (data.length === 1) {
        selectTenant(data[0]);
      } else {
        setSearchResults(data);
      }
    } catch (err: any) {
      toast({ title: 'Search failed', description: err.message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const selectTenant = async (tenant: { id: string; full_name: string; phone: string }) => {
    setTenantInfo(tenant);
    setSearchResults([]);
    // Fetch tenant's rent balance
    const { data } = await supabase
      .from('rent_requests')
      .select('total_repayment, amount_repaid')
      .eq('tenant_id', tenant.id)
      .in('status', ['approved', 'disbursed', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setTenantRentBalance(data.total_repayment - data.amount_repaid);
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
      const { error } = await supabase.functions.invoke('agent-deposit', {
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
    setSearchQuery('');
    setAmount('');
    setTenantInfo(null);
    setSearchResults([]);
    setSuccess(false);
    setTenantRentBalance(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Pay Rent for Tenant
            Top Up Tenant Wallet
          </DialogTitle>
        </DialogHeader>

        {/* Agent's own wallet balance */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Your Wallet Balance</span>
          <span className="font-mono font-bold text-primary text-lg">
            {agentBalance !== null ? formatUGX(agentBalance) : '...'}
          </span>
        </div>

        {success ? (
         <div className="text-center py-6 space-y-4">
             <div className="w-16 h-16 mx-auto bg-success/20 rounded-full flex items-center justify-center">
               <Wallet className="h-8 w-8 text-success" />
             </div>
             <h3 className="text-lg font-semibold">Rent Payment Successful!</h3>
             <p className="text-muted-foreground">{formatUGX(parseFloat(amount))} paid for {tenantInfo?.full_name}</p>
             <Button onClick={handleClose} className="w-full">Done</Button>
           </div>
         ) : (
           <div className="space-y-4">
             {/* Step 1: Search tenant by name or phone */}
             <div className="space-y-2">
               <Label>Search Tenant (Name or Phone)</Label>
               <div className="flex gap-2">
                 <Input
                   type="text"
                   placeholder="e.g. Kiggundu Akram or 0700..."
                   value={searchQuery}
                   onChange={(e) => { setSearchQuery(e.target.value); setTenantInfo(null); setSearchResults([]); }}
                   disabled={loading}
                   className="h-12 flex-1"
                   onKeyDown={(e) => e.key === 'Enter' && searchTenant()}
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

             {/* Search results list */}
             {searchResults.length > 1 && !tenantInfo && (
               <div className="border rounded-xl divide-y max-h-48 overflow-y-auto">
                 {searchResults.map((t) => (
                   <button
                     key={t.id}
                     onClick={() => selectTenant(t)}
                     className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors touch-manipulation flex items-center gap-3"
                   >
                     <div className="p-1.5 rounded-full bg-primary/10">
                       <User className="h-4 w-4 text-primary" />
                     </div>
                     <div>
                       <p className="font-semibold text-sm">{t.full_name}</p>
                       <p className="text-xs text-muted-foreground">{t.phone}</p>
                     </div>
                   </button>
                 ))}
               </div>
             )}

             {/* Selected tenant */}
             {tenantInfo && (
               <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
                 <div className="flex items-center gap-3">
                   <div className="p-2 rounded-full bg-primary/10">
                     <User className="h-5 w-5 text-primary" />
                   </div>
                   <div className="flex-1">
                     <p className="font-semibold">{tenantInfo.full_name}</p>
                     <p className="text-sm text-muted-foreground">{tenantInfo.phone}</p>
                   </div>
                   <Button size="sm" variant="ghost" onClick={() => { setTenantInfo(null); setTenantRentBalance(null); }} className="text-xs">
                     Change
                   </Button>
                 </div>
                 {tenantRentBalance !== null && tenantRentBalance > 0 && (
                   <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 flex items-center justify-between">
                     <span className="text-xs text-destructive font-medium">Outstanding Rent Balance</span>
                     <span className="font-mono font-bold text-destructive">{formatUGX(tenantRentBalance)}</span>
                   </div>
                 )}
               </div>
             )}

             {/* Step 2: Amount */}
             {tenantInfo && (
               <>
                 <div className="space-y-2">
                   <Label>Amount to Pay (UGX)</Label>
                   <Input
                     type="number"
                     placeholder="e.g. 50000"
                     value={amount}
                     onChange={(e) => setAmount(e.target.value)}
                     disabled={loading}
                     min="1"
                     className="h-12"
                   />
                   {agentBalance !== null && amount && parseFloat(amount) > agentBalance && (
                     <p className="text-xs text-destructive font-medium">⚠️ Amount exceeds your wallet balance</p>
                   )}
                 </div>

                 <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                   💡 This pays rent from your wallet into the tenant's wallet. If they have an active repayment, it'll be auto-deducted.
                 </div>

                 <div className="flex gap-2">
                   <Button variant="outline" onClick={handleClose} className="flex-1 h-12" disabled={loading}>
                     Cancel
                   </Button>
                   <Button 
                     onClick={handleTopUp} 
                     className="flex-1 h-12" 
                     disabled={loading || !amount || (agentBalance !== null && parseFloat(amount) > agentBalance)}
                   >
                     {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pay ${amount ? formatUGX(parseFloat(amount) || 0) : ''}`}
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

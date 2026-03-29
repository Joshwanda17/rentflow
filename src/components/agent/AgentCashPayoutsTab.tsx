import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { Banknote, QrCode, Search, CheckCircle2, Loader2, Building2, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function AgentCashPayoutsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [payoutCode, setPayoutCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifiedPayout, setVerifiedPayout] = useState<any>(null);

  // Check if this agent is a cashout agent
  const { data: isCashoutAgent } = useQuery({
    queryKey: ['is-cashout-agent', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('cashout_agents')
        .select('*')
        .eq('agent_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Pending cash withdrawal requests (with payout codes)
  const { data: cashPayouts = [], isLoading: loadingCash } = useQuery({
    queryKey: ['agent-cash-payouts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payout_codes')
        .select('*, profiles:user_id(full_name, phone), withdrawal_requests:withdrawal_request_id(amount, payout_method, agent_location, status)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!isCashoutAgent,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  // Pending bank withdrawal requests
  const { data: bankPayouts = [], isLoading: loadingBank } = useQuery({
    queryKey: ['agent-bank-payouts'],
    queryFn: async () => {
      if (!isCashoutAgent?.handles_bank) return [];
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*, profiles:user_id(full_name, phone)')
        .eq('payout_method', 'bank_transfer')
        .in('status', ['manager_approved', 'cfo_approved'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!isCashoutAgent?.handles_bank,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  // Verify payout code
  const handleVerify = async () => {
    if (!payoutCode.trim()) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase
        .from('payout_codes')
        .select('*, profiles:user_id(full_name, phone)')
        .eq('code', payoutCode.trim().toUpperCase())
        .eq('status', 'pending')
        .maybeSingle();
      
      if (error) throw error;
      if (!data) {
        toast.error('Invalid or expired payout code');
        setVerifiedPayout(null);
        return;
      }
      
      // Check expiry
      if (new Date(data.expires_at) < new Date()) {
        toast.error('This payout code has expired');
        setVerifiedPayout(null);
        return;
      }
      
      setVerifiedPayout(data);
      toast.success('Payout code verified! ✅');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setVerifying(false);
    }
  };

  // Complete payout
  const completePayout = useMutation({
    mutationFn: async (codeId: string) => {
      const { error } = await supabase
        .from('payout_codes')
        .update({
          status: 'paid',
          paid_by: user!.id,
          paid_at: new Date().toISOString(),
        })
        .eq('id', codeId);
      if (error) throw error;
      
      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: user!.id,
        action_type: 'cash_payout_completed',
        metadata: { payout_code_id: codeId, code: verifiedPayout?.code },
      });
    },
    onSuccess: () => {
      toast.success('Cash payout completed! 💰');
      setVerifiedPayout(null);
      setPayoutCode('');
      qc.invalidateQueries({ queryKey: ['agent-cash-payouts'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Complete bank payout
  const completeBankPayout = useMutation({
    mutationFn: async ({ id, reference }: { id: string; reference: string }) => {
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'completed',
          payout_proof: reference,
          payout_proof_type: 'bank_reference',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      
      await supabase.from('audit_logs').insert({
        user_id: user!.id,
        action_type: 'bank_payout_completed',
        metadata: { withdrawal_id: id, reference },
      });
    },
    onSuccess: () => {
      toast.success('Bank payout recorded! 🏦');
      qc.invalidateQueries({ queryKey: ['agent-bank-payouts'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isCashoutAgent) {
    return null; // Not a cashout agent, don't show this tab
  }

  return (
    <div className="space-y-4">
      {/* Payout Code Verification - PRIMARY ACTION */}
      <Card className="border-2 border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            Verify Payout Code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Enter WPO-XXXXX code..."
              value={payoutCode}
              onChange={e => setPayoutCode(e.target.value.toUpperCase())}
              className="text-lg font-mono tracking-wider h-12 text-center"
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
            />
            <Button onClick={handleVerify} disabled={verifying || !payoutCode.trim()} className="h-12 px-6">
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {verifiedPayout && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-bold text-green-700">Code Verified</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Name</p>
                    <p className="font-medium">{verifiedPayout.profiles?.full_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Phone</p>
                    <p className="font-medium">{verifiedPayout.profiles?.phone}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Amount</p>
                    <p className="font-bold text-lg text-primary">{formatUGX(verifiedPayout.amount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Expires</p>
                    <p className="font-medium">{format(new Date(verifiedPayout.expires_at), 'MMM d, HH:mm')}</p>
                  </div>
                </div>
                <Button
                  className="w-full h-12 text-base font-bold"
                  onClick={() => completePayout.mutate(verifiedPayout.id)}
                  disabled={completePayout.isPending}
                >
                  {completePayout.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Banknote className="h-5 w-5 mr-2" />}
                  Confirm Cash Paid — {formatUGX(verifiedPayout.amount)}
                </Button>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="cash">
        <TabsList className="w-full">
          <TabsTrigger value="cash" className="flex-1 gap-1">
            <Banknote className="h-3.5 w-3.5" /> Cash
            {cashPayouts.length > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{cashPayouts.length}</Badge>}
          </TabsTrigger>
          {isCashoutAgent.handles_bank && (
            <TabsTrigger value="bank" className="flex-1 gap-1">
              <Building2 className="h-3.5 w-3.5" /> Bank
              {bankPayouts.length > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{bankPayouts.length}</Badge>}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="cash" className="space-y-2 mt-3">
          {loadingCash ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : cashPayouts.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              No pending cash payouts
            </CardContent></Card>
          ) : (
            cashPayouts.map((p: any) => (
              <Card key={p.id} className="border-l-4 border-l-orange-500">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{p.profiles?.full_name}</p>
                      <p className="text-xs text-muted-foreground">{p.profiles?.phone}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{formatUGX(p.amount)}</p>
                      <Badge variant="outline" className="text-[9px] font-mono">{p.code}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Expires {format(new Date(p.expires_at), 'MMM d, HH:mm')}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="bank" className="space-y-2 mt-3">
          {loadingBank ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : bankPayouts.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              No pending bank payouts
            </CardContent></Card>
          ) : (
            bankPayouts.map((w: any) => (
              <BankPayoutCard key={w.id} withdrawal={w} onComplete={completeBankPayout.mutate} isPending={completeBankPayout.isPending} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BankPayoutCard({ withdrawal, onComplete, isPending }: { withdrawal: any; onComplete: (data: { id: string; reference: string }) => void; isPending: boolean }) {
  const [reference, setReference] = useState('');

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">{withdrawal.profiles?.full_name}</p>
            <p className="text-xs text-muted-foreground">{withdrawal.profiles?.phone}</p>
          </div>
          <p className="font-bold text-primary">{formatUGX(withdrawal.amount)}</p>
        </div>
        <div className="text-xs space-y-0.5">
          <p><span className="text-muted-foreground">Bank:</span> {withdrawal.bank_name}</p>
          <p><span className="text-muted-foreground">Account:</span> {withdrawal.bank_account_number}</p>
          <p><span className="text-muted-foreground">Name:</span> {withdrawal.bank_account_name}</p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Bank reference..."
            value={reference}
            onChange={e => setReference(e.target.value)}
            className="text-xs h-8"
          />
          <Button
            size="sm"
            className="h-8"
            disabled={!reference.trim() || isPending}
            onClick={() => onComplete({ id: withdrawal.id, reference })}
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

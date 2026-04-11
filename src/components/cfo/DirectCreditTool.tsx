import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { UserSearchPicker } from './UserSearchPicker';
import { TreasuryImpactBanner } from './TreasuryImpactBanner';

type Operation = 'credit' | 'debit';

export function DirectCreditTool() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [operation, setOperation] = useState<Operation>('credit');

  const mutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) throw new Error('Invalid amount');
      if (!reason || reason.length < 10) throw new Error('Reason must be at least 10 characters');
      if (!selectedUser) throw new Error('Select a user');

      const { data, error } = await supabase.functions.invoke('cfo-direct-credit', {
        body: { target_user_id: selectedUser.id, amount: amt, reason, operation },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({ title: operation === 'credit' ? '✅ Credit applied' : '✅ Debit applied', description: data?.message });
      qc.invalidateQueries({ queryKey: ['expense-transfers'] });
      qc.invalidateQueries({ queryKey: ['channel-balances'] });
      setSelectedUser(null);
      setAmount('');
      setReason('');
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const isCredit = operation === 'credit';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {isCredit ? <ArrowUpRight className="h-4 w-4 text-green-600" /> : <ArrowDownLeft className="h-4 w-4 text-destructive" />}
          CFO Wallet Adjustment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Operation Toggle */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={isCredit ? 'default' : 'outline'}
            className={isCredit ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
            onClick={() => setOperation('credit')}
          >
            <ArrowUpRight className="h-4 w-4 mr-1.5" />
            Platform → Wallet
          </Button>
          <Button
            type="button"
            variant={!isCredit ? 'default' : 'outline'}
            className={!isCredit ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : ''}
            onClick={() => setOperation('debit')}
          >
            <ArrowDownLeft className="h-4 w-4 mr-1.5" />
            Wallet → Platform
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {isCredit
            ? 'Credit funds from the platform into a user\'s wallet (expenses, salaries, advances).'
            : 'Debit funds from a user\'s wallet back to the platform (corrections, clawbacks, refunds).'}
        </p>

        <UserSearchPicker
          label="Search User"
          placeholder="Name or phone..."
          selectedUser={selectedUser}
          onSelect={setSelectedUser}
        />

        <div>
          <Label>Amount (UGX)</Label>
          <Input type="number" placeholder="50000" value={amount} onChange={e => setAmount(e.target.value)} />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[10000, 50000, 100000, 200000, 500000].map(v => (
              <Button key={v} size="sm" variant="outline" className="text-xs h-7" onClick={() => setAmount(String(v))}>
                {(v / 1000).toFixed(0)}K
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label>Reason (min 10 chars)</Label>
          <Textarea
            placeholder={isCredit
              ? 'e.g. Salary advance for March, transport reimbursement...'
              : 'e.g. Correction for duplicate credit, clawback of overpayment...'}
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
          />
          <p className="text-[10px] text-muted-foreground mt-1">{reason.length}/10 characters minimum</p>
        </div>

        {/* Treasury Impact - shows automatically when amount is entered */}
        {parseFloat(amount || '0') > 0 && isCredit && (
          <TreasuryImpactBanner payoutAmount={parseFloat(amount || '0')} />
        )}

        <Button
          className={`w-full ${isCredit ? 'bg-green-600 hover:bg-green-700' : 'bg-destructive hover:bg-destructive/90'}`}
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !selectedUser || !amount || reason.length < 10}
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          {isCredit ? 'Credit' : 'Debit'} UGX {parseFloat(amount || '0').toLocaleString()} {isCredit ? 'to' : 'from'} {selectedUser?.full_name || '...'}
        </Button>
      </CardContent>
    </Card>
  );
}

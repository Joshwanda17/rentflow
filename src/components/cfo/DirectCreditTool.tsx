import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, CreditCard } from 'lucide-react';
import { UserSearchPicker } from './UserSearchPicker';

export function DirectCreditTool() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const creditMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) throw new Error('Invalid amount');
      if (!reason || reason.length < 10) throw new Error('Reason must be at least 10 characters');
      if (!selectedUser) throw new Error('Select a user');

      const { data, error } = await supabase.functions.invoke('cfo-direct-credit', {
        body: {
          target_user_id: selectedUser.id,
          amount: amt,
          reason,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({ title: '✅ Credit applied', description: `UGX ${parseFloat(amount).toLocaleString()} credited to ${selectedUser?.full_name}` });
      qc.invalidateQueries({ queryKey: ['expense-transfers'] });
      setSelectedUser(null);
      setAmount('');
      setReason('');
    },
    onError: (e: any) => toast({ title: 'Credit failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          Direct Wallet Credit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <UserSearchPicker
          label="Search User (Agent or Employee)"
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
            placeholder="e.g. Salary advance for March, transport reimbursement..."
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
          />
          <p className="text-[10px] text-muted-foreground mt-1">{reason.length}/10 characters minimum</p>
        </div>
        <Button
          className="w-full"
          onClick={() => creditMutation.mutate()}
          disabled={creditMutation.isPending || !selectedUser || !amount || reason.length < 10}
        >
          {creditMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Credit UGX {parseFloat(amount || '0').toLocaleString()} to {selectedUser?.full_name || '...'}
        </Button>
      </CardContent>
    </Card>
  );
}

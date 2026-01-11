import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plus, 
  Receipt, 
  Phone, 
  RefreshCw, 
  CheckCircle, 
  Loader2,
  Link2,
  Clock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface RecordedTransaction {
  id: string;
  payment_partner: string;
  transaction_id: string;
  amount: number;
  sender_phone: string | null;
  notes: string | null;
  matched: boolean;
  matched_at: string | null;
  created_at: string;
}

export default function RecordMerchantPayment() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<RecordedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [partner, setPartner] = useState<'mtn' | 'airtel'>('mtn');
  const [transactionId, setTransactionId] = useState('');
  const [amount, setAmount] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [notes, setNotes] = useState('');

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('manager_recorded_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Failed to load recorded transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !transactionId || !amount) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      // Check if transaction ID already exists
      const { data: existing } = await supabase
        .from('manager_recorded_transactions')
        .select('id')
        .ilike('transaction_id', transactionId.trim())
        .eq('payment_partner', partner)
        .single();

      if (existing) {
        toast.error('This transaction ID has already been recorded');
        setIsSubmitting(false);
        return;
      }

      // Insert the new transaction
      const { data: newTx, error } = await supabase
        .from('manager_recorded_transactions')
        .insert({
          recorded_by: user.id,
          payment_partner: partner,
          transaction_id: transactionId.trim(),
          amount: parseFloat(amount),
          sender_phone: senderPhone || null,
          notes: notes || null
        })
        .select()
        .single();

      if (error) throw error;

      // Try to auto-match with pending payment confirmations
      const { data: matchingConfirmation } = await supabase
        .from('payment_confirmations')
        .select('id, user_id, amount')
        .ilike('transaction_id', transactionId.trim())
        .eq('payment_partner', partner)
        .eq('status', 'pending')
        .single();

      if (matchingConfirmation) {
        // Auto-approve the confirmation
        await supabase
          .from('payment_confirmations')
          .update({
            status: 'approved',
            admin_note: 'Auto-verified: Transaction ID matched manager records',
            processed_by: user.id,
            processed_at: new Date().toISOString()
          })
          .eq('id', matchingConfirmation.id);

        // Mark the recorded transaction as matched
        await supabase
          .from('manager_recorded_transactions')
          .update({
            matched: true,
            matched_confirmation_id: matchingConfirmation.id,
            matched_at: new Date().toISOString()
          })
          .eq('id', newTx.id);

        // Credit user's wallet
        const { data: walletData } = await supabase
          .from('wallets')
          .select('balance')
          .eq('user_id', matchingConfirmation.user_id)
          .single();

        if (walletData) {
          await supabase
            .from('wallets')
            .update({ balance: walletData.balance + matchingConfirmation.amount })
            .eq('user_id', matchingConfirmation.user_id);
        }

        // Notify user
        await supabase.from('notifications').insert({
          user_id: matchingConfirmation.user_id,
          title: '✅ Payment Auto-Verified!',
          message: `Your payment of UGX ${matchingConfirmation.amount.toLocaleString()} has been automatically verified and added to your wallet.`,
          type: 'success'
        });

        toast.success('Transaction recorded & auto-matched with pending confirmation!');
      } else {
        toast.success('Transaction recorded successfully');
      }

      // Reset form
      setTransactionId('');
      setAmount('');
      setSenderPhone('');
      setNotes('');
      setShowForm(false);
      fetchTransactions();

    } catch (error: any) {
      console.error('Error recording transaction:', error);
      toast.error(error.message || 'Failed to record transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPartnerBadge = (p: string) => {
    if (p === 'mtn') {
      return <Badge className="bg-[#FFCC00] text-black">MTN</Badge>;
    }
    return <Badge className="bg-[#ED1C24] text-white">Airtel</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary" />
          Record Merchant Payments
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchTransactions}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 mr-1" />
            Record
          </Button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Merchant Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Partner Selection */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={partner === 'mtn' ? 'default' : 'outline'}
                  className={cn(
                    'flex-1',
                    partner === 'mtn' && 'bg-[#FFCC00] hover:bg-[#FFCC00]/90 text-black'
                  )}
                  onClick={() => setPartner('mtn')}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  MTN MoMo
                </Button>
                <Button
                  type="button"
                  variant={partner === 'airtel' ? 'default' : 'outline'}
                  className={cn(
                    'flex-1',
                    partner === 'airtel' && 'bg-[#ED1C24] hover:bg-[#ED1C24]/90 text-white'
                  )}
                  onClick={() => setPartner('airtel')}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Airtel
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="txId">Transaction ID *</Label>
                  <Input
                    id="txId"
                    placeholder="e.g. 12345678901"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amt">Amount (UGX) *</Label>
                  <Input
                    id="amt"
                    type="number"
                    placeholder="e.g. 50000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    min="1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Sender Phone (optional)</Label>
                <Input
                  id="phone"
                  placeholder="e.g. 0771234567"
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !transactionId || !amount}
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Save
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Transactions List */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm text-muted-foreground">
            Recent Recorded Transactions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            <div className="divide-y">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3 flex gap-3">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))
              ) : transactions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>No recorded transactions yet</p>
                </div>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} className="p-3 flex items-center gap-3">
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center',
                      tx.payment_partner === 'mtn' ? 'bg-[#FFCC00]' : 'bg-[#ED1C24]'
                    )}>
                      <Phone className={cn(
                        'w-5 h-5',
                        tx.payment_partner === 'mtn' ? 'text-black' : 'text-white'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm truncate">{tx.transaction_id}</span>
                        {getPartnerBadge(tx.payment_partner)}
                        {tx.matched && (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                            <Link2 className="w-3 h-3 mr-1" />
                            Matched
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(tx.created_at), 'MMM d, h:mm a')}
                        {tx.sender_phone && (
                          <>
                            <span>•</span>
                            <span>{tx.sender_phone}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">UGX {tx.amount.toLocaleString()}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

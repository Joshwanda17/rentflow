import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, HandCoins } from 'lucide-react';

interface RequestMoneyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RequestMoneyDialog({ open, onOpenChange, onSuccess }: RequestMoneyDialogProps) {
  const { user } = useAuth();
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('Not authenticated');
      return;
    }

    const amountNum = parseFloat(amount);
    if (!phone || isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter valid phone number and amount');
      return;
    }

    setLoading(true);

    // Find recipient by phone
    const { data: recipientProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('phone', phone)
      .maybeSingle();

    if (profileError || !recipientProfile) {
      toast.error('User not found with this phone number');
      setLoading(false);
      return;
    }

    if (recipientProfile.id === user.id) {
      toast.error('Cannot request money from yourself');
      setLoading(false);
      return;
    }

    // Create money request
    const { error } = await supabase
      .from('money_requests')
      .insert({
        requester_id: user.id,
        recipient_id: recipientProfile.id,
        amount: amountNum,
        description: description || `Money request from ${user.user_metadata?.full_name || 'a user'}`,
      });

    setLoading(false);

    if (error) {
      toast.error('Failed to create request');
      return;
    }

    toast.success(`Requested ${formatCurrency(amountNum)} from ${recipientProfile.full_name}`);
    setPhone('');
    setAmount('');
    setDescription('');
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-primary" />
            Request Money
          </DialogTitle>
          <DialogDescription>
            Request money from someone on Welile. They'll need to approve it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Their Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="e.g. 0783673998"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (UGX)</Label>
            <Input
              id="amount"
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Reason (Optional)</Label>
            <Textarea
              id="description"
              placeholder="What's this for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

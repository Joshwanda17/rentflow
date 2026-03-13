import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface CreateLoanProductDialogProps {
  onCreated?: () => void;
}

export function CreateLoanProductDialog({ onCreated }: CreateLoanProductDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: 'Food Shopping Loan',
    description: 'Quick loan for grocery and food shopping at Welile agents. Shop, post receipts, and save up to 70% on rent!',
    min_amount: 50000,
    max_amount: 500000,
    interest_rate: 10,
    min_duration_days: 7,
    max_duration_days: 30,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (form.min_amount >= form.max_amount) {
      toast.error('Maximum amount must be greater than minimum amount');
      return;
    }

    if (form.min_duration_days >= form.max_duration_days) {
      toast.error('Maximum duration must be greater than minimum duration');
      return;
    }

    setLoading(true);
    try {
      // loan_products table removed
      toast.error('Rent plans feature is currently unavailable');
      setLoading(false);
      return;

      toast.success('Food Shopping Loan created successfully!');
      setOpen(false);
      setForm({
        title: 'Food Shopping Loan',
        description: 'Quick loan for grocery and food shopping at Welile agents. Shop, post receipts, and save up to 70% on rent!',
        min_amount: 50000,
        max_amount: 500000,
        interest_rate: 10,
        min_duration_days: 7,
        max_duration_days: 30,
      });
      onCreated?.();
    } catch (error: any) {
      console.error('Create error:', error);
      toast.error(error.message || 'Failed to create rent plan');
    } finally {
      setLoading(false);
    }
  };

  // Calculate example repayment
  const exampleAmount = (form.min_amount + form.max_amount) / 2;
  const exampleInterest = (exampleAmount * form.interest_rate) / 100;
  const exampleTotal = exampleAmount + exampleInterest;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Create Food Loan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Food Shopping Loan</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Loan Title *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Food Shopping Loan"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe your food shopping loan..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min_amount">Min Amount (UGX)</Label>
              <Input
                id="min_amount"
                type="number"
                value={form.min_amount}
                onChange={(e) => setForm({ ...form, min_amount: Number(e.target.value) })}
                min={1000}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_amount">Max Amount (UGX)</Label>
              <Input
                id="max_amount"
                type="number"
                value={form.max_amount}
                onChange={(e) => setForm({ ...form, max_amount: Number(e.target.value) })}
                min={1000}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="interest_rate">Interest Rate (%)</Label>
            <Input
              id="interest_rate"
              type="number"
              value={form.interest_rate}
              onChange={(e) => setForm({ ...form, interest_rate: Number(e.target.value) })}
              min={0}
              max={100}
              step={0.5}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min_duration">Min Duration (days)</Label>
              <Input
                id="min_duration"
                type="number"
                value={form.min_duration_days}
                onChange={(e) => setForm({ ...form, min_duration_days: Number(e.target.value) })}
                min={1}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_duration">Max Duration (days)</Label>
              <Input
                id="max_duration"
                type="number"
                value={form.max_duration_days}
                onChange={(e) => setForm({ ...form, max_duration_days: Number(e.target.value) })}
                min={1}
                required
              />
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="font-medium text-sm">Example Calculation</p>
            <p className="text-xs text-muted-foreground">
              For a loan of UGX {exampleAmount.toLocaleString()}:
            </p>
            <div className="flex justify-between text-sm">
              <span>Interest ({form.interest_rate}%)</span>
              <span>UGX {exampleInterest.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span>Total Repayment</span>
              <span>UGX {exampleTotal.toLocaleString()}</span>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating...' : 'Create Rent Plan'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

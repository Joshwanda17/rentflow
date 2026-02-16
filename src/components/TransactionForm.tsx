import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Transaction, 
  TransactionDirection, 
  TransactionCategory,
  LinkedParty,
  CASH_IN_CATEGORIES,
  CASH_OUT_CATEGORIES,
  LINKED_PARTIES
} from '@/types/financial';
import { Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { validateFormPayload, GENERAL_LEDGER_CONTRACT } from '@/lib/formContracts';

interface TransactionFormProps {
  onSubmit: (transaction: Omit<Transaction, 'id'>) => void;
}

export function TransactionForm({ onSubmit }: TransactionFormProps) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<TransactionDirection>('cash_in');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<TransactionCategory | ''>('');
  const [linkedParty, setLinkedParty] = useState<LinkedParty | ''>('');
  const [referenceId, setReferenceId] = useState('');
  const [description, setDescription] = useState('');

  const categories = direction === 'cash_in' ? CASH_IN_CATEGORIES : CASH_OUT_CATEGORIES;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!amount || !category || !linkedParty || !referenceId) {
      toast.error('Please fill in all required fields');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      toast.error('Amount must be a valid number');
      return;
    }

    // Contract-driven validation for ledger entries
    const ledgerPayload = {
      amount: parsedAmount,
      direction,
      category: category as string,
      linked_party: linkedParty as string,
      reference_id: referenceId,
      description: description || null,
      source_table: 'manual',
    };
    const validation = validateFormPayload(GENERAL_LEDGER_CONTRACT, ledgerPayload as Record<string, unknown>);
    if (!validation.valid) {
      toast.error(validation.errors.map(e => e.message).join('; '));
      return;
    }

    onSubmit({
      date: new Date(),
      amount: parsedAmount,
      direction,
      category: category as TransactionCategory,
      linkedParty: linkedParty as LinkedParty,
      referenceId,
      description,
    });

    toast.success('Transaction recorded successfully', {
      description: 'All financial statements have been updated.',
    });

    // Reset form
    setAmount('');
    setCategory('');
    setLinkedParty('');
    setReferenceId('');
    setDescription('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Transaction
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Record Transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-4">
          {/* Direction Toggle */}
          <div className="space-y-2">
            <Label>Transaction Type</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setDirection('cash_in');
                  setCategory('');
                }}
                className={cn(
                  "flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all",
                  direction === 'cash_in'
                    ? "border-success bg-success/10 text-success"
                    : "border-border hover:border-muted-foreground"
                )}
              >
                <ArrowDownLeft className="h-5 w-5" />
                <span className="font-medium">Cash In</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirection('cash_out');
                  setCategory('');
                }}
                className={cn(
                  "flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all",
                  direction === 'cash_out'
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-border hover:border-muted-foreground"
                )}
              >
                <ArrowUpRight className="h-5 w-5" />
                <span className="font-medium">Cash Out</span>
              </button>
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (UGX)</Label>
            <Input
              id="amount"
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="font-mono text-lg"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TransactionCategory)}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Linked Party */}
          <div className="space-y-2">
            <Label>Linked Party</Label>
            <Select value={linkedParty} onValueChange={(v) => setLinkedParty(v as LinkedParty)}>
              <SelectTrigger>
                <SelectValue placeholder="Select party" />
              </SelectTrigger>
              <SelectContent>
                {LINKED_PARTIES.map((party) => (
                  <SelectItem key={party.value} value={party.value}>
                    {party.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reference ID */}
          <div className="space-y-2">
            <Label htmlFor="reference">Reference ID</Label>
            <Input
              id="reference"
              placeholder="e.g., TXN-2024-001"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input
              id="description"
              placeholder="Add notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full">
            Record Transaction
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Banknote, Loader2, CheckCircle2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { motion, AnimatePresence } from 'framer-motion';

interface PropertyInfo {
  id: string;
  name: string;
  phone: string;
  mobile_money_number: string | null;
  property_address: string;
  monthly_rent: number | null;
}

interface AgentLandlordPayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: PropertyInfo | null;
  onSuccess?: () => void;
}

export function AgentLandlordPayoutDialog({ open, onOpenChange, property, onSuccess }: AgentLandlordPayoutDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setAmount(''); setProvider(''); setNotes(''); setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !property) return;

    if (!amount.trim() || parseInt(amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!provider) {
      toast.error('Select mobile money provider');
      return;
    }

    setLoading(true);
    try {
      const paidAmount = parseFloat(amount);

      // Reduce rent balance on the landlord record
      const { error } = await supabase.rpc('record_rent_payment', {
        p_landlord_id: property.id,
        p_amount: paidAmount,
      });

      if (error) throw error;

      setSuccess(true);
      toast.success(`Rent balance reduced by ${formatUGX(paidAmount)} for ${property.name}`);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || 'An unexpected error occurred');
    }
    setLoading(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) resetForm();
    onOpenChange(newOpen);
  };

  if (!property) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-success" />
            Request Landlord Payout
          </DialogTitle>
          <DialogDescription>
            Request payment to {property.name} for {property.property_address}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="py-8 text-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/20 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </motion.div>
              <h3 className="text-lg font-semibold mb-2">Request Submitted!</h3>
              <p className="text-muted-foreground text-sm mb-4">
                A manager will process the payout of {formatUGX(parseInt(amount))} to {property.name}.
              </p>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </motion.div>
          ) : (
            <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleSubmit} className="space-y-4">
              {/* Landlord info */}
              <div className="p-3 rounded-lg bg-muted/50 text-xs space-y-1">
                <p><span className="text-muted-foreground">Landlord:</span> <span className="font-medium">{property.name}</span></p>
                <p className="flex items-center gap-1"><Phone className="h-3 w-3" /> {property.mobile_money_number || property.phone}</p>
                <p><span className="text-muted-foreground">Property:</span> {property.property_address}</p>
                {property.monthly_rent && (
                  <p><span className="text-muted-foreground">Monthly Rent:</span> <span className="font-medium text-success">{formatUGX(property.monthly_rent)}</span></p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Amount to Pay (UGX) *</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(property.monthly_rent || 500000)} className="h-10" required />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Mobile Money Provider *</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MTN">MTN Mobile Money</SelectItem>
                    <SelectItem value="Airtel">Airtel Money</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Rent for February 2026" rows={2} />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Banknote className="h-4 w-4 mr-2" />}
                Submit Payout Request
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Search, User } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';

interface RecordTenantPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface TenantOption {
  id: string;
  full_name: string;
  phone: string;
}

export function RecordTenantPaymentDialog({ open, onOpenChange, onSuccess }: RecordTenantPaymentDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantResults, setTenantResults] = useState<TenantOption[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<TenantOption | null>(null);
  const [manualPhone, setManualPhone] = useState('');
  const [searchMode, setSearchMode] = useState<'search' | 'manual'>('search');
  const [searching, setSearching] = useState(false);
  
  const [transactionId, setTransactionId] = useState('');
  const [amount, setAmount] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setTenantSearch('');
      setTenantResults([]);
      setSelectedTenant(null);
      setManualPhone('');
      setTransactionId('');
      setAmount('');
      setMerchantName('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setSearchMode('search');
    }
  }, [open]);

  // Search tenants registered by this agent
  useEffect(() => {
    if (!user || tenantSearch.length < 2 || searchMode !== 'search') {
      setTenantResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        // Search profiles by name or phone for tenants linked to this agent via referrals
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .eq('referrer_id', user.id)
          .or(`full_name.ilike.%${tenantSearch}%,phone.ilike.%${tenantSearch}%`)
          .limit(5);
        
        setTenantResults(data || []);
      } catch (err) {
        console.error('Tenant search error:', err);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [tenantSearch, user, searchMode]);

  const handleSubmit = async () => {
    if (!user) return;
    
    // Validate
    if (!transactionId.trim()) {
      toast({ title: 'Transaction ID is required', variant: 'destructive' });
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    if (!merchantName.trim()) {
      toast({ title: 'Merchant name is required', variant: 'destructive' });
      return;
    }
    if (!selectedTenant && !manualPhone.trim()) {
      toast({ title: 'Select a tenant or enter a phone number', variant: 'destructive' });
      return;
    }

    hapticTap();
    setSubmitting(true);

    try {
      const paidAmount = Number(amount);
      const { error } = await supabase
        .from('tenant_merchant_payments')
        .insert({
          agent_id: user.id,
          tenant_id: selectedTenant?.id || null,
          tenant_phone: selectedTenant?.phone || manualPhone.trim(),
          transaction_id: transactionId.trim().toUpperCase(),
          amount: paidAmount,
          merchant_name: merchantName.trim(),
          payment_date: paymentDate,
          notes: notes.trim() || null,
        });

      if (error) throw error;

      // Reduce rent balance on the landlord linked to this tenant
      if (selectedTenant?.id) {
        const { data: landlordRecord } = await supabase
          .from('landlords')
          .select('id')
          .eq('tenant_id', selectedTenant.id)
          .maybeSingle();

        if (landlordRecord?.id) {
          await supabase.rpc('record_rent_payment', {
            p_landlord_id: landlordRecord.id,
            p_amount: paidAmount,
          });
        }
      }

      toast({ title: '✅ Payment recorded successfully' });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error('Record payment error:', err);
      toast({ title: 'Failed to record payment', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Tenant Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Tenant Selection */}
          <div className="space-y-2">
            <Label>Tenant</Label>
            <div className="flex gap-2 mb-2">
              <Button
                type="button"
                size="sm"
                variant={searchMode === 'search' ? 'default' : 'outline'}
                onClick={() => { setSearchMode('search'); setSelectedTenant(null); setManualPhone(''); }}
                className="text-xs"
              >
                <Search className="h-3 w-3 mr-1" />
                Search
              </Button>
              <Button
                type="button"
                size="sm"
                variant={searchMode === 'manual' ? 'default' : 'outline'}
                onClick={() => { setSearchMode('manual'); setSelectedTenant(null); setTenantSearch(''); }}
                className="text-xs"
              >
                <User className="h-3 w-3 mr-1" />
                Enter Phone
              </Button>
            </div>

            {searchMode === 'search' ? (
              <div className="space-y-2">
                {selectedTenant ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/30">
                    <div>
                      <p className="font-medium text-sm">{selectedTenant.full_name}</p>
                      <p className="text-xs text-muted-foreground">{selectedTenant.phone}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedTenant(null)} className="text-xs">
                      Change
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      placeholder="Search by name or phone..."
                      value={tenantSearch}
                      onChange={(e) => setTenantSearch(e.target.value)}
                      style={{ fontSize: '16px' }}
                    />
                    {searching && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Searching...
                      </div>
                    )}
                    {tenantResults.length > 0 && (
                      <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                        {tenantResults.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => { setSelectedTenant(t); setTenantResults([]); setTenantSearch(''); }}
                            className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors touch-manipulation"
                          >
                            <p className="font-medium text-sm">{t.full_name}</p>
                            <p className="text-xs text-muted-foreground">{t.phone}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {tenantSearch.length >= 2 && !searching && tenantResults.length === 0 && (
                      <p className="text-xs text-muted-foreground">No tenants found. Try entering the phone manually.</p>
                    )}
                  </>
                )}
              </div>
            ) : (
              <Input
                placeholder="Enter tenant phone number"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                type="tel"
                style={{ fontSize: '16px' }}
              />
            )}
          </div>

          {/* Transaction ID */}
          <div className="space-y-1.5">
            <Label>Transaction ID</Label>
            <Input
              placeholder="e.g. TXN123456789"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label>Amount (UGX)</Label>
            <Input
              placeholder="e.g. 50000"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Merchant Name */}
          <div className="space-y-1.5">
            <Label>Merchant / Vendor Name</Label>
            <Input
              placeholder="e.g. Shop ABC"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Payment Date */}
          <div className="space-y-1.5">
            <Label>Payment Date</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Any additional details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full"
            style={{ minHeight: '48px' }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Recording...
              </>
            ) : (
              'Record Payment'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

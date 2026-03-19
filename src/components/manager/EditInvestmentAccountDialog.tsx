import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Pencil } from 'lucide-react';
import { UGANDA_BANKS, PAYOUT_METHODS } from '@/lib/ugandaBanks';

interface EditInvestmentAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: {
    id: string;
    portfolio_code: string;
    account_name: string | null;
    investment_amount: number;
    roi_percentage: number;
    status: string;
    investor_id: string | null;
    agent_id: string;
    display_currency: string;
    payment_method: string | null;
    mobile_money_number: string | null;
    mobile_network: string | null;
    bank_name: string | null;
    bank_account_name?: string | null;
    account_number: string | null;
    payout_day: number | null;
  } | null;
  onSuccess: () => void;
}

const CURRENCIES = ['UGX', 'USD', 'KES', 'EUR', 'GBP'];

export function EditInvestmentAccountDialog({ open, onOpenChange, account, onSuccess }: EditInvestmentAccountDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [loadingEmail, setLoadingEmail] = useState(false);

  const [form, setForm] = useState({
    portfolio_code: '',
    account_name: '',
    display_currency: 'UGX',
    payment_method: 'mobile_money',
    mobile_money_number: '',
    mobile_network: '',
    bank_name: '',
    bank_account_name: '',
    account_number: '',
    payout_day: '',
  });

  useEffect(() => {
    if (account && open) {
      setForm({
        portfolio_code: account.portfolio_code || '',
        account_name: account.account_name || '',
        display_currency: account.display_currency || 'UGX',
        payment_method: account.payment_method || 'mobile_money',
        mobile_money_number: account.mobile_money_number || '',
        mobile_network: account.mobile_network || '',
        bank_name: account.bank_name || '',
        bank_account_name: (account as any).bank_account_name || '',
        account_number: account.account_number || '',
        payout_day: account.payout_day ? String(account.payout_day) : '',
      });
      const uid = account.investor_id || account.agent_id;
      if (uid) {
        setLoadingEmail(true);
        supabase.from('profiles').select('email').eq('id', uid).single()
          .then(({ data }) => { setEmail(data?.email || ''); setLoadingEmail(false); });
      }
    }
  }, [account, open]);

  const handleSave = async () => {
    if (!account) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('investor_portfolios').update({
        portfolio_code: form.portfolio_code.trim(),
        account_name: form.account_name.trim() || null,
        display_currency: form.display_currency,
        payment_method: form.payment_method,
        mobile_money_number: form.mobile_money_number.trim() || null,
        mobile_network: form.mobile_network.trim() || null,
        bank_name: form.bank_name.trim() || null,
        bank_account_name: form.bank_account_name.trim() || null,
        account_number: form.account_number.trim() || null,
        payout_day: form.payout_day ? parseInt(form.payout_day) : null,
      } as any).eq('id', account.id);

      if (error) throw error;

      const uid = account.investor_id || account.agent_id;
      if (email.trim() && uid) {
        await supabase.from('profiles').update({ email: email.trim() }).eq('id', uid);
      }

      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'edit_portfolio',
        table_name: 'investor_portfolios',
        record_id: account.id,
        metadata: { changes: form },
      });

      toast({ title: 'Portfolio updated successfully' });
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Edit Portfolio
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Portfolio Code</Label>
              <Input value={form.portfolio_code} onChange={e => set('portfolio_code', e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Portfolio Name</Label>
              <Input value={form.account_name} onChange={e => set('account_name', e.target.value)} placeholder="e.g. Growth Fund" className="h-9" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Display Currency</Label>
              <Select value={form.display_currency} onValueChange={v => set('display_currency', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Payout Day (1-28)</Label>
              <Input type="number" min={1} max={28} value={form.payout_day} onChange={e => set('payout_day', e.target.value)} placeholder="e.g. 15" className="h-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Partner Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="partner@example.com" className="h-9" disabled={loadingEmail} />
          </div>

          {/* ═══ PAYOUT METHOD SECTION ═══ */}
          <div className="border-t pt-4 mt-2">
            <p className="text-xs font-bold text-foreground mb-3 uppercase tracking-wider">💰 Payout Method for This Portfolio</p>
            
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Mode</Label>
              <Select value={form.payment_method} onValueChange={v => set('payment_method', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYOUT_METHODS.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.icon} {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.payment_method === 'mobile_money' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Mobile Number</Label>
                <Input value={form.mobile_money_number} onChange={e => set('mobile_money_number', e.target.value)} placeholder="0770123456" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Network</Label>
                <Select value={form.mobile_network || ''} onValueChange={v => set('mobile_network', v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MTN">MTN</SelectItem>
                    <SelectItem value="Airtel">Airtel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {form.payment_method === 'bank_transfer' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Bank Name</Label>
                <Select value={form.bank_name || ''} onValueChange={v => set('bank_name', v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select bank..." /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {UGANDA_BANKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Account Holder Name</Label>
                  <Input value={form.bank_account_name} onChange={e => set('bank_account_name', e.target.value)} placeholder="e.g. JOHN DOE" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Account Number</Label>
                  <Input value={form.account_number} onChange={e => set('account_number', e.target.value)} placeholder="e.g. 9030012345678" className="h-9" />
                </div>
              </div>
            </div>
          )}

          {form.payment_method === 'cash' && (
            <div className="px-3 py-2 rounded-lg bg-muted/50 border border-border/60">
              <p className="text-xs text-muted-foreground">
                💵 Cash pickup — partner will collect at the office. No account details required.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.portfolio_code.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

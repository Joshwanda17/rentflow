import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Search, User, Loader2, PlusCircle, Sparkles } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UGANDA_BANKS } from '@/lib/ugandaBanks';

interface CreateInvestmentAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  prefillInvestorId?: string | null;
  prefillInvestorName?: string;
}

interface UserResult {
  id: string;
  full_name: string;
  phone: string;
}

export function CreateInvestmentAccountDialog({ open, onOpenChange, onSuccess, prefillInvestorId, prefillInvestorName }: CreateInvestmentAccountDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);

  const [form, setForm] = useState({
    account_name: '',
    investment_amount: '',
    roi_percentage: '20',
    duration_months: '12',
    roi_mode: 'monthly_payout',
    portfolio_pin: '',
    payout_day: '15',
    payment_method: '',
    mobile_network: '',
    mobile_money_number: '',
    bank_name: '',
    bank_account_name: '',
    account_number: '',
  });

  useEffect(() => {
    if (open && prefillInvestorId && prefillInvestorName) {
      setSelectedUser({ id: prefillInvestorId, full_name: prefillInvestorName, phone: '' });
    }
  }, [open, prefillInvestorId, prefillInvestorName]);

  useEffect(() => {
    if (!open) {
      setSelectedUser(prefillInvestorId ? { id: prefillInvestorId, full_name: prefillInvestorName || '', phone: '' } : null);
      setSearchTerm('');
      setUsers([]);
      setForm({
        account_name: '', investment_amount: '', roi_percentage: '20', duration_months: '12',
        roi_mode: 'monthly_payout', portfolio_pin: '', payout_day: '15',
        payment_method: '', mobile_network: '', mobile_money_number: '',
        bank_name: '', bank_account_name: '', account_number: '',
      });
    }
  }, [open]);

  const generatePin = () => {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    setForm(p => ({ ...p, portfolio_pin: pin }));
  };

  useEffect(() => {
    if (open && !form.portfolio_pin) generatePin();
  }, [open]);

  const searchUsers = async (q: string) => {
    setSearchTerm(q);
    if (q.length < 3) { setUsers([]); return; }
    setSearching(true);
    const { data } = await supabase.from('profiles').select('id, full_name, phone')
      .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`).limit(10);
    setUsers(data || []);
    setSearching(false);
  };

  const handleCreate = async () => {
    if (!selectedUser || !form.investment_amount) return;
    const amt = parseFloat(form.investment_amount);
    if (isNaN(amt) || amt < 50000) {
      toast({ title: 'Investment must be at least UGX 50,000', variant: 'destructive' });
      return;
    }
    if (!/^\d{4}$/.test(form.portfolio_pin)) {
      toast({ title: 'Portfolio PIN must be exactly 4 digits', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-investor-portfolio', {
        body: {
          investor_id: selectedUser.id,
          investment_amount: amt,
          duration_months: parseInt(form.duration_months),
          roi_percentage: parseFloat(form.roi_percentage),
          roi_mode: form.roi_mode,
          portfolio_pin: form.portfolio_pin,
          payout_day: parseInt(form.payout_day),
          payment_method: form.payment_method || null,
          mobile_network: form.mobile_network || null,
          mobile_money_number: form.mobile_money_number || null,
          bank_name: form.bank_name || null,
          account_name: form.bank_account_name || form.account_name || null,
          account_number: form.account_number || null,
        },
      });

      if (error) throw new Error(error.message || 'Failed to create portfolio');
      if (data?.error) throw new Error(data.error);

      const code = data?.portfolio?.portfolio_code || '';
      toast({ title: `Portfolio ${code} created — pending approval` });
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Creation failed', description: e.message, variant: 'destructive' });
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
            <PlusCircle className="h-4 w-4 text-primary" />
            New Portfolio Account
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Partner selection */}
          {!selectedUser ? (
            <div className="space-y-2">
              <Label className="text-xs">Select Partner</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={searchTerm} onChange={e => searchUsers(e.target.value)} placeholder="Search by name or phone..." className="pl-9 h-9" autoFocus />
              </div>
              {searching && <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin" /></div>}
              {users.length > 0 && (
                <ScrollArea className="max-h-40 border rounded-lg">
                  {users.map(u => (
                    <button key={u.id} onClick={() => { setSelectedUser(u); setUsers([]); setSearchTerm(''); }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 text-left text-sm">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{u.full_name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{u.phone}</span>
                    </button>
                  ))}
                </ScrollArea>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border p-2.5 bg-muted/30">
              <User className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium flex-1">{selectedUser.full_name}</span>
              {!prefillInvestorId && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedUser(null)}>Change</Button>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Account Name <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={form.account_name} onChange={e => set('account_name', e.target.value)} placeholder="e.g. Premium Fund" className="h-9" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (UGX) *</Label>
              <Input type="number" min={50000} value={form.investment_amount} onChange={e => set('investment_amount', e.target.value)} placeholder="5000000" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ROI %</Label>
              <Input type="number" min={0} max={100} value={form.roi_percentage} onChange={e => set('roi_percentage', e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Duration</Label>
              <Select value={form.duration_months} onValueChange={v => set('duration_months', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 Months</SelectItem>
                  <SelectItem value="6">6 Months</SelectItem>
                  <SelectItem value="12">12 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">ROI Mode</Label>
              <Select value={form.roi_mode} onValueChange={v => set('roi_mode', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly_payout">Monthly Payout</SelectItem>
                  <SelectItem value="monthly_compounding">Compounding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Payout Day</Label>
              <Select value={form.payout_day} onValueChange={v => set('payout_day', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 5, 10, 15, 20, 25, 28].map(d => (
                    <SelectItem key={d} value={String(d)}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Portfolio PIN */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Portfolio PIN (4 digits) *</Label>
              <Button type="button" variant="ghost" size="sm" onClick={generatePin} className="h-6 text-[10px] gap-1">
                <Sparkles className="h-3 w-3" /> Generate
              </Button>
            </div>
            <Input type="text" inputMode="numeric" maxLength={4} placeholder="e.g. 1234" value={form.portfolio_pin}
              onChange={e => set('portfolio_pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="h-9 font-mono tracking-widest" />
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <Label className="text-xs">Payment Method <span className="text-muted-foreground">(optional)</span></Label>
            <Select value={form.payment_method} onValueChange={v => set('payment_method', v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select payout method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mobile_money">📱 Mobile Money</SelectItem>
                <SelectItem value="bank">🏦 Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.payment_method === 'mobile_money' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Network</Label>
                <Select value={form.mobile_network} onValueChange={v => set('mobile_network', v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mtn">MTN</SelectItem>
                    <SelectItem value="airtel">Airtel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">MoMo Number</Label>
                <Input value={form.mobile_money_number} onChange={e => set('mobile_money_number', e.target.value)} placeholder="0770000000" className="h-9" inputMode="tel" />
              </div>
            </div>
          )}

          {form.payment_method === 'bank' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Bank</Label>
                <Select value={form.bank_name} onValueChange={v => set('bank_name', v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select bank" /></SelectTrigger>
                  <SelectContent>
                    {UGANDA_BANKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Account Name</Label>
                  <Input value={form.bank_account_name} onChange={e => set('bank_account_name', e.target.value)} placeholder="Account holder" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Account Number</Label>
                  <Input value={form.account_number} onChange={e => set('account_number', e.target.value)} placeholder="0123456789" className="h-9" />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !selectedUser || !form.investment_amount || !/^\d{4}$/.test(form.portfolio_pin)}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Create Portfolio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

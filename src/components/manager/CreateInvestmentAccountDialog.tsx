import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Search, User, Loader2, PlusCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

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

const CURRENCIES = ['UGX', 'USD', 'KES', 'EUR', 'GBP'];

export function CreateInvestmentAccountDialog({ open, onOpenChange, onSuccess, prefillInvestorId, prefillInvestorName }: CreateInvestmentAccountDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);

  const [form, setForm] = useState({
    portfolio_code: '',
    account_name: '',
    investment_amount: '',
    roi_percentage: '15',
    duration_months: '12',
    display_currency: 'UGX',
    roi_mode: 'simple',
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
      setForm({ portfolio_code: '', account_name: '', investment_amount: '', roi_percentage: '15', duration_months: '12', display_currency: 'UGX', roi_mode: 'simple' });
    }
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
    if (!selectedUser || !form.portfolio_code.trim() || !form.investment_amount) return;
    const amt = parseFloat(form.investment_amount);
    if (isNaN(amt) || amt <= 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }

    setSaving(true);
    try {
      const pin = String(Math.floor(1000 + Math.random() * 9000));
      const token = crypto.randomUUID().slice(0, 8).toUpperCase();

      const { error } = await supabase.from('investor_portfolios').insert({
        investor_id: selectedUser.id,
        agent_id: user!.id,
        portfolio_code: form.portfolio_code.trim(),
        account_name: form.account_name.trim() || null,
        investment_amount: amt,
        roi_percentage: parseFloat(form.roi_percentage),
        duration_months: parseInt(form.duration_months),
        display_currency: form.display_currency,
        roi_mode: form.roi_mode,
        portfolio_pin: pin,
        activation_token: token,
        status: 'pending_approval',
      });

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'create_portfolio',
        table_name: 'investor_portfolios',
        metadata: { investor_id: selectedUser.id, amount: amt, code: form.portfolio_code },
      });

      toast({ title: 'Portfolio created — pending approval' });
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Portfolio Code</Label>
              <Input value={form.portfolio_code} onChange={e => set('portfolio_code', e.target.value)} placeholder="e.g. WEL-2024-001" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Account Name</Label>
              <Input value={form.account_name} onChange={e => set('account_name', e.target.value)} placeholder="e.g. Premium Fund" className="h-9" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (UGX)</Label>
              <Input type="number" min={1} value={form.investment_amount} onChange={e => set('investment_amount', e.target.value)} placeholder="5000000" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ROI %</Label>
              <Input type="number" min={0} max={100} value={form.roi_percentage} onChange={e => set('roi_percentage', e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Months</Label>
              <Input type="number" min={1} value={form.duration_months} onChange={e => set('duration_months', e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <Select value={form.display_currency} onValueChange={v => set('display_currency', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ROI Mode</Label>
              <Select value={form.roi_mode} onValueChange={v => set('roi_mode', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple</SelectItem>
                  <SelectItem value="monthly_compounding">Compounding</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !selectedUser || !form.portfolio_code.trim() || !form.investment_amount}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Create Portfolio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

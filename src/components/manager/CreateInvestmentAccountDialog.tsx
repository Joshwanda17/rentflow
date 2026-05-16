import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Search, User, Loader2, PlusCircle, Sparkles, Wallet } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UGANDA_BANKS } from '@/lib/ugandaBanks';
import { useFunderApprovalStatus } from '@/hooks/useFunderApprovalStatus';
import { Shield, Lock } from 'lucide-react';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';

interface CreateInvestmentAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Fired when create fails so callers (e.g. NewPartnersPanel) can surface
   *  their own inline error toast with partner context. */
  onError?: (message: string) => void;
  prefillInvestorId?: string | null;
  prefillInvestorName?: string;
}

interface UserResult {
  id: string;
  full_name: string;
  phone: string;
}

export function CreateInvestmentAccountDialog({ open, onOpenChange, onSuccess, onError, prefillInvestorId, prefillInvestorName }: CreateInvestmentAccountDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const { status: approvalStatus, isApproved, isLoading: approvalLoading } =
    useFunderApprovalStatus(selectedUser?.id);

  const [partnerBalance, setPartnerBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [form, setForm] = useState({
    account_name: '',
    investment_amount: '',
    roi_percentage: '20',
    duration_months: '12',
    roi_mode: 'monthly_payout',
    portfolio_pin: '',
    payout_day: '15',
    contribution_date: new Date().toISOString().slice(0, 10),
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
        contribution_date: new Date().toISOString().slice(0, 10),
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

  // Fetch the selected partner's withdrawable wallet balance — money for the
  // portfolio MUST come from this balance, not from manual input.
  useEffect(() => {
    let cancelled = false;
    if (!selectedUser) {
      setPartnerBalance(null);
      return;
    }
    setBalanceLoading(true);
    setPartnerBalance(null);
    (async () => {
      // Portfolios are funded from the partner's TOTAL wallet (withdrawable +
      // float). Partner deposits land in `float_balance`, so the strict
      // withdrawable RPC would always show 0. The backend
      // (`create-investor-portfolio`, instant-deduct path) gates on
      // `wallets.balance`, so mirror that here.
      const { data, error } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', selectedUser.id)
        .maybeSingle();
      if (cancelled) return;
      const bal = !error && data ? Number(data.balance) || 0 : 0;
      setPartnerBalance(bal);
      // Default the amount to the full available balance (capped at sane max).
      setForm(p => ({
        ...p,
        investment_amount: bal > 0 ? String(Math.floor(bal)) : '',
      }));
      setBalanceLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedUser?.id]);

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
    if (!isApproved) {
      toast({
        title: 'Partner not approved',
        description: 'This funder must be approved in Partner Onboarding before a portfolio can be created.',
        variant: 'destructive',
      });
      return;
    }
    const amt = parseFloat(form.investment_amount);
    if (isNaN(amt) || amt < 50000) {
      toast({ title: 'Investment must be at least UGX 50,000', variant: 'destructive' });
      return;
    }
    if (partnerBalance === null) {
      toast({ title: 'Partner wallet balance not loaded yet', variant: 'destructive' });
      return;
    }
    if (amt > partnerBalance) {
      toast({
        title: 'Insufficient partner wallet balance',
        description: `${selectedUser.full_name} has UGX ${partnerBalance.toLocaleString()} available. Top up the partner wallet first.`,
        variant: 'destructive',
      });
      return;
    }
    if (!/^\d{4}$/.test(form.portfolio_pin)) {
      toast({ title: 'Portfolio PIN must be exactly 4 digits', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const response = await supabase.functions.invoke('create-investor-portfolio', {
        body: {
          investor_id: selectedUser.id,
          investment_amount: amt,
          duration_months: parseInt(form.duration_months),
          roi_percentage: parseFloat(form.roi_percentage),
          roi_mode: form.roi_mode,
          portfolio_pin: form.portfolio_pin,
          payout_day: parseInt(form.payout_day),
          contribution_date: form.contribution_date || null,
          payment_method: form.payment_method || null,
          mobile_network: form.mobile_network || null,
          mobile_money_number: form.mobile_money_number || null,
          bank_name: form.bank_name || null,
          account_name: form.bank_account_name || form.account_name || null,
          account_number: form.account_number || null,
        },
      });

      if (response.error || response.data?.error) {
        // Surfaces the real backend message (e.g. "Insufficient ledger
        // balance … Available: 0, Required: 60000") instead of the generic
        // "Edge Function returned a non-2xx status code".
        const msg = await extractEdgeFunctionError(response, 'Failed to create portfolio');
        throw new Error(msg);
      }
      const data = response.data;

      const code = data?.portfolio?.portfolio_code || '';
      toast({ title: `Portfolio ${code} created — pending approval` });
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Creation failed', description: e.message, variant: 'destructive' });
      onError?.(e?.message || 'Failed to create portfolio');
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

          {selectedUser && !approvalLoading && !isApproved && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 flex items-start gap-2">
              <Shield className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold text-warning">
                  {approvalStatus === 'rejected' ? 'Partner rejected' : 'Partner not yet approved'}
                </p>
                <p className="text-muted-foreground mt-0.5 leading-relaxed">
                  {approvalStatus === 'rejected'
                    ? 'This funder was rejected in Partner Onboarding. Re-approve them before creating a portfolio.'
                    : 'This funder is awaiting Partner Ops verification. Approve them in Partner Onboarding before creating a portfolio.'}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Account Name <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={form.account_name} onChange={e => set('account_name', e.target.value)} placeholder="e.g. Premium Fund" className="h-9" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Wallet className="h-3 w-3" /> From Wallet (UGX) *
              </Label>
              <Input
                type="number"
                min={50000}
                max={partnerBalance ?? undefined}
                value={form.investment_amount}
                onChange={e => set('investment_amount', e.target.value)}
                placeholder={partnerBalance ? String(Math.floor(partnerBalance)) : '—'}
                className="h-9"
                disabled={!selectedUser || balanceLoading}
              />
              {selectedUser && (
                <p className="text-[10px] text-muted-foreground">
                  {balanceLoading
                    ? 'Loading partner wallet…'
                    : `Available: UGX ${(partnerBalance ?? 0).toLocaleString()}`}
                </p>
              )}
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
              <Label className="text-xs">Contribution Date</Label>
              <Input
                type="date"
                className="h-9"
                value={form.contribution_date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => {
                  const v = e.target.value;
                  // Derive payout day-of-month from the chosen contribution date
                  const day = v ? Math.min(28, Number(v.slice(8, 10)) || 15) : 15;
                  setForm(p => ({ ...p, contribution_date: v, payout_day: String(day) }));
                }}
              />
              <p className="text-[10px] text-muted-foreground">Sets the recurring payout day to match this date.</p>
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

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            className="w-full sm:w-auto whitespace-normal text-center leading-tight min-h-[2.5rem] h-auto py-2"
            disabled={
              saving ||
              !selectedUser ||
              !form.investment_amount ||
              !/^\d{4}$/.test(form.portfolio_pin) ||
              !isApproved ||
              balanceLoading ||
              partnerBalance === null ||
              parseFloat(form.investment_amount) > partnerBalance
            }
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5 shrink-0" />}
            {!selectedUser || isApproved ? (
              'Create Portfolio'
            ) : (
              <>
                <Lock className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                <span className="sm:hidden">Not Approved</span>
                <span className="hidden sm:inline">Partner Not Approved</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

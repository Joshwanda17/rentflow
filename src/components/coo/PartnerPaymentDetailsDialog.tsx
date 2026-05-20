import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { Loader2, Plus, Smartphone, Landmark, Banknote, Star, Trash2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Method {
  id: string;
  payout_mode: 'mobile_money' | 'bank_transfer' | 'cash';
  nickname: string | null;
  momo_provider: 'MTN' | 'Airtel' | null;
  momo_number: string | null;
  momo_name: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  is_default: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  partnerId: string;
  partnerName: string;
}

export default function PartnerPaymentDetailsDialog({ open, onOpenChange, partnerId, partnerName }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [methods, setMethods] = useState<Method[]>([]);

  // form
  const [mode, setMode] = useState<'mobile_money' | 'bank_transfer' | 'cash'>('mobile_money');
  const [nickname, setNickname] = useState('');
  const [momoProvider, setMomoProvider] = useState<'MTN' | 'Airtel'>('MTN');
  const [momoNumber, setMomoNumber] = useState('');
  const [momoName, setMomoName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccName, setBankAccName] = useState('');
  const [bankAccNumber, setBankAccNumber] = useState('');
  const [makeDefault, setMakeDefault] = useState(true);

  const resetForm = () => {
    setNickname(''); setMomoNumber(''); setMomoName('');
    setBankName(''); setBankAccName(''); setBankAccNumber('');
  };

  const load = async () => {
    if (!partnerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('saved_payout_methods' as never)
      .select('*')
      .eq('user_id', partnerId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) { toast.error('Failed to load payment details', { description: error.message }); return; }
    setMethods((data ?? []) as unknown as Method[]);
  };

  useEffect(() => { if (open) load(); }, [open, partnerId]); // eslint-disable-line

  const handleAdd = async () => {
    if (mode === 'mobile_money' && (!momoNumber.trim() || !momoName.trim())) {
      toast.error('Enter MoMo number and account name'); return;
    }
    if (mode === 'bank_transfer' && (!bankName.trim() || !bankAccName.trim() || !bankAccNumber.trim())) {
      toast.error('Enter bank name, account name and account number'); return;
    }
    setSaving(true);
    try {
      if (makeDefault) {
        // Clear any existing defaults for this partner
        await supabase.from('saved_payout_methods' as never)
          .update({ is_default: false } as never)
          .eq('user_id', partnerId);
      }
      const payload: any = {
        user_id: partnerId,
        payout_mode: mode,
        nickname: nickname.trim() || null,
        is_default: makeDefault,
        momo_provider: mode === 'mobile_money' ? momoProvider : null,
        momo_number: mode === 'mobile_money' ? momoNumber.trim() : null,
        momo_name: mode === 'mobile_money' ? momoName.trim() : null,
        bank_name: mode === 'bank_transfer' ? bankName.trim() : null,
        bank_account_name: mode === 'bank_transfer' ? bankAccName.trim() : null,
        bank_account_number: mode === 'bank_transfer' ? bankAccNumber.trim() : null,
      };
      const { error } = await supabase.from('saved_payout_methods' as never).insert(payload as never);
      if (error) throw error;
      toast.success('Payment details added', { description: `Saved for ${partnerName}` });
      resetForm();
      await load();
    } catch (e: any) {
      toast.error('Could not save', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (id: string) => {
    await supabase.from('saved_payout_methods' as never).update({ is_default: false } as never).eq('user_id', partnerId);
    const { error } = await supabase.from('saved_payout_methods' as never).update({ is_default: true } as never).eq('id', id);
    if (error) { toast.error('Failed', { description: error.message }); return; }
    toast.success('Default updated');
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this payment method?')) return;
    const { error } = await supabase.from('saved_payout_methods' as never).delete().eq('id', id);
    if (error) { toast.error('Failed', { description: error.message }); return; }
    toast.success('Removed');
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payment Details — {partnerName}</DialogTitle>
          <DialogDescription>
            Save MoMo or bank details on behalf of this partner. The default method will be used for payouts.
          </DialogDescription>
        </DialogHeader>

        {/* Existing methods */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Saved Methods</Label>
          {loading ? (
            <div className="py-6 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : methods.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center border rounded-md border-dashed">No payment details on file.</p>
          ) : (
            <div className="space-y-1.5">
              {methods.map(m => (
                <div key={m.id} className={cn('flex items-start gap-2 p-2.5 rounded-md border', m.is_default && 'border-primary/50 bg-primary/5')}>
                  <div className="mt-0.5">
                    {m.payout_mode === 'mobile_money' ? <Smartphone className="h-4 w-4 text-primary" /> :
                     m.payout_mode === 'bank_transfer' ? <Landmark className="h-4 w-4 text-primary" /> :
                     <Banknote className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0 text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold">
                        {m.nickname || (m.payout_mode === 'mobile_money' ? `${m.momo_provider} MoMo` : m.payout_mode === 'bank_transfer' ? m.bank_name : 'Cash')}
                      </span>
                      {m.is_default && <Badge variant="default" className="text-[9px] h-4">Default</Badge>}
                    </div>
                    <p className="text-muted-foreground truncate">
                      {m.payout_mode === 'mobile_money' && `${m.momo_number} · ${m.momo_name}`}
                      {m.payout_mode === 'bank_transfer' && `${m.bank_account_number} · ${m.bank_account_name}`}
                      {m.payout_mode === 'cash' && 'Cash pickup'}
                    </p>
                  </div>
                  {!m.is_default && (
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setDefault(m.id)} title="Set default">
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => remove(m.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add new */}
        <div className="space-y-3 pt-3 border-t">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Add New</Label>

          <div>
            <Label className="text-xs">Type</Label>
            <Select value={mode} onValueChange={(v: any) => setMode(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mobile_money">📱 Mobile Money</SelectItem>
                <SelectItem value="bank_transfer">🏦 Bank Transfer</SelectItem>
                <SelectItem value="cash">💵 Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === 'mobile_money' && (
            <>
              <div>
                <Label className="text-xs">Provider</Label>
                <Select value={momoProvider} onValueChange={(v: any) => setMomoProvider(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MTN">MTN</SelectItem>
                    <SelectItem value="Airtel">Airtel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">MoMo Number</Label>
                <Input value={momoNumber} onChange={e => setMomoNumber(e.target.value)} placeholder="07XXXXXXXX" inputMode="tel" />
              </div>
              <div>
                <Label className="text-xs">Registered Name</Label>
                <Input value={momoName} onChange={e => setMomoName(e.target.value)} placeholder="As shown on MoMo" />
              </div>
            </>
          )}

          {mode === 'bank_transfer' && (
            <>
              <div>
                <Label className="text-xs">Bank Name</Label>
                <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. Stanbic Bank" />
              </div>
              <div>
                <Label className="text-xs">Account Name</Label>
                <Input value={bankAccName} onChange={e => setBankAccName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Account Number</Label>
                <Input value={bankAccNumber} onChange={e => setBankAccNumber(e.target.value)} inputMode="numeric" />
              </div>
            </>
          )}

          <div>
            <Label className="text-xs">Nickname (optional)</Label>
            <Input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="e.g. Primary MoMo" />
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input type="checkbox" checked={makeDefault} onChange={e => setMakeDefault(e.target.checked)} className="h-4 w-4" />
            Set as default payout method
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handleAdd} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Save Payment Method
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
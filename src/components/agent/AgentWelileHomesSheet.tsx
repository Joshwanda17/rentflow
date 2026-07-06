import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import { Home, Loader2, Plus, Banknote, TrendingUp, Users, Clock, Search, CheckCircle2, ShieldCheck, RefreshCw, ArrowLeft } from 'lucide-react';

interface WHSubscription {
  id: string;
  tenant_id: string;
  monthly_rent: number;
  outstanding_balance: number;
  receivable_total: number;
  has_smartphone: boolean;
  landlord_uses_wallet: boolean;
  payout_day: number;
  next_due_date: string | null;
  landlord_name: string | null;
  created_at?: string;
  tenant_name?: string;
  tenant_phone?: string;
  tenant_verified?: boolean;
  tenant_last_active?: string | null;
  newly_created?: boolean;
}

type EnrollStatus = {
  label: string;
  ready: boolean;
  className: string;
};

// Derive an enrollment verification / readiness status for the agent's list.
function getEnrollStatus(s: WHSubscription): EnrollStatus {
  if (s.tenant_verified) {
    return { label: 'Verified · ready to collect', ready: true, className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600' };
  }
  if (s.tenant_last_active) {
    return { label: 'Confirmed · ready to collect', ready: true, className: 'border-blue-500/40 bg-blue-500/10 text-blue-600' };
  }
  if (s.newly_created) {
    return { label: 'New account · pending confirmation', ready: false, className: 'border-amber-500/40 bg-amber-500/10 text-amber-600' };
  }
  return { label: 'Matched profile · ready to collect', ready: true, className: 'border-muted-foreground/30 bg-muted text-muted-foreground' };
}

interface AgentWelileHomesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentWelileHomesSheet({ open, onOpenChange }: AgentWelileHomesSheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [subs, setSubs] = useState<WHSubscription[]>([]);
  const [earned, setEarned] = useState(0);
  const [pendingPayouts, setPendingPayouts] = useState(0);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [allocFor, setAllocFor] = useState<WHSubscription | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('welile_homes_subscriptions')
        .select('id, tenant_id, monthly_rent, outstanding_balance, receivable_total, has_smartphone, landlord_uses_wallet, payout_day, next_due_date, landlord_name, created_at')
        .eq('agent_id', user.id)
        .eq('mode', 'agent_collection')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (rows ?? []) as WHSubscription[];
      const tenantIds = list.map((s) => s.tenant_id);
      if (tenantIds.length) {
        const { data: profs } = await supabase
          .from('profiles').select('id, full_name, phone, verified, last_active_at, created_at').in('id', tenantIds);
        const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
        list.forEach((s) => {
          const p = map.get(s.tenant_id);
          s.tenant_name = p?.full_name ?? 'Tenant';
          s.tenant_phone = p?.phone ?? '';
          s.tenant_verified = !!p?.verified;
          s.tenant_last_active = p?.last_active_at ?? null;
          // "Newly created" = the tenant profile was created at (≈) enrollment time.
          s.newly_created = !!(p?.created_at && s.created_at &&
            Math.abs(new Date(p.created_at).getTime() - new Date(s.created_at).getTime()) < 5 * 60 * 1000);
        });
      }
      setSubs(list);

      // Agent 2% earnings + pending landlord payouts
      const { data: dues } = await supabase
        .from('welile_homes_monthly_dues')
        .select('agent_commission, collection_status, payout_status, landlord_net')
        .eq('agent_id', user.id);
      let e = 0, p = 0;
      (dues ?? []).forEach((d: any) => {
        if (d.collection_status === 'collected') e += Number(d.agent_commission) || 0;
        if (d.collection_status === 'collected' && d.payout_status === 'unpaid') p += Number(d.landlord_net) || 0;
      });
      setEarned(e);
      setPendingPayouts(p);
    } catch (err: any) {
      toast({ title: 'Failed to load Welile Homes', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const totalReceivable = subs.reduce((a, s) => a + (Number(s.receivable_total) || 0), 0);
  const pendingConfirmation = subs.filter((s) => !getEnrollStatus(s).ready).length;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[92vh] overflow-y-auto p-0">
          <SheetHeader className="sticky top-0 z-10 bg-background border-b px-4 py-3">
            <SheetTitle className="flex items-center gap-2">
              <Home className="h-5 w-5 text-primary" /> Welile Homes
            </SheetTitle>
          </SheetHeader>

          <div className="p-4 space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2.5">
              <Card><CardContent className="p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> Enrolled</div>
                <p className="text-xl font-bold">{subs.length}</p>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Banknote className="h-3.5 w-3.5" /> Receivable</div>
                <p className="text-lg font-bold">{formatUGX(totalReceivable)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> Your 2% earned</div>
                <p className="text-lg font-bold text-emerald-600">{formatUGX(earned)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Pending payouts</div>
                <p className="text-lg font-bold text-orange-600">{formatUGX(pendingPayouts)}</p>
              </CardContent></Card>
            </div>

            {pendingConfirmation > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {pendingConfirmation} new {pendingConfirmation === 1 ? 'tenant is' : 'tenants are'} pending confirmation. They'll show as ready once they confirm their details.
              </div>
            )}

            <Button className="w-full gap-2" onClick={() => setEnrollOpen(true)}>
              <Plus className="h-4 w-4" /> Enroll a tenant
            </Button>

            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : subs.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                No Welile Homes tenants yet. Enroll a tenant to start earning 2% on their monthly rent.
              </div>
            ) : (
              <div className="space-y-2.5">
                {subs.map((s) => (
                  <Card key={s.id}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{s.tenant_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{s.tenant_phone}</p>
                        </div>
                        {!s.has_smartphone && <Badge variant="outline" className="shrink-0">No phone</Badge>}
                      </div>
                      {(() => {
                        const st = getEnrollStatus(s);
                        return (
                          <Badge variant="outline" className={`gap-1 font-normal ${st.className}`}>
                            {st.ready ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            {st.label}
                          </Badge>
                        );
                      })()}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div><span className="text-muted-foreground">Rent</span><br /><span className="font-semibold">{formatUGX(s.monthly_rent)}</span></div>
                        <div><span className="text-muted-foreground">Outstanding</span><br /><span className="font-semibold text-orange-600">{formatUGX(s.outstanding_balance)}</span></div>
                        <div><span className="text-muted-foreground">Payout day</span><br /><span className="font-semibold">{s.payout_day}</span></div>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Badge variant="secondary" className="font-normal">
                          {s.landlord_uses_wallet ? 'Landlord: Welile wallet' : `Landlord float${s.landlord_name ? ` · ${s.landlord_name}` : ''}`}
                        </Badge>
                      </div>
                      <Button size="sm" variant="outline" className="w-full gap-1.5"
                        disabled={s.outstanding_balance <= 0}
                        onClick={() => setAllocFor(s)}>
                        <Banknote className="h-3.5 w-3.5" /> Allocate rent
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <EnrollDialog open={enrollOpen} onOpenChange={setEnrollOpen} agentId={user?.id} onDone={load} />
      <AllocateDialog sub={allocFor} onClose={() => setAllocFor(null)} onDone={load} />
    </>
  );
}

// ---------------- Enroll dialog ----------------
function EnrollDialog({ open, onOpenChange, agentId, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; agentId?: string; onDone: () => void;
}) {
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [tenant, setTenant] = useState<{ id: string; full_name: string; phone: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [newNationalId, setNewNationalId] = useState('');
  const [rent, setRent] = useState('');
  const [payoutDay, setPayoutDay] = useState('5');
  const [hasPhone, setHasPhone] = useState(true);
  const [landlordUsesWallet, setLandlordUsesWallet] = useState(false);
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // OTP gating for brand-new tenant accounts: their phone must be verified
  // before the enrollment (and its first monthly due) is scheduled.
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpDone, setOtpDone] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const reset = () => {
    setPhone(''); setSearched(false); setTenant(null); setNewName(''); setNewNationalId('');
    setRent(''); setPayoutDay('5');
    setHasPhone(true); setLandlordUsesWallet(false); setLandlordName(''); setLandlordPhone('');
    setStep('form'); setOtpValue(''); setOtpError(null); setOtpDone(false); setCooldown(0);
  };

  const findTenant = async () => {
    const p = phone.trim();
    if (!p) return;
    setSearching(true);
    setTenant(null);
    try {
      const { data } = await supabase
        .from('profiles').select('id, full_name, phone')
        .ilike('phone', `%${p.replace(/\s/g, '')}%`).limit(1).maybeSingle();
      if (data) setTenant(data as any);
    } finally { setSearching(false); setSearched(true); }
  };

  // Validate the form, then decide: existing tenants (or already OTP-verified
  // new tenants) enroll immediately; a fresh tenant must verify their phone first.
  const submit = async () => {
    if (!agentId) return;
    const rentNum = parseFloat(rent);
    if (!rentNum || rentNum <= 0) { toast({ title: 'Enter a valid monthly rent', variant: 'destructive' }); return; }
    // Require either a found tenant, or enough info to create a new one.
    if (!tenant) {
      if (!phone.trim()) { toast({ title: 'Enter the tenant phone', variant: 'destructive' }); return; }
      if (newName.trim().length < 2) { toast({ title: 'Enter the tenant full name', variant: 'destructive' }); return; }
    }
    if (tenant || otpDone) { await finalizeEnroll(); return; }
    await sendOtp();
  };

  const sendOtp = async () => {
    setOtpSending(true); setOtpError(null);
    try {
      const { data, error } = await supabase.functions.invoke('sms-otp', {
        body: { action: 'send', phone: phone.trim() },
      });
      if (error) throw new Error(error.message || 'Could not send the code');
      if ((data as any)?.error) throw new Error((data as any).error);
      setOtpValue('');
      setStep('otp');
      setCooldown(60);
    } catch (err: any) {
      toast({ title: 'Could not send verification code', description: err.message, variant: 'destructive' });
    } finally { setOtpSending(false); }
  };

  const verifyOtp = async (code: string) => {
    setOtpVerifying(true); setOtpError(null);
    try {
      const { data, error } = await supabase.functions.invoke('sms-otp', {
        body: { action: 'verify', phone: phone.trim(), otp: code },
      });
      if (error) throw new Error('Invalid or expired code');
      if ((data as any)?.error) throw new Error((data as any).error);
      if (!(data as any)?.success) throw new Error('Verification failed');
      setOtpDone(true);
      await finalizeEnroll();
    } catch (err: any) {
      setOtpValue('');
      setOtpError(err.message || 'Verification failed');
    } finally { setOtpVerifying(false); }
  };

  const finalizeEnroll = async () => {
    if (!agentId) return;
    const rentNum = parseFloat(rent);
    setSubmitting(true);
    try {
      // Auto-create the tenant account when no existing profile was found.
      let tenantId = tenant?.id;
      if (!tenantId) {
        const { data: reg, error: regErr } = await supabase.functions.invoke('register-tenant', {
          body: {
            full_name: newName.trim(),
            phone: phone.trim(),
            national_id: newNationalId.trim() || null,
          },
        });
        if (regErr) throw new Error(regErr.message || 'Could not create tenant account');
        if ((reg as any)?.error) throw new Error((reg as any).error);
        tenantId = (reg as any)?.user_id;
        if (!tenantId) throw new Error('Could not create tenant account');
      }
      const { data, error } = await supabase.rpc('enroll_welile_home_tenant', {
        p_tenant_id: tenantId,
        p_agent_id: agentId,
        p_monthly_rent: rentNum,
        p_payout_day: parseInt(payoutDay) || 5,
        p_has_smartphone: hasPhone,
        p_landlord_uses_wallet: landlordUsesWallet,
        p_landlord_id: null,
        p_landlord_name: landlordName || null,
        p_landlord_phone: landlordPhone || null,
        p_notes: null,
      });
      if (error) throw error;
      const res = data as any;
      if (!res?.success) throw new Error(res?.error || 'Enrollment failed');
      // For a freshly created tenant, send a one-time onboarding SMS so they can
      // confirm their details and know receipts are coming. Fire-and-forget.
      if (!tenant && tenantId) {
        supabase.functions.invoke('welile-home-tenant-onboarding-sms', {
          body: { tenant_id: tenantId, subscription_id: res.subscription_id, monthly_rent: rentNum },
        }).catch(() => {});
      }
      toast({
        title: tenant ? 'Tenant enrolled' : 'Tenant verified & enrolled',
        description: `${formatUGX(rentNum)}/mo · you earn ${formatUGX(res.agent_commission_per_month)}/mo`,
      });
      reset();
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      toast({ title: 'Enrollment failed', description: err.message, variant: 'destructive' });
      setStep('form');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enroll tenant in Welile Homes</DialogTitle>
          <DialogDescription>Rent is booked as receivable × 12 months. You earn 2% of every month's rent.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tenant phone</Label>
            <div className="flex gap-2">
              <Input
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setSearched(false); setTenant(null); }}
                placeholder="07..."
              />
              <Button type="button" variant="outline" onClick={findTenant} disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {tenant && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> {tenant.full_name} · {tenant.phone}
              </div>
            )}
            {searched && !tenant && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                No registered tenant with that phone — a new account will be created below.
              </p>
            )}
          </div>
          {searched && !tenant && (
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <p className="text-xs font-medium text-muted-foreground">Create new tenant</p>
              <div>
                <Label>Tenant full name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="First Last" />
              </div>
              <div>
                <Label>National ID (optional)</Label>
                <Input value={newNationalId} onChange={(e) => setNewNationalId(e.target.value)} placeholder="CM..." />
              </div>
            </div>
          )}
          <div>
            <Label>Monthly rent (UGX)</Label>
            <Input type="number" inputMode="numeric" value={rent} onChange={(e) => setRent(e.target.value)} placeholder="500000" />
          </div>
          <div>
            <Label>Landlord payout day (1–28)</Label>
            <Input type="number" inputMode="numeric" value={payoutDay} onChange={(e) => setPayoutDay(e.target.value)} min={1} max={28} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div><p className="text-sm font-medium">Tenant has a smartphone</p><p className="text-xs text-muted-foreground">Off = you allocate their rent</p></div>
            <Switch checked={hasPhone} onCheckedChange={setHasPhone} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div><p className="text-sm font-medium">Landlord uses Welile wallet</p><p className="text-xs text-muted-foreground">Off = paid to your landlord float</p></div>
            <Switch checked={landlordUsesWallet} onCheckedChange={setLandlordUsesWallet} />
          </div>
          {!landlordUsesWallet && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Landlord name</Label><Input value={landlordName} onChange={(e) => setLandlordName(e.target.value)} /></div>
              <div><Label>Landlord phone</Label><Input value={landlordPhone} onChange={(e) => setLandlordPhone(e.target.value)} /></div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={submit}
            disabled={submitting || (!tenant && !(searched && newName.trim().length >= 2))}
            className="w-full"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Enroll tenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Allocate dialog ----------------
function AllocateDialog({ sub, onClose, onDone }: {
  sub: WHSubscription | null; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (sub) setAmount(String(Math.min(sub.monthly_rent, sub.outstanding_balance))); }, [sub]);

  const submit = async () => {
    if (!sub) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('welile_home_record_collection', {
        p_subscription_id: sub.id,
        p_amount: amt,
        p_source: 'agent_allocation',
        p_notes: 'Agent allocation',
      });
      if (error) throw error;
      const res = data as any;
      if (!res?.success) throw new Error(res?.error || 'Allocation failed');
      toast({ title: 'Rent allocated', description: `${formatUGX(res.amount_collected)} · you earned ${formatUGX(res.agent_commission)}` });
      // Fire-and-forget: send the tenant an SMS receipt for this collection.
      supabase.functions.invoke('welile-homes-sms-dispatch', { body: { since_minutes: 10 } }).catch(() => {});
      onClose();
      onDone();
    } catch (err: any) {
      toast({ title: 'Allocation failed', description: err.message, variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={!!sub} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Allocate rent — {sub?.tenant_name}</DialogTitle>
          <DialogDescription>
            Records cash collected from the tenant. Outstanding: {sub ? formatUGX(sub.outstanding_balance) : ''}. Drawn from your float.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Amount (UGX)</Label>
          <Input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Allocate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
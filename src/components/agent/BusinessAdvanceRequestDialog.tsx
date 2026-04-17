import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Briefcase, Loader2, MapPin, Navigation, AlertTriangle, CheckCircle2, Copy, Share2, Smartphone, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { BUSINESS_TYPES, projectOutstanding, formatUGX } from '@/lib/businessAdvanceCalculations';
import { getPublicOrigin } from '@/lib/getPublicOrigin';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const UG_PHONE = /^0[3-9][0-9]{8}$/;
const formatCurrency = (raw: string) => {
  const d = raw.replace(/\D/g, '');
  return d ? Number(d).toLocaleString('en-UG') : '';
};
const formatPhone = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 4) return d;
  if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
};

export default function BusinessAdvanceRequestDialog({ open, onOpenChange, onSuccess }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<'tenant' | 'business' | 'amount' | 'confirm' | 'success'>('tenant');
  const [loading, setLoading] = useState(false);
  const [activationLink, setActivationLink] = useState<string | null>(null);

  // Tenant
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantNationalId, setTenantNationalId] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');
  const [hasSmartphone, setHasSmartphone] = useState(true);
  const [onboardingMethod, setOnboardingMethod] = useState<'signup_link' | 'credentials'>('signup_link');

  // Business
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessCity, setBusinessCity] = useState('Kampala');
  const [monthlyRevenue, setMonthlyRevenue] = useState('');
  const [yearsInBusiness, setYearsInBusiness] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Amount
  const [principal, setPrincipal] = useState('');
  const [reason, setReason] = useState('');

  const reset = () => {
    setStep('tenant');
    setTenantName(''); setTenantPhone(''); setTenantNationalId(''); setTenantEmail('');
    setHasSmartphone(true); setOnboardingMethod('signup_link');
    setBusinessName(''); setBusinessType(''); setBusinessAddress(''); setBusinessCity('Kampala');
    setMonthlyRevenue(''); setYearsInBusiness(''); setGps(null);
    setPrincipal(''); setReason('');
    setActivationLink(null);
  };

  useEffect(() => { if (!open) reset(); }, [open]);

  const captureGPS = useCallback(() => {
    if (!navigator.geolocation) return toast.error('GPS not supported');
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsLoading(false);
        toast.success('Business location captured');
      },
      () => { setGpsLoading(false); toast.error('Could not get GPS'); },
      { enableHighAccuracy: true, timeout: 20000 }
    );
  }, []);

  const principalNum = parseInt(principal.replace(/,/g, '')) || 0;
  const projection30 = projectOutstanding(principalNum, 30);
  const projection60 = projectOutstanding(principalNum, 60);
  const projection90 = projectOutstanding(principalNum, 90);

  const validateTenant = (): string | null => {
    if (!tenantName.trim()) return 'Tenant name required';
    const cleanPhone = tenantPhone.replace(/\s/g, '');
    if (!UG_PHONE.test(cleanPhone)) return 'Valid Ugandan phone required (e.g. 0783 123 456)';
    const id = tenantNationalId.trim().toUpperCase();
    if (id.length < 10 || id.length > 14 || !/^[A-Z0-9]+$/.test(id)) return 'National ID must be 10-14 alphanumeric';
    if (!hasSmartphone) return 'Business tenants must have a smartphone to manage their dashboard';
    return null;
  };

  const validateBusiness = (): string | null => {
    if (!businessName.trim()) return 'Business name required';
    if (!businessType) return 'Business type required';
    if (!businessAddress.trim()) return 'Business address required';
    if (!gps) return 'Capture business GPS location';
    return null;
  };

  const validateAmount = (): string | null => {
    if (principalNum < 50000) return 'Minimum advance is UGX 50,000';
    if (principalNum > 10000000) return 'Maximum advance is UGX 10,000,000';
    if (!reason.trim() || reason.trim().length < 10) return 'Reason must be at least 10 characters';
    return null;
  };

  const handleSubmit = async () => {
    if (!user) return toast.error('Not signed in');
    setLoading(true);
    try {
      // 1. Ensure tenant profile exists (register if not)
      const cleanPhone = tenantPhone.replace(/\s/g, '');
      let tenantId: string | null = null;

      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', cleanPhone)
        .maybeSingle();

      if (existing?.id) {
        tenantId = existing.id;
      } else {
        // Register via edge function
        const { data: regData, error: regErr } = await supabase.functions.invoke('register-tenant', {
          body: {
            full_name: tenantName.trim(),
            phone: cleanPhone,
            national_id: tenantNationalId.trim().toUpperCase(),
            email: tenantEmail.trim() || undefined,
          },
        });
        if (regErr || !regData?.user_id) throw new Error(regErr?.message || 'Failed to register tenant');
        tenantId = regData.user_id;
      }

      if (!tenantId) throw new Error('Could not resolve tenant');

      // 2. Build signup/activation link
      const activation = `${getPublicOrigin()}/activate?phone=${encodeURIComponent(cleanPhone)}&type=business`;

      // 3. Create the business advance
      const { data: advance, error: advErr } = await supabase
        .from('business_advances')
        .insert({
          tenant_id: tenantId,
          agent_id: user.id,
          business_name: businessName.trim(),
          business_type: businessType,
          business_address: businessAddress.trim(),
          business_city: businessCity.trim() || null,
          business_latitude: gps?.lat,
          business_longitude: gps?.lng,
          monthly_revenue: monthlyRevenue ? parseInt(monthlyRevenue.replace(/,/g, '')) : null,
          years_in_business: yearsInBusiness ? parseFloat(yearsInBusiness) : null,
          tenant_has_smartphone: hasSmartphone,
          tenant_onboarding_method: onboardingMethod,
          tenant_signup_link: activation,
          principal: principalNum,
          outstanding_balance: principalNum,
          reason: reason.trim(),
          status: 'pending',
        })
        .select('id')
        .single();

      if (advErr) throw advErr;

      setActivationLink(activation);
      setStep('success');
      toast.success('Business advance request submitted');
      onSuccess?.();
    } catch (e: any) {
      console.error('[business-advance] submit failed', e);
      toast.error(e.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!activationLink) return;
    navigator.clipboard.writeText(activationLink);
    toast.success('Link copied');
  };

  const shareWhatsApp = () => {
    if (!activationLink) return;
    const msg = encodeURIComponent(
      `Hi ${tenantName}, your Business Advance request is being processed. Use this link to activate your dashboard and track everything: ${activationLink}`
    );
    const phone = tenantPhone.replace(/\D/g, '');
    const intl = phone.startsWith('0') ? `256${phone.slice(1)}` : phone;
    window.open(`https://wa.me/${intl}?text=${msg}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Business Advance Request
          </DialogTitle>
          <DialogDescription>
            Request a business advance on behalf of a tenant who runs a business. 1% daily compounding interest.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex gap-1 my-2">
          {(['tenant', 'business', 'amount', 'confirm'] as const).map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded ${
                ['tenant', 'business', 'amount', 'confirm'].indexOf(step) >= i ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* STEP: tenant */}
        {step === 'tenant' && (
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 flex gap-2 text-xs">
              <Smartphone className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p>
                <strong>Smartphone required.</strong> Business tenants must self-manage their dashboard, view their balance, and make payments themselves.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Tenant full name *</Label>
              <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="e.g. Sarah Nakato" />
            </div>

            <div className="space-y-2">
              <Label>Tenant phone *</Label>
              <Input
                inputMode="tel"
                value={tenantPhone}
                onChange={(e) => setTenantPhone(formatPhone(e.target.value))}
                placeholder="0783 123 456"
              />
            </div>

            <div className="space-y-2">
              <Label>National ID *</Label>
              <Input
                value={tenantNationalId}
                onChange={(e) => setTenantNationalId(e.target.value.toUpperCase())}
                placeholder="CM12345..."
                maxLength={14}
              />
            </div>

            <div className="space-y-2">
              <Label>Email (optional)</Label>
              <Input
                type="email"
                value={tenantEmail}
                onChange={(e) => setTenantEmail(e.target.value)}
                placeholder="sarah@example.com"
              />
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-border p-3">
              <Checkbox id="smart" checked={hasSmartphone} onCheckedChange={(v) => setHasSmartphone(!!v)} />
              <Label htmlFor="smart" className="text-sm font-normal cursor-pointer">
                I confirm this tenant owns a smartphone and can self-manage their account
              </Label>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">How will the tenant get access?</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOnboardingMethod('signup_link')}
                  className={`p-3 rounded-lg border text-left text-xs transition-colors ${
                    onboardingMethod === 'signup_link' ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="font-semibold mb-1">📲 Send signup link</div>
                  <div className="text-muted-foreground">Tenant downloads app & registers themselves</div>
                </button>
                <button
                  type="button"
                  onClick={() => setOnboardingMethod('credentials')}
                  className={`p-3 rounded-lg border text-left text-xs transition-colors ${
                    onboardingMethod === 'credentials' ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="font-semibold mb-1">🔑 Send credentials</div>
                  <div className="text-muted-foreground">SMS with temp password, change on first login</div>
                </button>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => {
                const err = validateTenant();
                if (err) return toast.error(err);
                setStep('business');
              }}
            >
              Next: Business details
            </Button>
          </div>
        )}

        {/* STEP: business */}
        {step === 'business' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Business name *</Label>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Sarah's Salon" />
            </div>

            <div className="space-y-2">
              <Label>Business type *</Label>
              <Select value={businessType} onValueChange={setBusinessType}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Business address *</Label>
              <Input value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} placeholder="Plot 12, Kampala Road" />
            </div>

            <div className="space-y-2">
              <Label>City</Label>
              <Input value={businessCity} onChange={(e) => setBusinessCity(e.target.value)} placeholder="Kampala" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label className="text-xs">Monthly revenue (UGX)</Label>
                <Input
                  inputMode="numeric"
                  value={monthlyRevenue}
                  onChange={(e) => setMonthlyRevenue(formatCurrency(e.target.value))}
                  placeholder="500,000"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Years in business</Label>
                <Input
                  inputMode="decimal"
                  value={yearsInBusiness}
                  onChange={(e) => setYearsInBusiness(e.target.value)}
                  placeholder="2"
                />
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={captureGPS} disabled={gpsLoading}>
              {gpsLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Navigation className="h-4 w-4 mr-2" />}
              {gps ? `📍 GPS captured (±${Math.round(gps.accuracy)}m)` : 'Capture business GPS *'}
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setStep('tenant')}>Back</Button>
              <Button onClick={() => {
                const err = validateBusiness();
                if (err) return toast.error(err);
                setStep('amount');
              }}>Next: Amount</Button>
            </div>
          </div>
        )}

        {/* STEP: amount */}
        {step === 'amount' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Advance amount (UGX) *</Label>
              <Input
                inputMode="numeric"
                value={principal}
                onChange={(e) => setPrincipal(formatCurrency(e.target.value))}
                placeholder="500,000"
                className="text-lg font-bold"
              />
              <p className="text-xs text-muted-foreground">Min UGX 50,000 · Max UGX 10,000,000</p>
            </div>

            <div className="space-y-2">
              <Label>Reason for advance *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What will the business use this advance for?"
                rows={3}
              />
            </div>

            {principalNum >= 50000 && (
              <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-xs uppercase font-bold text-muted-foreground">
                  <AlertTriangle className="h-3 w-3" /> 1% daily compounding projection
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded bg-background p-2">
                    <div className="text-muted-foreground">After 30d</div>
                    <div className="font-bold">{formatUGX(projection30)}</div>
                  </div>
                  <div className="rounded bg-background p-2">
                    <div className="text-muted-foreground">After 60d</div>
                    <div className="font-bold">{formatUGX(projection60)}</div>
                  </div>
                  <div className="rounded bg-background p-2">
                    <div className="text-muted-foreground">After 90d</div>
                    <div className="font-bold">{formatUGX(projection90)}</div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Open-ended: tenant pays whatever, whenever. Interest compounds daily on what's left.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setStep('business')}>Back</Button>
              <Button onClick={() => {
                const err = validateAmount();
                if (err) return toast.error(err);
                setStep('confirm');
              }}>Review</Button>
            </div>
          </div>
        )}

        {/* STEP: confirm */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4 space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase font-bold text-muted-foreground">Tenant</div>
                <div className="font-semibold">{tenantName}</div>
                <div className="text-xs text-muted-foreground">{tenantPhone} · {tenantNationalId}</div>
              </div>
              <Separator />
              <div>
                <div className="text-xs uppercase font-bold text-muted-foreground">Business</div>
                <div className="font-semibold">{businessName}</div>
                <div className="text-xs text-muted-foreground">{businessType} · {businessAddress}, {businessCity}</div>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Principal</span>
                <span className="font-bold text-lg">{formatUGX(principalNum)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Daily rate</span>
                <span>1.0% compounding</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Your commission</span>
                <span>0.5% of every repayment</span>
              </div>
            </div>

            <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3 text-xs">
              ℹ️ This will go through 5 approval stages: Agent Ops → Tenant Ops → Landlord Ops → COO → CFO disbursement to tenant wallet.
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setStep('amount')} disabled={loading}>Back</Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit request
              </Button>
            </div>
          </div>
        )}

        {/* STEP: success */}
        {step === 'success' && (
          <div className="space-y-4 text-center py-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Request submitted!</h3>
              <p className="text-sm text-muted-foreground">
                Now share this activation link with {tenantName} so they can manage their account.
              </p>
            </div>

            {activationLink && (
              <div className="rounded-lg border border-border p-3 text-xs break-all bg-muted/50">
                {activationLink}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={copyLink}>
                <Copy className="h-4 w-4 mr-1" /> Copy link
              </Button>
              <Button onClick={shareWhatsApp}>
                <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
              </Button>
            </div>

            <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

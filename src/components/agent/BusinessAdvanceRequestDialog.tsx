import { useState, useCallback, useEffect, useMemo } from 'react';
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
import { Briefcase, Loader2, Navigation, AlertTriangle, CheckCircle2, Copy, Smartphone, MessageCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { BUSINESS_TYPES, projectOutstanding, formatUGX } from '@/lib/businessAdvanceCalculations';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import RentHistoryCaptureGrid, { RentHistoryEntry } from './RentHistoryCaptureGrid';
import AdvanceLimitMarketingCard from './AdvanceLimitMarketingCard';

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

type Step = 'amount' | 'tenant' | 'business' | 'confirm' | 'success';
const STEPS: Step[] = ['amount', 'tenant', 'business', 'confirm'];

export default function BusinessAdvanceRequestDialog({ open, onOpenChange, onSuccess }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('amount');
  const [loading, setLoading] = useState(false);
  const [activationLink, setActivationLink] = useState<string | null>(null);

  // Amount + rent history (step 1 — marketing)
  const [principal, setPrincipal] = useState('');
  const [reason, setReason] = useState('');
  const [rentHistory, setRentHistory] = useState<RentHistoryEntry[]>([]);

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

  const reset = () => {
    setStep('amount');
    setPrincipal(''); setReason(''); setRentHistory([]);
    setTenantName(''); setTenantPhone(''); setTenantNationalId(''); setTenantEmail('');
    setHasSmartphone(true); setOnboardingMethod('signup_link');
    setBusinessName(''); setBusinessType(''); setBusinessAddress(''); setBusinessCity('Kampala');
    setMonthlyRevenue(''); setYearsInBusiness(''); setGps(null);
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

  // Live limit calculation from captured rent history
  const limit = useMemo(() => {
    const validEntries = rentHistory.filter((e) => e.rent_amount > 0);
    const months = validEntries.length;
    const avg = months > 0 ? validEntries.reduce((s, e) => s + e.rent_amount, 0) / months : 0;
    const distinctLandlords = new Set(validEntries.map((e) => e.landlord_phone || e.landlord_name).filter(Boolean)).size || 1;
    const starter = 50000;

    if (months === 0) {
      return {
        total_limit: starter,
        tier_label: 'Starter',
        months_recorded: 0,
        avg_monthly_rent: 0,
        next_unlock_at_months: 3,
        next_unlock_amount: 150000,
      };
    }

    const cappedMonths = Math.min(months, 12);
    const base = avg * cappedMonths;
    const consistencyBonus = cappedMonths >= 6 ? base * 0.20 : 0;
    const loyaltyBonus = distinctLandlords <= 2 ? base * 0.15 : 0;
    const tenureBonus = cappedMonths >= 12 ? base * 0.25 : 0;
    const total = Math.min(Math.max(starter, base + consistencyBonus + loyaltyBonus + tenureBonus), 10_000_000);

    let nextUnlockAtMonths: number | null = null;
    let nextUnlockAmount: number | null = null;
    let tierLabel = 'Starter';

    if (cappedMonths >= 12) {
      tierLabel = 'Welile Trusted';
    } else if (cappedMonths >= 6) {
      tierLabel = 'Established';
      nextUnlockAtMonths = 12;
      nextUnlockAmount = Math.min(avg * 12 * 1.60, 10_000_000);
    } else if (cappedMonths >= 3) {
      tierLabel = 'Building';
      nextUnlockAtMonths = 6;
      nextUnlockAmount = Math.min(avg * 6 * 1.20, 10_000_000);
    } else {
      nextUnlockAtMonths = 6;
      nextUnlockAmount = Math.min(avg * 6 * 1.20, 10_000_000);
    }

    return {
      total_limit: Math.round(total),
      tier_label: tierLabel,
      months_recorded: cappedMonths,
      avg_monthly_rent: Math.round(avg),
      next_unlock_at_months: nextUnlockAtMonths,
      next_unlock_amount: nextUnlockAmount ? Math.round(nextUnlockAmount) : null,
    };
  }, [rentHistory]);

  const projection30 = projectOutstanding(principalNum, 30);
  const projection60 = projectOutstanding(principalNum, 60);
  const projection90 = projectOutstanding(principalNum, 90);

  const validateAmount = (): string | null => {
    if (principalNum < 50000) return 'Minimum advance is UGX 50,000';
    if (principalNum > limit.total_limit) return `Amount exceeds your accessible limit of ${formatUGX(limit.total_limit)}. Record more rent history to unlock more.`;
    if (!reason.trim() || reason.trim().length < 10) return 'Reason must be at least 10 characters';
    return null;
  };

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

  const handleSubmit = async () => {
    if (!user) return toast.error('Not signed in');
    setLoading(true);
    try {
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

      const activation = `${getPublicOrigin()}/activate?phone=${encodeURIComponent(cleanPhone)}&type=business`;

      // Persist rent history records (status pending — back-office will verify)
      const validHistory = rentHistory.filter(
        (e) => e.rent_amount > 0 && e.landlord_name.trim() && e.landlord_phone.trim() && e.property_location.trim()
      );
      if (validHistory.length > 0) {
        const { error: histErr } = await supabase
          .from('rent_history_records')
          .insert(
            validHistory.map((e) => ({
              tenant_id: tenantId!,
              landlord_name: e.landlord_name.trim(),
              landlord_phone: e.landlord_phone.trim(),
              property_location: e.property_location.trim(),
              rent_amount: e.rent_amount,
              months_paid: 1,
              start_date: `${e.monthKey}-01`,
              status: 'pending',
            }))
          );
        if (histErr) {
          console.warn('[business-advance] rent history insert failed', histErr);
          // non-fatal — continue with the advance request
        }
      }

      const { error: advErr } = await supabase
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

  const stepIndex = STEPS.indexOf(step as any);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Business Advance Request
          </DialogTitle>
          <DialogDescription>
            Unlock business capital for a tenant. The more rent history they record, the more they can access.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        {step !== 'success' && (
          <div className="flex gap-1 my-2">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded ${stepIndex >= i ? 'bg-primary' : 'bg-muted'}`}
              />
            ))}
          </div>
        )}

        {/* STEP 1: amount + rent history (marketing) */}
        {step === 'amount' && (
          <div className="space-y-5">
            <AdvanceLimitMarketingCard
              monthsRecorded={limit.months_recorded}
              totalLimit={limit.total_limit}
              nextUnlockAmount={limit.next_unlock_amount}
              nextUnlockAtMonths={limit.next_unlock_at_months}
              tierLabel={limit.tier_label}
              avgMonthlyRent={limit.avg_monthly_rent}
            />

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-bold">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> Amount needed (UGX)
              </Label>
              <Input
                inputMode="numeric"
                value={principal}
                onChange={(e) => setPrincipal(formatCurrency(e.target.value))}
                placeholder="500,000"
                className="text-2xl font-black h-14"
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Min UGX 50,000</span>
                <span>Max today: <strong className="text-foreground">{formatUGX(limit.total_limit)}</strong></span>
              </div>
              {principalNum > limit.total_limit && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Exceeds limit. Record more rent history below to unlock more.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-bold">Reason for the advance</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What will the business use this advance for?"
                rows={2}
              />
            </div>

            <Separator />

            {/* Rent history capture */}
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-bold flex items-center gap-1.5">
                  📅 Rent payment history
                  <span className="text-[10px] uppercase tracking-wider font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    Unlocks more
                  </span>
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Each month recorded raises the limit. We auto-verify with the landlord later.
                </p>
              </div>
              <RentHistoryCaptureGrid entries={rentHistory} onChange={setRentHistory} />
            </div>

            {principalNum >= 50000 && principalNum <= limit.total_limit && (
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
              </div>
            )}

            {(() => {
              const err = validateAmount();
              return (
                <>
                  {err && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{err}</span>
                    </div>
                  )}
                  <Button
                    className="w-full h-11"
                    disabled={!!err}
                    onClick={() => {
                      const e2 = validateAmount();
                      if (e2) {
                        toast.error(e2);
                        return;
                      }
                      setStep('tenant');
                    }}
                  >
                    Next: Tenant details
                  </Button>
                </>
              );
            })()}
          </div>
        )}

        {/* STEP 2: tenant */}
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

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setStep('amount')}>Back</Button>
              <Button
                onClick={() => {
                  const err = validateTenant();
                  if (err) return toast.error(err);
                  setStep('business');
                }}
              >
                Next: Business
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: business */}
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
                setStep('confirm');
              }}>Review</Button>
            </div>
          </div>
        )}

        {/* STEP 4: confirm */}
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
              <div>
                <div className="text-xs uppercase font-bold text-muted-foreground">Rent history captured</div>
                <div className="text-xs">{rentHistory.filter((r) => r.rent_amount > 0).length} months · Tier: <strong>{limit.tier_label}</strong></div>
                <div className="text-xs text-muted-foreground">Accessible limit: {formatUGX(limit.total_limit)}</div>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Principal requested</span>
                <span className="font-bold text-lg">{formatUGX(principalNum)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Daily rate</span>
                <span>1.0% compounding</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Your commission</span>
                <span>4% of every repayment</span>
              </div>
            </div>

            <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3 text-xs">
              ℹ️ This will go through 5 approval stages: Agent Ops → Tenant Ops → Landlord Ops → COO → CFO disbursement to tenant wallet.
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setStep('business')} disabled={loading}>Back</Button>
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

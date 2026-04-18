import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Separator } from '@/components/ui/separator';
import {
  Briefcase,
  Loader2,
  Navigation,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BUSINESS_TYPES,
  projectOutstanding,
  formatUGX,
} from '@/lib/businessAdvanceCalculations';
import RentHistoryCaptureGrid, {
  RentHistoryEntry,
} from '@/components/agent/RentHistoryCaptureGrid';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Step = 'amount' | 'business' | 'confirm' | 'success';
const STEPS: Step[] = ['amount', 'business', 'confirm'];

const formatCurrency = (raw: string) => {
  const d = raw.replace(/\D/g, '');
  return d ? Number(d).toLocaleString('en-UG') : '';
};

/**
 * Tenant-facing Business Advance request form.
 * Mirrors the agent flow but pre-fills the current user as the tenant
 * and skips tenant onboarding steps.
 */
export default function TenantBusinessAdvanceRequestDialog({
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('amount');
  const [loading, setLoading] = useState(false);

  // Amount + reason + rent history
  const [principal, setPrincipal] = useState('');
  const [reason, setReason] = useState('');
  const [rentHistory, setRentHistory] = useState<RentHistoryEntry[]>([]);

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
    setPrincipal('');
    setReason('');
    setRentHistory([]);
    setBusinessName('');
    setBusinessType('');
    setBusinessAddress('');
    setBusinessCity('Kampala');
    setMonthlyRevenue('');
    setYearsInBusiness('');
    setGps(null);
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  // Pre-load existing rent history count on open to compute starting limit
  const [existingHistoryCount, setExistingHistoryCount] = useState(0);
  const [existingAvgRent, setExistingAvgRent] = useState(0);
  useEffect(() => {
    if (!open || !user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('rent_history_records')
        .select('rent_amount')
        .eq('tenant_id', user.id);
      const rows = data ?? [];
      setExistingHistoryCount(rows.length);
      const total = rows.reduce((s: number, r: any) => s + Number(r.rent_amount || 0), 0);
      setExistingAvgRent(rows.length ? total / rows.length : 0);
    })();
  }, [open, user?.id]);

  const captureGPS = useCallback(() => {
    if (!navigator.geolocation) return toast.error('GPS not supported');
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGpsLoading(false);
        toast.success('Business location captured');
      },
      () => {
        setGpsLoading(false);
        toast.error('Could not get GPS');
      },
      { enableHighAccuracy: true, timeout: 20000 }
    );
  }, []);

  const principalNum = parseInt(principal.replace(/,/g, '')) || 0;

  // Limit calculation (combines existing + freshly captured rent history)
  const limit = useMemo(() => {
    const fresh = rentHistory.filter((e) => e.rent_amount > 0);
    const totalMonths = existingHistoryCount + fresh.length;
    const freshAvg =
      fresh.length > 0
        ? fresh.reduce((s, e) => s + e.rent_amount, 0) / fresh.length
        : 0;
    const combinedAvg =
      totalMonths > 0
        ? (existingAvgRent * existingHistoryCount + freshAvg * fresh.length) /
          totalMonths
        : 0;
    const starter = 50000;
    if (totalMonths === 0) {
      return {
        total_limit: starter,
        tier_label: 'Starter',
        months_recorded: 0,
      };
    }
    const cappedMonths = Math.min(totalMonths, 12);
    const base = combinedAvg * cappedMonths;
    const consistencyBonus = cappedMonths >= 6 ? base * 0.2 : 0;
    const tenureBonus = cappedMonths >= 12 ? base * 0.25 : 0;
    const total = Math.min(
      Math.max(starter, base + consistencyBonus + tenureBonus),
      10_000_000
    );
    let tierLabel = 'Building';
    if (cappedMonths >= 12) tierLabel = 'Welile Trusted';
    else if (cappedMonths >= 6) tierLabel = 'Established';
    return {
      total_limit: Math.round(total),
      tier_label: tierLabel,
      months_recorded: cappedMonths,
    };
  }, [rentHistory, existingHistoryCount, existingAvgRent]);

  const projection30 = projectOutstanding(principalNum, 30);
  const projection60 = projectOutstanding(principalNum, 60);
  const projection90 = projectOutstanding(principalNum, 90);

  const validateAmount = (): string | null => {
    if (principalNum < 50000) return 'Minimum advance is UGX 50,000';
    if (principalNum > limit.total_limit)
      return `Amount exceeds your accessible limit of ${formatUGX(limit.total_limit)}. Record more rent history below to unlock more.`;
    if (!reason.trim() || reason.trim().length < 10)
      return 'Reason must be at least 10 characters';
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
      // Persist any newly captured rent history (status pending)
      const validHistory = rentHistory.filter(
        (e) =>
          e.rent_amount > 0 &&
          e.landlord_name.trim() &&
          e.landlord_phone.trim() &&
          e.property_location.trim()
      );
      if (validHistory.length > 0) {
        const { error: histErr } = await supabase
          .from('rent_history_records')
          .insert(
            validHistory.map((e) => ({
              tenant_id: user.id,
              landlord_name: e.landlord_name.trim(),
              landlord_phone: e.landlord_phone.trim(),
              property_location: e.property_location.trim(),
              rent_amount: e.rent_amount,
              months_paid: 1,
              start_date: `${e.monthKey}-01`,
              status: 'pending',
            }))
          );
        if (histErr) console.warn('[tenant business-advance] history insert failed', histErr);
      }

      const { error: advErr } = await supabase.from('business_advances').insert({
        tenant_id: user.id,
        agent_id: user.id, // self-requested; back-office can re-attribute
        business_name: businessName.trim(),
        business_type: businessType,
        business_address: businessAddress.trim(),
        business_city: businessCity.trim() || null,
        business_latitude: gps?.lat,
        business_longitude: gps?.lng,
        monthly_revenue: monthlyRevenue
          ? parseInt(monthlyRevenue.replace(/,/g, ''))
          : null,
        years_in_business: yearsInBusiness ? parseFloat(yearsInBusiness) : null,
        tenant_has_smartphone: true,
        tenant_onboarding_method: 'self',
        principal: principalNum,
        outstanding_balance: principalNum,
        reason: reason.trim(),
        status: 'pending',
      });

      if (advErr) throw advErr;

      setStep('success');
      toast.success('Business advance request submitted');
      onSuccess?.();
    } catch (e: any) {
      console.error('[tenant business-advance] submit failed', e);
      toast.error(e.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  const stepIndex = STEPS.indexOf(step as any);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Request a Business Advance
          </DialogTitle>
          <DialogDescription>
            Unlock business capital. The more rent history you record, the more you can access.
          </DialogDescription>
        </DialogHeader>

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

        {/* STEP 1 — amount + rent history */}
        {step === 'amount' && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-gradient-to-br from-primary to-accent p-4 text-primary-foreground">
              <p className="text-[11px] uppercase tracking-widest font-bold opacity-90 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> You can access today
              </p>
              <p className="text-3xl font-black leading-none mt-1">
                {formatUGX(limit.total_limit)}
              </p>
              <p className="text-[11px] mt-1 opacity-90">
                {limit.months_recorded} verified month{limit.months_recorded === 1 ? '' : 's'} · Tier:{' '}
                <strong>{limit.tier_label}</strong>
              </p>
            </div>

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
                <span>
                  Max today: <strong className="text-foreground">{formatUGX(limit.total_limit)}</strong>
                </span>
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
                placeholder="What will your business use this advance for?"
                rows={2}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-bold flex items-center gap-1.5">
                  📅 Add more rent history
                  <span className="text-[10px] uppercase tracking-wider font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    Unlocks more
                  </span>
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Each month recorded raises your limit. We auto-verify with the landlord.
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

            <Button
              className="w-full h-11"
              onClick={() => {
                const err = validateAmount();
                if (err) return toast.error(err);
                setStep('business');
              }}
            >
              Next: Business details
            </Button>
          </div>
        )}

        {/* STEP 2 — business details */}
        {step === 'business' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Business name *</Label>
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Sarah's Salon"
              />
            </div>

            <div className="space-y-2">
              <Label>Business type *</Label>
              <Select value={businessType} onValueChange={setBusinessType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Business address *</Label>
              <Input
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
                placeholder="Plot 12, Kampala Road"
              />
            </div>

            <div className="space-y-2">
              <Label>City</Label>
              <Input
                value={businessCity}
                onChange={(e) => setBusinessCity(e.target.value)}
                placeholder="Kampala"
              />
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

            <Button
              variant="outline"
              className="w-full"
              onClick={captureGPS}
              disabled={gpsLoading}
            >
              {gpsLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Navigation className="h-4 w-4 mr-2" />
              )}
              {gps ? `📍 GPS captured (±${Math.round(gps.accuracy)}m)` : 'Capture business GPS *'}
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setStep('amount')}>
                Back
              </Button>
              <Button
                onClick={() => {
                  const err = validateBusiness();
                  if (err) return toast.error(err);
                  setStep('confirm');
                }}
              >
                Review
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3 — confirm */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4 space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase font-bold text-muted-foreground">Business</div>
                <div className="font-semibold">{businessName}</div>
                <div className="text-xs text-muted-foreground">
                  {businessType} · {businessAddress}, {businessCity}
                </div>
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
                <span className="text-muted-foreground">Tier</span>
                <span>{limit.tier_label}</span>
              </div>
            </div>

            <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3 text-xs">
              ℹ️ Your request will be reviewed by Operations and the CFO before disbursement to your wallet.
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setStep('business')} disabled={loading}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit request
              </Button>
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {step === 'success' && (
          <div className="space-y-4 text-center py-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Request submitted!</h3>
              <p className="text-sm text-muted-foreground">
                Our team will review your request and notify you on approval.
              </p>
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

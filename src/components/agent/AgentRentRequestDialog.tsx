import { useState, useCallback, useEffect, useMemo } from 'react';
import { addDays, format } from 'date-fns';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { optimizeImage } from '@/lib/imageOptimizer';
import { GuarantorConsentCheckbox } from '@/components/agent/GuarantorConsentCheckbox';
import { LandlordSearchSelect, type LandlordOption } from '@/components/agent/LandlordSearchSelect';
import RegisterLandlordDialog from '@/components/agent/RegisterLandlordDialog';
import { useAuth } from '@/hooks/useAuth';
import { useAgentCapacityMap, DAILY_ELIGIBILITY_THRESHOLD } from '@/hooks/useAgentCapacityMap';
import { DailyRatingThresholdPopover } from '@/components/shared/DailyRatingThresholdPopover';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  User, 
  MapPin,
  Navigation,
  Building2,
  Loader2,
  CheckCircle2,
  FileText,
  Calculator,
  Calendar,
  Banknote,
  Users,
  Share2,
  Copy,
  MessageCircle,
  Home,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { formatUGX, calculateRentRepayment } from '@/lib/rentCalculations';
import { hapticSuccess } from '@/lib/haptics';

interface AgentRentRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  prefillTenantName?: string;
  prefillTenantPhone?: string;
  prefillRentAmount?: string;
}

type IncomeType = 'daily' | 'weekly-monthly' | 'outstanding';
type RepaymentPeriod = '7' | '14' | '21' | '30' | '120';

const HOUSE_CATEGORIES = [
  { value: 'single-room', label: 'Single Room', emoji: '🚪' },
  { value: 'double-room', label: 'Double Room', emoji: '🛏️' },
  { value: '1-bed', label: '1 Bed House', emoji: '🏠' },
  { value: '2-bed', label: '2 Bedroom House', emoji: '🏡' },
  { value: '2-bed-full', label: '2 Bed + Sitting Room, Kitchen & 2 Toilets', emoji: '🏘️' },
  { value: '3-bed', label: '3 Bedroom Apartment', emoji: '🏢' },
  { value: '3-bed-luxury', label: '3 Bed Luxury + Boys Quarter', emoji: '🏰' },
  { value: '4-bed', label: '4+ Bedroom Villa', emoji: '🏛️' },
  { value: 'commercial', label: 'Commercial Property', emoji: '🏪' },
];

const PREFERRED_LANGUAGES = [
  { value: 'English', label: 'English' },
  { value: 'Luganda', label: 'Luganda' },
  { value: 'Runyankole', label: 'Runyankole' },
  { value: 'Lusoga', label: 'Lusoga' },
  { value: 'Acholi', label: 'Acholi' },
  { value: 'Lugbara', label: 'Lugbara' },
  { value: 'Other', label: 'Other' },
];

// ===== FIX #1: Ugandan phone validation =====
const UG_PHONE_REGEX = /^0[3-9][0-9]{8}$/;

const ACTIVE_RENT_STATUSES = [
  'pending','agent_verified','tenant_ops_approved',
  'agent_ops_approved','landlord_ops_approved',
  'coo_approved','funded','repaying',
];
const AGENT_RENT_CAP_UGX = 100_000_000;

function AgentCapacityBanner({ agentId }: { agentId?: string }) {
  const [exposure, setExposure] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const ids = useMemo(() => (agentId ? [agentId] : []), [agentId]);
  const { data: capMap } = useAgentCapacityMap(ids);
  const cap = agentId ? capMap?.get(agentId) : undefined;

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('rent_requests')
        .select('total_repayment, amount_repaid')
        .eq('agent_id', agentId)
        .in('status', ACTIVE_RENT_STATUSES);
      if (cancelled) return;
      if (error || !data) {
        setExposure(0);
      } else {
        const total = data.reduce((acc, r: any) => {
          const owed = Math.max(
            (Number(r.total_repayment) || 0) - (Number(r.amount_repaid) || 0),
            0,
          );
          return acc + owed;
        }, 0);
        setExposure(Math.round(total));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  const used = exposure ?? 0;
  const headroom = Math.max(AGENT_RENT_CAP_UGX - used, 0);
  const pct = Math.min(100, Math.round((used / AGENT_RENT_CAP_UGX) * 100));
  const tone =
    pct >= 95 ? 'bg-destructive/10 border-destructive/40 text-destructive'
    : pct >= 75 ? 'bg-warning/10 border-warning/40 text-warning'
    : 'bg-success/10 border-success/30 text-success';

  const threshold = Math.round(DAILY_ELIGIBILITY_THRESHOLD * 100);

  const dailyBanner = (() => {
    if (!cap || cap.daily_status === 'starter') return null;
    const rating = cap.daily_rating;
    const ypct = Math.round(cap.yesterday_response_pct * 100);
    const epct = Math.round(cap.effective_daily_pct * 100);
    if (rating === 'Very Good') {
      return (
        <div className="rounded-xl border border-emerald-600/50 bg-emerald-600/10 p-3 text-emerald-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wide">Very Good — Allowed Today</span>
            <DailyRatingThresholdPopover />
          </div>
          <p className="text-[11px] leading-snug opacity-95">
            Yesterday you collected <strong className="font-mono">{formatUGX(cap.paid_yesterday)}</strong> ({ypct}%) of <strong className="font-mono">{formatUGX(cap.expected_daily)}</strong> expected — best day is {epct}%. You are well above the {threshold}% law and may post new rent requests.
          </p>
        </div>
      );
    }
    if (rating === 'Good') {
      return (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wide">Good — Allowed Today</span>
            <DailyRatingThresholdPopover />
          </div>
          <p className="text-[11px] leading-snug opacity-95">
            Yesterday you collected <strong className="font-mono">{formatUGX(cap.paid_yesterday)}</strong> ({ypct}%) of <strong className="font-mono">{formatUGX(cap.expected_daily)}</strong> expected — best day is {epct}%. You met the {threshold}% law and may post new rent requests. Keep going to reach Very Good (≥ 50%).
          </p>
        </div>
      );
    }
    if (rating === 'Fair') {
      return (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wide">Fair — Blocked from posting today</span>
            <DailyRatingThresholdPopover />
          </div>
          <p className="text-[11px] leading-snug opacity-95">
            Yesterday you collected <strong className="font-mono">{formatUGX(cap.paid_yesterday)}</strong> ({ypct}%) of <strong className="font-mono">{formatUGX(cap.expected_daily)}</strong> expected — best day is {epct}%. You are between 15% and 19%, just below the {threshold}% law. Hit {threshold}% today to be unblocked and rated Good immediately.
          </p>
        </div>
      );
    }
    if (rating === 'Bad') {
      return (
        <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-3 text-orange-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wide">Bad — Blocked from posting today</span>
            <DailyRatingThresholdPopover />
          </div>
          <p className="text-[11px] leading-snug opacity-95">
            Yesterday you collected <strong className="font-mono">{formatUGX(cap.paid_yesterday)}</strong> ({ypct}%) of <strong className="font-mono">{formatUGX(cap.expected_daily)}</strong> expected — best day is {epct}%. You are between 5% and 14%, below the {threshold}% law. Hit {threshold}% today to be unblocked and rated Good immediately.
          </p>
        </div>
      );
    }
    // Very Bad
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-destructive">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-extrabold uppercase tracking-wide">Very Bad — Blocked from posting today</span>
          <DailyRatingThresholdPopover />
        </div>
        <p className="text-[11px] leading-snug opacity-95">
          Yesterday you collected <strong className="font-mono">{formatUGX(cap.paid_yesterday)}</strong> ({ypct}%) of <strong className="font-mono">{formatUGX(cap.expected_daily)}</strong> expected — best day is {epct}%. You are below 5%, far below the {threshold}% law. Hit {threshold}% today to be unblocked and rated Good immediately.
        </p>
      </div>
    );
  })();

  return (
    <>
      {dailyBanner}
      <div className={`rounded-xl border p-3 ${tone}`}>
        <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
          <span>Your Active Rent Exposure</span>
          <span>
            {loading ? '…' : `${formatUGX(used)} / ${formatUGX(AGENT_RENT_CAP_UGX)}`}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-background/40 overflow-hidden">
          <div
            className="h-full bg-current transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[11px] mt-1.5 leading-snug opacity-90">
          Headroom available for new rent requests:{' '}
          <strong className="font-mono">{formatUGX(headroom)}</strong>.
          Per-tenant rent limits scale with each tenant's repayment rate.
          Collect on existing rent to grow your headroom.
        </p>
      </div>
    </>
  );
}

function humanizeCapacityError(message: string): string | null {
  const m = (message || '').toLowerCase();
  if (m.includes('100,000,000') || m.includes('exposure cap')) {
    return 'You have reached your UGX 100,000,000 active rent exposure cap. Collect on existing rent requests to free up headroom.';
  }
  if (m.includes('behind on rent') || m.includes('arrears')) {
    return message; // already friendly
  }
  if (m.includes('exceeds your available capacity')) {
    return message;
  }
  return null;
}

function isValidUgPhone(phone: string): boolean {
  return UG_PHONE_REGEX.test(phone.replace(/\s/g, ''));
}

function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

// ===== FIX #7: Currency display formatting =====
function formatCurrencyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('en-UG');
}

export default function AgentRentRequestDialog({ open, onOpenChange, onSuccess, prefillTenantName, prefillTenantPhone, prefillRentAmount }: AgentRentRequestDialogProps) {
  const { user } = useAuth();
  const capIds = useMemo(() => (user?.id ? [user.id] : []), [user?.id]);
  const { data: capMap } = useAgentCapacityMap(capIds);
  const myCap = user?.id ? capMap?.get(user.id) : undefined;
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [activationLink, setActivationLink] = useState<string | null>(null);
  const [step, setStep] = useState<'type' | 'details' | 'confirm'>('type');
  
  // Income type
  const [incomeType, setIncomeType] = useState<IncomeType | null>(null);
  
  // Tenant info (for non-account holders)
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantNationalId, setTenantNationalId] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<string>('');
  
  // Rent details
  const [rentAmount, setRentAmount] = useState('');
  const [outstandingBalance, setOutstandingBalance] = useState('');
  const [duration, setDuration] = useState<'30' | '60' | '90'>('30');
  const [repaymentPeriod, setRepaymentPeriod] = useState<RepaymentPeriod>('7');
  
  // Landlord info
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  
  // LC1 info
  const [lc1Name, setLc1Name] = useState('');
  const [lc1Phone, setLc1Phone] = useState('');
  const [lc1Village, setLc1Village] = useState('');
  // Town/City + District for the property location. City is required so the
  // tenant rolls up under a real location in ops dashboards instead of
  // landing in the "needs verification" bucket.
  const [propertyCity, setPropertyCity] = useState('');
  const [propertyDistrict, setPropertyDistrict] = useState('');
  const [houseCategory, setHouseCategory] = useState('');
  const [landlordPayoutDay, setLandlordPayoutDay] = useState<string>('1');
  const [noSmartphone, setNoSmartphone] = useState(false);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [housePhotos, setHousePhotos] = useState<{ file: File; preview: string }[]>([]);
  const [tenantPhoto, setTenantPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [guarantorConsent, setGuarantorConsent] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // FIX #9: house category for outstanding flow
  const [outstandingHouseCategory, setOutstandingHouseCategory] = useState('');

  // ===== Outstanding flow (refactor): selected landlord + extra rent fields =====
  const [selectedLandlord, setSelectedLandlord] = useState<LandlordOption | null>(null);
  const [outstandingRentAmount, setOutstandingRentAmount] = useState('');
  const [outstandingDaysRemaining, setOutstandingDaysRemaining] = useState('');
  const [showRegisterLandlord, setShowRegisterLandlord] = useState(false);
  const [landlordPickerKey, setLandlordPickerKey] = useState(0);

  // Pre-fill fields when dialog opens with prefill props
  useEffect(() => {
    if (open) {
      if (prefillTenantName) setTenantName(prefillTenantName);
      if (prefillTenantPhone) setTenantPhone(prefillTenantPhone);
      if (prefillRentAmount) setRentAmount(prefillRentAmount);
    }
  }, [open, prefillTenantName, prefillTenantPhone, prefillRentAmount]);

  const captureGPS = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('GPS not supported on this device');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGpsLoading(false);
        toast.success('Property GPS captured!');
      },
      (err) => {
        setGpsLoading(false);
        toast.error(err.code === 1 ? 'Location permission denied' : 'Could not get GPS. Try again.');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, []);

  const handlePhotoAdd = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 3 - housePhotos.length;
    if (remaining <= 0) { toast.error('Maximum 3 photos'); return; }
    const toAdd = files.slice(0, remaining);
    const newPhotos = toAdd.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    setHousePhotos(prev => [...prev, ...newPhotos]);
    if (e.target) e.target.value = '';
  }, [housePhotos.length]);

  const removePhoto = useCallback((index: number) => {
    setHousePhotos(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleTenantPhoto = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTenantPhoto(prev => {
      if (prev) URL.revokeObjectURL(prev.preview);
      return { file, preview: URL.createObjectURL(file) };
    });
    if (e.target) e.target.value = '';
  }, []);

  const removeTenantPhoto = useCallback(() => {
    setTenantPhoto(prev => {
      if (prev) URL.revokeObjectURL(prev.preview);
      return null;
    });
  }, []);

  const uploadTenantPhoto = async (requestId: string, tenantUserId?: string | null): Promise<string | null> => {
    if (!user || !tenantPhoto) return null;
    try {
      const optimized = await optimizeImage(tenantPhoto.file, { maxWidth: 1200, quality: 0.85 });
      const ext = optimized.file.name.split('.').pop() || 'webp';
      const path = `${user.id}/${requestId}/tenant_passport.${ext}`;
      const { error } = await supabase.storage
        .from('house-images')
        .upload(path, optimized.file, { cacheControl: '86400', upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('house-images').getPublicUrl(path);
      // Best-effort: also set on tenant profile avatar if missing
      if (tenantUserId) {
        try {
          await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', tenantUserId).is('avatar_url', null);
        } catch { /* non-fatal */ }
      }
      return data.publicUrl;
    } catch (err) {
      console.warn('Tenant photo upload failed:', err);
      return null;
    }
  };

  const uploadHousePhotos = async (requestId: string): Promise<string[]> => {
    if (!user || housePhotos.length === 0) return [];
    const urls: string[] = [];
    for (let i = 0; i < housePhotos.length; i++) {
      try {
        const optimized = await optimizeImage(housePhotos[i].file, { maxWidth: 1200, quality: 0.8 });
        const ext = optimized.file.name.split('.').pop() || 'webp';
        const path = `${user.id}/${requestId}/photo_${i}.${ext}`;
        const { error } = await supabase.storage
          .from('house-images')
          .upload(path, optimized.file, { cacheControl: '86400', upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from('house-images').getPublicUrl(path);
        urls.push(data.publicUrl);
      } catch (err) {
        console.warn(`Photo ${i} upload failed:`, err);
      }
    }
    return urls;
  };

  const resetForm = () => {
    setIncomeType(null);
    setTenantName('');
    setTenantPhone('');
    setTenantNationalId('');
    setRentAmount('');
    setOutstandingBalance('');
    setDuration('30');
    setRepaymentPeriod('7');
    setLandlordName('');
    setLandlordPhone('');
    setPropertyAddress('');
    setLc1Name('');
    setLc1Phone('');
    setLc1Village('');
    setPropertyCity('');
    setPropertyDistrict('');
    setHouseCategory('');
    setOutstandingHouseCategory('');
    setSelectedLandlord(null);
    setOutstandingRentAmount('');
    setOutstandingDaysRemaining('');
    setNoSmartphone(false);
    setGpsLocation(null);
    setGpsLoading(false);
    housePhotos.forEach(p => URL.revokeObjectURL(p.preview));
    setHousePhotos([]);
    if (tenantPhoto) URL.revokeObjectURL(tenantPhoto.preview);
    setTenantPhoto(null);
    setGuarantorConsent(false);
    setValidationErrors([]);
    setSubmissionError(null);
    setSuccess(false);
    setActivationLink(null);
    setStep('type');
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const amount = incomeType === 'outstanding' 
    ? (parseInt(outstandingBalance.replace(/,/g, '')) || 0)
    : (parseInt(rentAmount.replace(/,/g, '')) || 0);
  
  // Calculate fees based on income type
  const calculateFees = () => {
    if (!incomeType) return null;
    // Outstanding flow accepts a zero balance (tenant already cleared) — only
    // non-outstanding flows require a positive amount to compute fees.
    if (incomeType !== 'outstanding' && !amount) return null;

    if (incomeType === 'outstanding') {
      const days = parseInt(duration);
      // Outstanding flow: rent_amount is the monthly rent the tenant owes
      // (separate field), while `amount` (= outstandingBalance) is the arrears.
      const rentMonthly = parseInt(outstandingRentAmount.replace(/,/g, '')) || amount;
      return {
        rentAmount: rentMonthly,
        durationDays: days,
        accessFee: 0,
        requestFee: 0,
        totalRepayment: amount,
        dailyRepayment: amount > 0 ? Math.ceil(amount / days) : 0,
      };
    }
    
    if (incomeType === 'daily') {
      return calculateRentRepayment(amount, parseInt(duration) as 30 | 60 | 90);
    } else {
      // Weekly/Monthly calculation
      const DAILY_ACCESS_FEE_RATE = 0.011; // 1.1%
      const PLATFORM_FEE = 10000;
      const days = parseInt(repaymentPeriod);
      const accessFee = Math.round(amount * DAILY_ACCESS_FEE_RATE * days);
      const totalRepayment = amount + accessFee + PLATFORM_FEE;
      
      return {
        rentAmount: amount,
        durationDays: days,
        accessFee,
        requestFee: PLATFORM_FEE,
        totalRepayment,
        dailyRepayment: Math.round(totalRepayment / days),
      };
    }
  };

  const fees = calculateFees();

  // ===== FIX #1: Phone validation helper =====
  const collectValidationErrors = (isOutstanding: boolean): string[] => {
    const errors: string[] = [];
    const cleanTenantPhone = tenantPhone.replace(/\s/g, '');
    const cleanLandlordPhone = landlordPhone.replace(/\s/g, '');

    if (!guarantorConsent) errors.push('Please accept guarantor responsibility');
    if (!tenantName.trim()) errors.push('Tenant name is required');
    if (!tenantPhone.trim()) errors.push('Tenant phone is required');
    else if (!isValidUgPhone(cleanTenantPhone)) errors.push('Tenant phone must be a valid Ugandan number (e.g. 0783 123 456)');

    const cleanNationalId = tenantNationalId.trim().toUpperCase();
    if (!isOutstanding) {
      if (!cleanNationalId || cleanNationalId.length < 10 || cleanNationalId.length > 14 || !/^[A-Z0-9]+$/.test(cleanNationalId)) {
        errors.push('National ID is required (10-14 alphanumeric characters)');
      }
    }

    if (!preferredLanguage) errors.push('Preferred language is required');

    if (!tenantPhoto) errors.push('Tenant passport photo is required');

    // Outstanding flow uses a searchable landlord picker (LC already linked).
    // Other flows still collect landlord + LC1 inline.
    if (isOutstanding) {
      if (!selectedLandlord) errors.push('Please select a landlord');
      if (!outstandingRentAmount || parseInt(outstandingRentAmount.replace(/,/g, '')) <= 0) {
        errors.push('Rent amount is required');
      }
      // Outstanding balance and days remaining can both be 0
      // (tenant already cleared / no current period left).
      if (outstandingDaysRemaining === '' || isNaN(parseInt(outstandingDaysRemaining))) {
        errors.push('Days remaining is required');
      }
      if (outstandingBalance === '' || isNaN(parseInt(outstandingBalance.replace(/,/g, '')))) {
        errors.push('Outstanding balance is required');
      }
    } else {
      if (!landlordName.trim()) errors.push('Landlord name is required');
      if (!landlordPhone.trim()) errors.push('Landlord phone is required');
      else if (!isValidUgPhone(cleanLandlordPhone)) errors.push('Landlord phone must be a valid Ugandan number (e.g. 0700 123 456)');

      if (!propertyAddress.trim()) errors.push('Property address is required');
      if (!lc1Name.trim()) errors.push('LC1 name is required');
      if (!lc1Phone.trim()) errors.push('LC1 phone is required');
      else {
        const cleanLc1 = lc1Phone.replace(/\s/g, '');
        if (!isValidUgPhone(cleanLc1)) errors.push('LC1 phone must be a valid Ugandan number');
      }
      if (!lc1Village.trim()) errors.push('LC1 village is required');
      if (!propertyCity.trim()) errors.push('City / Town is required');
      if (!houseCategory) errors.push('House category is required');
    }

    // ===== Block duplicate phone numbers across roles =====
    const cleanLc1Phone = lc1Phone.replace(/\s/g, '');
    const tenantPhoneValid = cleanTenantPhone && isValidUgPhone(cleanTenantPhone);
    const landlordPhoneValid = cleanLandlordPhone && isValidUgPhone(cleanLandlordPhone);
    const lc1PhoneValid = cleanLc1Phone && isValidUgPhone(cleanLc1Phone);

    if (tenantPhoneValid && landlordPhoneValid && cleanTenantPhone === cleanLandlordPhone) {
      errors.push('Tenant and Landlord phone numbers cannot be the same');
    }
    if (tenantPhoneValid && lc1PhoneValid && cleanTenantPhone === cleanLc1Phone) {
      errors.push('Tenant and LC1 phone numbers cannot be the same');
    }
    if (landlordPhoneValid && lc1PhoneValid && cleanLandlordPhone === cleanLc1Phone) {
      errors.push('Landlord and LC1 phone numbers cannot be the same');
    }

    return errors;
  };

  // Helper to check if a specific field has an error
  const hasFieldError = (fieldName: string): boolean => {
    return validationErrors.some(e => e.toLowerCase().includes(fieldName.toLowerCase()));
  };

  const handleSubmit = async () => {
    setSubmissionError(null);

    if (!user) {
      toast.error('You must be signed in to submit a request');
      return;
    }
    // Daily Eligibility Law: block posting if yesterday < 20% of expected daily.
    if (myCap && myCap.daily_status === 'blocked') {
      const threshold = Math.round(DAILY_ELIGIBILITY_THRESHOLD * 100);
      const ypct = Math.round(myCap.yesterday_response_pct * 100);
      const msg =
        `Blocked from posting new rent requests today. ` +
        `Yesterday you collected ${ypct}% of your expected daily rent ` +
        `(UGX ${formatUGX(myCap.paid_yesterday)} of UGX ${formatUGX(myCap.expected_daily)}). ` +
        `Collect at least ${threshold}% today to be unblocked and rated Good tomorrow.`;
      setSubmissionError(msg);
      toast.error('Blocked today', { description: msg });
      return;
    }
    if (!fees) {
      toast.error('Please enter a valid rent amount before submitting');
      return;
    }

    const isOutstanding = incomeType === 'outstanding';
    const errors = collectValidationErrors(isOutstanding);

    if (errors.length > 0) {
      setValidationErrors(errors);
      setSubmissionError(errors[0]);
      toast.error(errors[0]);
      // Scroll the dialog so the agent actually sees the error summary
      requestAnimationFrame(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog) dialog.scrollTo({ top: 0, behavior: 'smooth' });
      });
      return;
    }

    setValidationErrors([]);
    setLoading(true);

    try {
      // Verify session is still valid before submitting
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          toast.error('Session expired. Please log in again to submit.');
          setLoading(false);
          return;
        }
      }
      // ===== Resolve landlord =====
      // Outstanding flow uses the searchable picker — landlord already exists,
      // so we use the selected ID directly. Other flows fall back to upsert-by-phone.
      const cleanLandlordPhone = landlordPhone.replace(/\s/g, '');
      let landlordId: string;

      if (isOutstanding && selectedLandlord) {
        landlordId = selectedLandlord.id;
      } else {
        const { data: existingLandlord } = await supabase
          .from('landlords')
          .select('id')
          .eq('phone', cleanLandlordPhone)
          .limit(1)
          .maybeSingle();

        if (existingLandlord) {
          landlordId = existingLandlord.id;
        } else {
          const { data: landlord, error: landlordError } = await supabase
            .from('landlords')
            .insert({
              name: landlordName.trim(),
              phone: cleanLandlordPhone,
              property_address: propertyAddress.trim(),
              registered_by: user?.id,
            })
            .select('id')
            .single();

          if (landlordError) throw landlordError;
          landlordId = landlord.id;
        }
      }

      // ===== LC1 upsert (skipped entirely for outstanding — already linked to landlord) =====
      let lc1Id: string | null = null;
      const cleanLc1Phone = lc1Phone.replace(/\s/g, '');
      if (!isOutstanding) {
        const { data: existingLc1 } = await supabase
          .from('lc1_chairpersons')
          .select('id')
          .eq('phone', cleanLc1Phone)
          .limit(1)
          .maybeSingle();

        if (existingLc1) {
          lc1Id = existingLc1.id;
        } else {
          const { data: lc1, error: lc1Error } = await supabase
            .from('lc1_chairpersons')
            .insert({
              name: lc1Name.trim() || 'N/A',
              phone: cleanLc1Phone || 'N/A',
              village: lc1Village.trim() || 'N/A',
            })
            .select('id')
            .single();

          if (lc1Error) throw lc1Error;
          lc1Id = lc1.id;
        }
      }

      // Register tenant via edge function (handles both existing and new users)
      const cleanTenantPhone = tenantPhone.replace(/\s/g, '');
      const cleanNationalId = tenantNationalId.trim().toUpperCase();
      const { data: tenantResult, error: tenantRegError } = await supabase.functions.invoke('register-tenant', {
        body: {
          full_name: tenantName.trim(),
          phone: cleanTenantPhone,
          // National ID is optional in the outstanding flow.
          national_id: cleanNationalId || null,
        },
      });

      if (tenantRegError) {
        console.error('Tenant registration error:', tenantRegError);
        let errorMsg = 'Failed to register tenant';
        try {
          if (tenantRegError.context?.body) {
            const text = await new Response(tenantRegError.context.body).text();
            const parsed = JSON.parse(text);
            errorMsg = parsed.error || errorMsg;
          }
        } catch {}
        setSubmissionError(errorMsg);
        toast.error(errorMsg);
        setLoading(false);
        return;
      }

      if (!tenantResult?.user_id) {
        console.error('Tenant registration returned no user_id:', tenantResult);
        const errorMsg = tenantResult?.error || 'Failed to register tenant - no user ID returned';
        setSubmissionError(errorMsg);
        toast.error(errorMsg);
        setLoading(false);
        return;
      }

      const tenantId = tenantResult.user_id;

      // Persist the property's town/city/district/village on the tenant's
      // profile so they roll up under a real location in the Tenant Ops
      // drill-down. Best-effort — never block submission on this.
      if (!isOutstanding) {
        const profileLocation: Record<string, string> = {};
        if (propertyCity.trim()) profileLocation.city = propertyCity.trim();
        if (propertyDistrict.trim()) profileLocation.district = propertyDistrict.trim();
        if (lc1Village.trim()) profileLocation.village = lc1Village.trim();
        if (Object.keys(profileLocation).length > 0) {
          profileLocation.country = 'Uganda';
          try {
            await supabase
              .from('profiles')
              .update(profileLocation)
              .eq('id', tenantId);
          } catch (e) {
            console.warn('Failed to update tenant profile location', e);
          }
        }
      }

      // FIX #9: Use selected house category or null for outstanding
      const resolvedHouseCategory = isOutstanding
        ? (outstandingHouseCategory || null)
        : houseCategory;

      const { data: rentReq, error: requestError } = await supabase
        .from('rent_requests')
        .insert({
          tenant_id: tenantId,
          agent_id: user.id,
          landlord_id: landlordId,
          lc1_id: lc1Id,
          rent_amount: fees.rentAmount,
          duration_days: fees.durationDays,
          access_fee: fees.accessFee,
          request_fee: fees.requestFee,
          total_repayment: fees.totalRepayment,
          daily_repayment: fees.dailyRepayment,
          status: 'pending',
          house_category: resolvedHouseCategory,
          preferred_language: preferredLanguage || null,
          tenant_no_smartphone: isOutstanding ? false : noSmartphone,
          request_latitude: isOutstanding ? null : (gpsLocation?.lat ?? null),
          request_longitude: isOutstanding ? null : (gpsLocation?.lng ?? null),
          agent_guarantor_consent: true,
          agent_guarantor_consent_at: new Date().toISOString(),
          agent_guarantor_consent_version: 'v1',
          ...(isOutstanding ? {
            registration_type: 'outstanding_balance',
            initial_outstanding_balance: amount,
            // Days remaining on the tenant's current rent period — auto-charge
            // engine defers the first arrears charge by this many days so the
            // tenant isn't double-billed (current period + arrears).
            outstanding_grace_days: outstandingDaysRemaining
              ? Math.max(0, parseInt(outstandingDaysRemaining, 10))
              : null,
          } : {}),
          // Welile auto-pays the landlord wallet on this day of the month
          landlord_payout_day: Math.min(28, Math.max(1, parseInt(landlordPayoutDay, 10) || 1)),
          landlord_payout_next_run_at: (() => {
            const day = Math.min(28, Math.max(1, parseInt(landlordPayoutDay, 10) || 1));
            const d = new Date();
            d.setUTCDate(1);
            if (new Date().getUTCDate() >= day) d.setUTCMonth(d.getUTCMonth() + 1);
            d.setUTCDate(day);
            d.setUTCHours(7, 0, 0, 0);
            return d.toISOString();
          })(),
          landlord_payout_enabled: true,
        } as any)
        .select('id')
        .single();

      if (requestError) throw requestError;

      // Upload house photos if any
      if (housePhotos.length > 0 && rentReq?.id) {
        const photoUrls = await uploadHousePhotos(rentReq.id);
        if (photoUrls.length > 0) {
          await supabase
            .from('rent_requests')
            .update({ house_image_urls: photoUrls })
            .eq('id', rentReq.id);
        }
      }

      // Upload tenant passport photo (required)
      if (tenantPhoto && rentReq?.id) {
        const tenantPhotoUrl = await uploadTenantPhoto(rentReq.id, tenantId);
        if (tenantPhotoUrl) {
          await supabase
            .from('rent_requests')
            .update({ tenant_photo_url: tenantPhotoUrl } as any)
            .eq('id', rentReq.id);
        }
      }

      // Build activation link if tenant is new
      if (!tenantResult.existing && tenantResult.activation_token) {
        const link = `${getPublicOrigin()}/join?t=${tenantResult.activation_token}`;
        setActivationLink(link);
      }

      hapticSuccess();
      setSuccess(true);
      toast.success(incomeType === 'outstanding' ? 'Tenant registered with outstanding balance!' : 'Rent request posted successfully!');
      onSuccess?.();
    } catch (error: any) {
      console.error('Submission error:', error);
      const msg = error.message || 'Failed to submit request';
      const capacityMsg = humanizeCapacityError(msg);
      if (capacityMsg) {
        setSubmissionError(capacityMsg);
        toast.error('Rent capacity reached', { description: capacityMsg });
      } else if (msg.includes('row-level security') || msg.includes('RLS')) {
        const friendly = 'Permission denied — your session may have expired. Please log out and log in again.';
        setSubmissionError(friendly);
        toast.error(friendly);
      } else {
        setSubmissionError(msg);
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const getPeriodLabel = (period: RepaymentPeriod) => {
    switch (period) {
      case '7': return '7 Days (1 Week)';
      case '14': return '14 Days (2 Weeks)';
      case '21': return '21 Days (3 Weeks)';
      case '30': return '30 Days (1 Month)';
      case '120': return '120 Days (4 Months)';
    }
  };

  // FIX #5: Outstanding min = 50,000 (matches regular flow)
  const outstandingMinAmount = 50000;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[88vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+96px)] sm:pb-6 overscroll-contain">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Post Rent Request (For Tenant)
          </DialogTitle>
          <DialogDescription>
            Submit a rent request on behalf of a tenant who doesn't have the app
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-6 text-center space-y-4"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                className="w-16 h-16 mx-auto rounded-full bg-success/20 flex items-center justify-center"
              >
                <CheckCircle2 className="h-8 w-8 text-success" />
              </motion.div>
              <h3 className="text-lg font-semibold">
                {incomeType === 'outstanding' ? 'Tenant Registered!' : 'Request Posted!'}
              </h3>
              <p className="text-muted-foreground text-sm">
                {incomeType === 'outstanding'
                  ? `Outstanding balance of ${formatUGX(amount)} recorded for ${tenantName}. Now active in your Owing tab — no approval needed.`
                  : 'The rent request is now visible to supporters'}
              </p>
              {incomeType === 'outstanding' && (
                <div className="mx-auto mt-2 p-3 rounded-xl bg-warning/10 border border-warning/20 text-left space-y-1 max-w-xs">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Tenant</span>
                    <span className="font-semibold">{tenantName}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Balance</span>
                    <span className="font-bold text-warning">{formatUGX(amount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-semibold">{duration} days</span>
                  </div>
                </div>
              )}

              {/* Activation Link Section */}
              {activationLink && (
                <div className="space-y-3 pt-2">
                  <Separator />
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-left space-y-2">
                    <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                      <Share2 className="h-3.5 w-3.5" />
                      Tenant Activation Link
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Share this link with <strong>{tenantName}</strong> so they can activate their account when they get a smartphone.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1.5 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(activationLink);
                          toast.success('Link copied!');
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy Link
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5 text-xs bg-[#25D366] hover:bg-[#20BD5A] text-white"
                        onClick={() => {
                          const message = `Hi ${tenantName}! 👋\n\nYour rent request has been submitted on Welile. When you get a smartphone, tap this link to activate your account:\n\n${activationLink}\n\nYou'll be able to track your rent status and make payments.`;
                          const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                          window.open(whatsappUrl, '_blank');
                        }}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Share on WhatsApp
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <Button onClick={() => handleOpenChange(false)} className="w-full mt-2">
                Done
              </Button>
            </motion.div>
          ) : step === 'type' ? (
            <motion.div
              key="type"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4 py-2"
            >
              <p className="text-sm text-muted-foreground text-center">
                How does this tenant earn income?
              </p>
              
              <div className="grid gap-3">
                <button
                  onClick={() => {
                    setIncomeType('daily');
                    setStep('details');
                  }}
                  className="p-4 rounded-xl border-2 border-muted hover:border-primary hover:bg-primary/5 transition-all text-left group active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">Daily Income Earner</p>
                      <p className="text-xs text-muted-foreground">Pays back daily over 30-90 days</p>
                    </div>
                  </div>
                </button>
                
                <button
                  onClick={() => {
                    setIncomeType('weekly-monthly');
                    setStep('details');
                  }}
                  className="p-4 rounded-xl border-2 border-muted hover:border-success hover:bg-success/5 transition-all text-left group active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-success/10 group-hover:bg-success/20">
                      <Banknote className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="font-semibold">Weekly/Monthly Earner</p>
                      <p className="text-xs text-muted-foreground">Pays back in 1-4 weeks or 4 months</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIncomeType('outstanding');
                    setDuration('30');
                    setStep('details');
                  }}
                  className="p-4 rounded-xl border-2 border-[#7C3BED]/30 hover:border-[#7C3BED] hover:bg-[#7C3BED]/5 transition-all text-left group active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-[#7C3BED]/10 group-hover:bg-[#7C3BED]/20">
                      <AlertTriangle className="h-5 w-5 text-[#7C3BED]" />
                    </div>
                    <div>
                      <p className="font-semibold">Outstanding Balance</p>
                      <p className="text-xs text-muted-foreground">Register tenant with existing arrears — no fees applied</p>
                    </div>
                  </div>
                </button>
              </div>
            </motion.div>
          ) : step === 'details' ? (
            <motion.div
              key="details"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              {/* Agent rent exposure capacity (100M UGX cap) */}
              <AgentCapacityBanner agentId={user?.id} />

              {/* ===== 1. RENT DETAILS — PRIMARY SECTION ===== */}
              {incomeType === 'outstanding' ? (
                <>
                  {/* Warning banner */}
                  <div className="p-3 rounded-xl border" style={{ backgroundColor: 'rgba(124, 59, 237, 0.12)', borderColor: 'rgba(124, 59, 237, 0.3)' }}>
                    <p className="text-xs font-medium" style={{ color: '#7C3BED' }}>
                      ⚠️ Outstanding balance is stored exactly as typed — no access fee, no platform fee, no recalculation. Tenant goes live in your Owing tab immediately (no approval).
                    </p>
                  </div>

                  {/* 🏠 Select Landlord (debounced search) */}
                  <div className="space-y-3 p-4 rounded-2xl border-4" style={{ backgroundColor: 'rgba(124, 59, 237, 0.06)', borderColor: 'rgba(124, 59, 237, 0.25)' }}>
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      🏠 Select Landlord
                    </h4>
                    <p className="text-[11px] text-muted-foreground -mt-1">
                      LC1 is already linked to the landlord — no need to add it again.
                    </p>
                    <LandlordSearchSelect
                      key={landlordPickerKey}
                      value={selectedLandlord}
                      onChange={setSelectedLandlord}
                    />
                    {selectedLandlord?.property_address && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {selectedLandlord.property_address}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <p className="text-[11px] text-muted-foreground">
                        Can't find the landlord?
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => setShowRegisterLandlord(true)}
                      >
                        <Building2 className="h-3.5 w-3.5 mr-1" />
                        Register new landlord
                      </Button>
                    </div>
                  </div>

                  {/* 👤 Tenant Personal Information */}
                  <div className="space-y-3 p-4 rounded-2xl bg-muted/40 border-4 border-primary">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      👤 Personal Information
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Tenant Name *</Label>
                        <Input
                          value={tenantName}
                          onChange={(e) => setTenantName(e.target.value)}
                          placeholder="Full name"
                          className="h-10"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tenant Phone *</Label>
                        <Input
                          value={tenantPhone}
                          onChange={(e) => setTenantPhone(formatPhoneInput(e.target.value))}
                          placeholder="0783 123 456"
                          className="h-10"
                          maxLength={12}
                          required
                        />
                        {tenantPhone.replace(/\s/g, '').length >= 10 && !isValidUgPhone(tenantPhone.replace(/\s/g, '')) && (
                          <p className="text-[10px] text-destructive">Invalid Ugandan phone number</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Preferred Language *</Label>
                      <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select tenant language" />
                        </SelectTrigger>
                        <SelectContent>
                          {PREFERRED_LANGUAGES.map((l) => (
                            <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* 💰 Rent Information */}
                  <div className="space-y-3 p-4 rounded-2xl border-4" style={{ backgroundColor: 'rgba(124, 59, 237, 0.06)', borderColor: 'rgba(124, 59, 237, 0.25)' }}>
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-primary" />
                      💰 Rent Information
                    </h4>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Rent Amount (UGX) *</Label>
                        <Input
                          value={formatCurrencyInput(outstandingRentAmount)}
                          onChange={(e) => setOutstandingRentAmount(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="e.g. 300,000"
                          className="h-10"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Repayment Duration *</Label>
                        <Select value={duration} onValueChange={(v) => setDuration(v as '30' | '60' | '90')}>
                          <SelectTrigger className="h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30">30 Days</SelectItem>
                            <SelectItem value="60">60 Days</SelectItem>
                            <SelectItem value="90">90 Days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Outstanding Balance (UGX) *</Label>
                      <Input
                        value={formatCurrencyInput(outstandingBalance)}
                        onChange={(e) => setOutstandingBalance(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="Enter amount"
                        className="h-12 text-lg font-bold border-2 rounded-xl focus:ring-0" style={{ borderColor: 'rgba(124, 59, 237, 0.4)' }} onFocus={(e) => e.currentTarget.style.borderColor = '#7C3BED'} onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(124, 59, 237, 0.4)'}
                        required
                      />
                      {amount > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Daily repayment: <span className="font-semibold">{formatUGX(Math.ceil(amount / parseInt(duration)))}/day</span> for {duration} days
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Days Remaining *</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={outstandingDaysRemaining}
                        onChange={(e) => setOutstandingDaysRemaining(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="Days left on current rent period"
                        className="h-10"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">House Type *</Label>
                      <Select value={outstandingHouseCategory} onValueChange={setOutstandingHouseCategory}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select house type" />
                        </SelectTrigger>
                        <SelectContent>
                          {HOUSE_CATEGORIES.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.emoji} {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* FIX #2: Add GuarantorConsentCheckbox to outstanding flow */}
                  <GuarantorConsentCheckbox checked={guarantorConsent} onCheckedChange={setGuarantorConsent} />

                  {/* Validation Error Summary */}
                  {validationErrors.length > 0 && (
                    <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 space-y-1">
                      <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Please fix the following:
                      </p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {validationErrors.map((err, i) => (
                          <li key={i} className="text-[11px] text-destructive">{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {submissionError && validationErrors.length === 0 && (
                    <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs font-medium text-destructive flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{submissionError}</span>
                    </div>
                  )}

                  {/* Submit button for outstanding mode */}
                  <div className="flex gap-3 pt-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => { setStep('type'); setValidationErrors([]); }}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button 
                      onClick={handleSubmit} 
                      className="flex-1 text-white hover:opacity-90" style={{ backgroundColor: '#7C3BED' }}
                      disabled={loading || (incomeType !== 'outstanding' && amount <= 0)}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        'Register Tenant'
                      )}
                    </Button>
                  </div>
                </>
              ) : (
              <div className="space-y-3 p-4 rounded-2xl bg-primary/10 border-2 border-primary/40">
                <h4 className="text-base font-extrabold text-primary flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-primary/20">
                    <Calculator className="h-5 w-5 text-primary" />
                  </div>
                  💰 Rent Details
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-primary/80">Rent Amount (UGX) *</Label>
                    <p className="text-[10px] font-bold text-primary/60 italic">Let Welile pay this today</p>
                    {/* FIX #7: Currency formatting */}
                    <Input
                      value={formatCurrencyInput(rentAmount)}
                      onChange={(e) => setRentAmount(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="500,000"
                      className="h-12 text-lg font-bold border-2 border-primary/30 focus:border-primary rounded-xl"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-primary/80">
                      {incomeType === 'daily' ? 'Duration' : 'Repayment Period'} *
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      {incomeType === 'daily'
                        ? 'tenant will take to repay.'
                        : 'Select the repayment cycle length for this tenant.'}
                    </p>
                    {incomeType === 'daily' ? (
                      <Select value={duration} onValueChange={(v) => setDuration(v as '30' | '60' | '90')}>
                        <SelectTrigger className="h-12 text-base font-semibold border-2 border-primary/30 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 Days</SelectItem>
                          <SelectItem value="60">60 Days</SelectItem>
                          <SelectItem value="90">90 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={repaymentPeriod} onValueChange={(v) => setRepaymentPeriod(v as RepaymentPeriod)}>
                        <SelectTrigger className="h-12 text-base font-semibold border-2 border-primary/30 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">7 Days</SelectItem>
                          <SelectItem value="14">14 Days</SelectItem>
                          <SelectItem value="21">21 Days</SelectItem>
                          <SelectItem value="30">30 Days</SelectItem>
                          <SelectItem value="120">120 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                
                {/* Daily Repayment Hero Card */}
                {fees && (
                  <div className="space-y-2">
                    <div className="p-4 rounded-2xl bg-primary/20 border-2 border-primary/40 text-center">
                      <p className="text-xs text-primary/70 font-medium mb-1">And You Pay</p>
                      <p className="text-3xl font-black text-primary font-mono">{formatUGX(fees.dailyRepayment)}</p>
                      <p className="text-xs text-primary/70 mt-1">per day for {fees.durationDays} days</p>
                    </div>

                    {/* Repayment Start Date */}
                    <div className="p-3 rounded-xl bg-primary/10 border border-primary/30 flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-[10px] text-primary/60 font-medium">Repayment starts</p>
                        <p className="font-bold text-sm text-primary">
                          {format(addDays(new Date(), 1), 'EEEE, MMMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}

              {incomeType !== 'outstanding' && (
              <>
              <Separator />

              {/* ===== 2. TENANT DETAILS ===== */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Tenant Details
                </h4>

                {/* No Smartphone Toggle */}
                <button
                  type="button"
                  onClick={() => setNoSmartphone(!noSmartphone)}
                  className={`w-full p-3 rounded-xl border-2 transition-all text-left flex items-center gap-3 ${
                    noSmartphone 
                      ? 'border-warning/50 bg-warning/10' 
                      : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                    noSmartphone ? 'bg-warning border-warning' : 'border-muted-foreground/40'
                  }`}>
                    {noSmartphone && <CheckCircle2 className="h-3.5 w-3.5 text-warning-foreground" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Tenant has no smartphone</p>
                    <p className="text-xs text-muted-foreground">
                      {noSmartphone 
                        ? '⚠️ Your wallet will be charged for all repayments' 
                        : 'Check if tenant cannot manage their own wallet'}
                    </p>
                  </div>
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="tenantName" className="text-xs">Full Name *</Label>
                    <Input
                      id="tenantName"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      placeholder="Tenant's name"
                      className="h-10"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tenantPhone" className="text-xs">Phone *</Label>
                    <Input
                      id="tenantPhone"
                      value={tenantPhone}
                      onChange={(e) => setTenantPhone(formatPhoneInput(e.target.value))}
                      placeholder="0783 123 456"
                      className={`h-10 ${hasFieldError('tenant phone') ? 'border-destructive border-2' : ''}`}
                      maxLength={12}
                      required
                    />
                    {tenantPhone.replace(/\s/g, '').length >= 10 && !isValidUgPhone(tenantPhone.replace(/\s/g, '')) && (
                      <p className="text-[10px] text-destructive">Invalid Ugandan phone number</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="tenantNationalId" className="text-xs">National ID *</Label>
                  <Input
                    id="tenantNationalId"
                    value={tenantNationalId}
                    onChange={(e) => setTenantNationalId(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                    placeholder="e.g. CM12345678901"
                    className="h-10 font-mono uppercase"
                    maxLength={14}
                    required
                  />
                  {tenantNationalId.length > 0 && (tenantNationalId.length < 10 || tenantNationalId.length > 14) && (
                    <p className="text-[10px] text-destructive">Must be 10-14 characters</p>
                  )}
                </div>

                {/* Tenant passport photo (required) */}
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    🪪 Tenant Passport Photo *
                  </Label>
                  <div className="flex items-start gap-3">
                    {tenantPhoto ? (
                      <div className="relative h-24 w-20 rounded-lg overflow-hidden border border-border shrink-0">
                        <img src={tenantPhoto.preview} alt="Tenant" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={removeTenantPhoto}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <label className="h-24 w-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors shrink-0">
                        <span className="text-xl text-muted-foreground/60">📷</span>
                        <span className="text-[10px] text-muted-foreground/60 mt-0.5">Capture</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="user"
                          className="hidden"
                          onChange={handleTenantPhoto}
                        />
                      </label>
                    )}
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Take a clear, well-lit photo of the tenant's face (passport-style). Landlord Ops uses this to verify the tenant during review.
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Preferred Language *</Label>
                  <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select tenant language" />
                    </SelectTrigger>
                    <SelectContent>
                      {PREFERRED_LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* ===== 3. HOUSE CATEGORY ===== */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Home className="h-3 w-3" />
                  House Category *
                </h4>
                <Select value={houseCategory} onValueChange={setHouseCategory}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select house type" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUSE_CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.emoji} {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* ===== 4. LANDLORD DETAILS ===== */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Landlord Details
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name *</Label>
                    <Input
                      value={landlordName}
                      onChange={(e) => setLandlordName(e.target.value)}
                      placeholder="Landlord name"
                      className="h-10"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone *</Label>
                    <Input
                      value={landlordPhone}
                      onChange={(e) => setLandlordPhone(formatPhoneInput(e.target.value))}
                      placeholder="0700 123 456"
                      className={`h-10 ${hasFieldError('landlord phone') ? 'border-destructive border-2' : ''}`}
                      maxLength={12}
                      required
                    />
                    {landlordPhone.replace(/\s/g, '').length >= 10 && !isValidUgPhone(landlordPhone.replace(/\s/g, '')) && (
                      <p className="text-[10px] text-destructive">Invalid Ugandan phone number</p>
                    )}
                    {landlordPhone.replace(/\s/g, '').length >= 10 &&
                      tenantPhone.replace(/\s/g, '').length >= 10 &&
                      landlordPhone.replace(/\s/g, '') === tenantPhone.replace(/\s/g, '') && (
                        <p className="text-[10px] text-destructive">Cannot be the same as Tenant phone</p>
                      )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Property Address *
                  </Label>
                  <Input
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                    placeholder="Full property address"
                    className="h-10"
                    required
                  />
                </div>

                {/* GPS Capture */}
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Navigation className="h-3 w-3" /> Property GPS
                  </Label>
                  {gpsLocation ? (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-success/10 border border-success/30">
                      <Navigation className="h-4 w-4 text-success flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-success">📍 GPS Captured</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {gpsLocation.lat.toFixed(5)}, {gpsLocation.lng.toFixed(5)} (±{Math.round(gpsLocation.accuracy)}m)
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 px-2"
                        onClick={captureGPS}
                      >
                        Retake
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-10 gap-2 border-dashed"
                      onClick={captureGPS}
                      disabled={gpsLoading}
                    >
                      {gpsLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Getting GPS...
                        </>
                      ) : (
                        <>
                          <Navigation className="h-4 w-4" />
                          Capture Property GPS
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {/* House Photos (max 3) */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1">
                    📸 House Photos (up to 3)
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {housePhotos.map((photo, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-border">
                        <img src={photo.preview} alt={`House ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {housePhotos.length < 3 && (
                      <label className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                        <span className="text-xl text-muted-foreground/50">📷</span>
                        <span className="text-[10px] text-muted-foreground/50 mt-1">Add Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={handlePhotoAdd}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* ===== 5. LC1 DETAILS ===== */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  LC1 Chairperson Details
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name *</Label>
                    <Input
                      value={lc1Name}
                      onChange={(e) => setLc1Name(e.target.value)}
                      placeholder="LC1 name"
                      className="h-10"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone *</Label>
                    <Input
                      value={lc1Phone}
                      onChange={(e) => setLc1Phone(formatPhoneInput(e.target.value))}
                      placeholder="0700 123 456"
                      className={`h-10 ${hasFieldError('lc1 phone') ? 'border-destructive border-2' : ''}`}
                      maxLength={12}
                      required
                    />
                    {lc1Phone.replace(/\s/g, '').length >= 10 &&
                      tenantPhone.replace(/\s/g, '').length >= 10 &&
                      lc1Phone.replace(/\s/g, '') === tenantPhone.replace(/\s/g, '') && (
                        <p className="text-[10px] text-destructive">Cannot be the same as Tenant phone</p>
                      )}
                    {lc1Phone.replace(/\s/g, '').length >= 10 &&
                      landlordPhone.replace(/\s/g, '').length >= 10 &&
                      lc1Phone.replace(/\s/g, '') === landlordPhone.replace(/\s/g, '') && (
                        <p className="text-[10px] text-destructive">Cannot be the same as Landlord phone</p>
                      )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Village *</Label>
                    <Input
                      value={lc1Village}
                      onChange={(e) => setLc1Village(e.target.value)}
                      placeholder="Village"
                      className="h-10"
                      required
                    />
                  </div>
                </div>

                {/* Town/City + District — keeps tenant rolled up under a real
                    location in Tenant Ops drill-down instead of the
                    "Entebbe (please verify)" placeholder. */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Town / City *
                    </Label>
                    <Input
                      value={propertyCity}
                      onChange={(e) => setPropertyCity(e.target.value)}
                      placeholder="e.g. Entebbe, Kampala, Jinja"
                      className={`h-10 ${hasFieldError('city') ? 'border-destructive border-2' : ''}`}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">District</Label>
                    <Input
                      value={propertyDistrict}
                      onChange={(e) => setPropertyDistrict(e.target.value)}
                      placeholder="e.g. Wakiso"
                      className="h-10"
                    />
                  </div>
                </div>
              </div>

              {/* Landlord auto-payout day */}
              <div className="space-y-1 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <Label className="text-xs flex items-center gap-1 font-semibold">
                  <Calendar className="h-3 w-3" /> Landlord payout day (1–28) *
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={landlordPayoutDay}
                  onChange={(e) => setLandlordPayoutDay(e.target.value)}
                  placeholder="e.g. 5"
                  className="h-10"
                  required
                />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Welile will automatically credit the landlord wallet with UGX{' '}
                  {(parseInt(rentAmount.replace(/,/g, '')) || 0).toLocaleString()} on day{' '}
                  <span className="font-semibold text-foreground">{landlordPayoutDay || '–'}</span>{' '}
                  of every month, regardless of when the tenant pays.
                </p>
              </div>

              <GuarantorConsentCheckbox checked={guarantorConsent} onCheckedChange={setGuarantorConsent} />

              {/* Validation Error Summary */}
              {validationErrors.length > 0 && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 space-y-1">
                  <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Please fix the following:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {validationErrors.map((err, i) => (
                      <li key={i} className="text-[11px] text-destructive">{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {submissionError && validationErrors.length === 0 && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs font-medium text-destructive flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{submissionError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => { setStep('type'); setValidationErrors([]); }}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button 
                  onClick={handleSubmit} 
                  className="flex-1"
                  disabled={loading || !amount || amount < 50000}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Request'
                  )}
                </Button>
              </div>
              </>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </DialogContent>
      <RegisterLandlordDialog
        open={showRegisterLandlord}
        onOpenChange={setShowRegisterLandlord}
        minimal={incomeType === 'outstanding'}
        onSuccess={() => {
          setShowRegisterLandlord(false);
          // Force the search popover to re-fetch fresh results.
          setLandlordPickerKey((k) => k + 1);
          toast.success('Landlord registered. Search to select them now.');
        }}
      />
    </Dialog>
  );
}

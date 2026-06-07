import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Home, MapPin, Loader2, ShieldCheck, Search, X, UserCheck, Share2, MessageCircle, Copy, Check, PartyPopper, ChevronDown, ArrowLeft, ArrowRight, Camera, Trophy, Sparkles } from 'lucide-react';
import { PhoneInput } from '@/components/ui/phone-input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { calculateDailyRentalRate } from '@/hooks/useHouseListings';
import { useGeolocation } from '@/hooks/useGeolocation';
import { captureSmartLocation } from '@/hooks/useSmartLocation';
import { reverseGeocode } from '@/lib/reverseGeocode';
import { HouseImageUploader, uploadHouseImages, type HouseImageFile } from './HouseImageUploader';
import { MapPinPicker } from './MapPinPicker';
import { Lc1ChairpersonPicker, validateLc1Selection, type Lc1Selection } from './Lc1ChairpersonPicker';
import { isValidPhoneNumberGlobal } from '@/lib/phoneUtils';

const APP_URL = 'https://welilereceipts.com';
const OG_FUNCTION_URL = 'https://wirntoujqoyjobfhyelc.supabase.co/functions/v1/og-house';

interface ListEmptyHouseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Pre-fill the landlord fields (e.g. when opened from the landlord registration form). */
  initialLandlordName?: string;
  initialLandlordPhone?: string;
  /** When true, shows promotional campaign badge and applies promo defaults (opened from the agent dashboard banner). */
  fromPromoBanner?: boolean;
}

const HOUSE_CATEGORIES = [
  { value: 'single_room', label: 'Single Room', emoji: '🚪' },
  { value: 'double_room', label: 'Double Room', emoji: '🚪🚪' },
  { value: 'bedsitter', label: 'Bedsitter', emoji: '🛏️' },
  { value: 'one_bedroom', label: '1 Bedroom', emoji: '🏠' },
  { value: 'two_bedroom', label: '2 Bedrooms', emoji: '🏡' },
  { value: 'three_bedroom', label: '3 Bedrooms', emoji: '🏘️' },
  { value: 'studio', label: 'Studio', emoji: '🎨' },
  { value: 'shop', label: 'Shop', emoji: '🏪' },
];

const REGIONS = [
  'Central', 'Eastern', 'Northern', 'Western',
  'Kampala', 'Wakiso', 'Mukono', 'Jinja', 'Mbale',
  'Mbarara', 'Gulu', 'Lira', 'Fort Portal', 'Masaka',
  'Entebbe', 'Nansana', 'Kira', 'Bweyogerere',
];

import { normalizeDistrict, districtWarning, regionLabel } from '@/lib/ugandaDistricts';

export function ListEmptyHouseDialog({ open, onOpenChange, onSuccess, initialLandlordName, initialLandlordPhone, fromPromoBanner = false }: ListEmptyHouseDialogProps) {
  const geo = useGeolocation(true);
  // One-tap GPS auto-fill (capture coordinates + reverse-geocode to region/district/village).
  const [gpsFilling, setGpsFilling] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  // Map pin picker so the agent can correct the spot before auto-filling.
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [mapInitial, setMapInitial] = useState<{ latitude: number; longitude: number }>({
    latitude: 0.3476,
    longitude: 32.5825,
  });
  const position = gpsCoords
    ?? (geo.latitude && geo.longitude ? { latitude: geo.latitude, longitude: geo.longitude } : null);
  const [submitting, setSubmitting] = useState(false);
  const [houseImages, setHouseImages] = useState<HouseImageFile[]>([]);
  // Guided wizard step (1-4) so agents who struggle with long forms only see
  // one simple question at a time.
  const [step, setStep] = useState(1);
  // LC1 chairperson: search-first selection or a brand-new registration.
  const [lc1Selection, setLc1Selection] = useState<Lc1Selection | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  // Landlord phone real-time validation error
  const [landlordPhoneError, setLandlordPhoneError] = useState<string>('');
  const [successListing, setSuccessListing] = useState<null | {
    id: string;
    shortCode: string | null;
    title: string;
    region: string;
    dailyRate: number;
  }>(null);
  const [copied, setCopied] = useState(false);
  // ─── Landlord search-first flow ───
  // Agents must search the system for the landlord (by verified name) before
  // listing, so houses link to an existing verified landlord instead of
  // creating duplicates.
  type LandlordHit = {
    id: string;
    name: string;
    phone: string;
    verified: boolean;
    verifiedHouses: number;
  };
  const [landlordQuery, setLandlordQuery] = useState('');
  const [landlordResults, setLandlordResults] = useState<LandlordHit[]>([]);
  const [searchingLandlord, setSearchingLandlord] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [selectedLandlord, setSelectedLandlord] = useState<LandlordHit | null>(null);
  const [manualLandlord, setManualLandlord] = useState(false);
  // Auto-fill: the agent's most recently used landlord (remembered locally) and
  // a flag noting that location/area was pre-filled from the agent profile.
  const [lastLandlord, setLastLandlord] = useState<LandlordHit | null>(null);
  const [prefilledFromProfile, setPrefilledFromProfile] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    house_category: 'single_room',
    number_of_rooms: 1,
    monthly_rent: '',
    region: '',
    district: '',
    address: '',
    village: '',
    landlord_name: '',
    landlord_phone: '',
    landlord_has_smartphone: true,
    has_water: false,
    has_electricity: false,
    has_security: false,
    has_parking: false,
    is_furnished: false,
    // Caretaker
    caretaker_type: 'none' as 'none' | 'self' | 'other',
    caretaker_name: '',
    caretaker_phone: '',
    // LC1 Chairperson
    lc1_name: '',
    lc1_phone: '',
    lc1_village: '',
  });

  // Pre-fill landlord details when the dialog opens from the landlord form.
  useEffect(() => {
    if (open && (initialLandlordName || initialLandlordPhone)) {
      setForm((f) => ({
        ...f,
        landlord_name: initialLandlordName ?? f.landlord_name,
        landlord_phone: initialLandlordPhone ?? f.landlord_phone,
      }));
      // Treat a pre-filled landlord (from the registration form) as a manual
      // new-landlord entry so the search-first gate is satisfied.
      setManualLandlord(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialLandlordName, initialLandlordPhone]);

  // Promo banner mode: pre-apply empty-house defaults and show campaign badge.
  useEffect(() => {
    if (open && fromPromoBanner) {
      setForm((f) => ({ ...f, is_furnished: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fromPromoBanner]);

  // ─── Auto-fill from the agent profile (location/area) + remember last landlord ───
  // Runs once each time the dialog opens so an agent who works in one area can
  // list a house with almost no typing.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // 1) Pre-fill the house location + LC1 area from the agent's profile.
      const { data: prof } = await supabase
        .from('profiles')
        .select('region, district, village')
        .eq('id', user.id)
        .maybeSingle();
      if (prof && !cancelled) {
        const filledSomething = !!(prof.region || prof.district || prof.village);
        setForm((f) => ({
          ...f,
          region: f.region || prof.region || '',
          district: f.district || prof.district || '',
          village: f.village || prof.village || '',
          lc1_village: f.lc1_village || prof.village || '',
        }));
        if (filledSomething) setPrefilledFromProfile(true);
      }

      // 2) Remember the agent's most recently used landlord for one-tap reuse.
      try {
        const raw = localStorage.getItem(`welile_last_landlord_${user.id}`);
        if (raw && !cancelled) setLastLandlord(JSON.parse(raw) as LandlordHit);
      } catch {
        /* ignore corrupt cache */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const monthlyRent = parseInt(form.monthly_rent) || 0;
  const pricing = calculateDailyRentalRate(monthlyRent);

  // ─── Search the system for a landlord by verified name (or phone) ───
  const searchLandlords = async () => {
    const q = landlordQuery.trim();
    if (q.length < 2) {
      toast.error('Type at least 2 letters of the landlord name');
      return;
    }
    setSearchingLandlord(true);
    setSearchedOnce(true);
    try {
      const isPhone = /^[0-9+]/.test(q);
      let query = supabase
        .from('landlords')
        .select('id, name, phone, verified')
        .order('verified', { ascending: false })
        .limit(10);
      query = isPhone ? query.ilike('phone', `%${q}%`) : query.ilike('name', `%${q}%`);
      const { data: landlords, error } = await query;
      if (error) throw error;

      const ids = (landlords || []).map((l) => l.id);
      // Count verified houses per landlord so the agent can confirm the match.
      const counts: Record<string, number> = {};
      if (ids.length) {
        const { data: houses } = await supabase
          .from('house_listings')
          .select('landlord_id')
          .in('landlord_id', ids)
          .eq('verified', true);
        for (const h of houses || []) {
          if (h.landlord_id) counts[h.landlord_id] = (counts[h.landlord_id] || 0) + 1;
        }
      }

      // A landlord is "verified" (and therefore trustworthy to list against) if
      // either their landlord record is verified OR they already have at least
      // one verified house in the system. Landlords do NOT need to be app users
      // — every landlord in the system is searchable.
      const hits: LandlordHit[] = (landlords || []).map((l) => {
        const verifiedHouses = counts[l.id] || 0;
        return {
          id: l.id,
          name: l.name,
          phone: l.phone,
          verified: !!l.verified || verifiedHouses > 0,
          verifiedHouses,
        };
      });
      // Surface verified landlords (and those with verified houses) first.
      hits.sort((a, b) => {
        if (a.verified !== b.verified) return a.verified ? -1 : 1;
        return b.verifiedHouses - a.verifiedHouses;
      });
      setLandlordResults(hits);
    } catch (err: any) {
      console.error('[ListEmptyHouseDialog] landlord search failed:', err);
      toast.error('Could not search landlords');
    } finally {
      setSearchingLandlord(false);
    }
  };

  const selectLandlord = (hit: LandlordHit) => {
    setSelectedLandlord(hit);
    setManualLandlord(false);
    setForm((f) => ({ ...f, landlord_name: hit.name, landlord_phone: hit.phone }));
  };

  const clearLandlordSelection = () => {
    setSelectedLandlord(null);
    setForm((f) => ({ ...f, landlord_name: '', landlord_phone: '' }));
    setLandlordPhoneError('');
  };

  // Strict landlord phone validation with user-friendly messages.
  const validateLandlordPhone = (phone: string): string => {
    const trimmed = phone.trim();
    if (!trimmed) return 'Landlord phone number is required';

    const global = isValidPhoneNumberGlobal(trimmed);
    if (!global.valid) return global.reason || 'Phone number looks invalid';

    // Uganda-specific checks
    const cleaned = trimmed.replace(/\D/g, '');
    const isUgandaFormat =
      trimmed.startsWith('+256') ||
      trimmed.startsWith('256') ||
      trimmed.startsWith('0');

    if (!isUgandaFormat) {
      return 'Please use a Ugandan number starting with 07, 08, 09 or +256';
    }

    const national = cleaned.startsWith('256') ? cleaned.slice(3) : cleaned.startsWith('0') ? cleaned.slice(1) : cleaned;
    if (national.length !== 9) {
      return `Phone number should have 9 digits after the country code (found ${national.length})`;
    }

    // Uganda mobile prefixes: 70-79
    if (!national.startsWith('7') && !national.startsWith('8') && !national.startsWith('9')) {
      return 'Please use a valid Uganda mobile number (starting with 07, 08 or 09)';
    }

    return '';
  };

  // ─── One-tap GPS: capture current location and auto-fill region/district/village ───
  const matchRegion = (candidates: (string | undefined)[]): string => {
    for (const c of candidates) {
      if (!c) continue;
      const lc = c.toLowerCase().replace(/\s+region$/, '').trim();
      const hit = REGIONS.find((r) => {
        const rl = r.toLowerCase();
        return lc === rl || lc.includes(rl) || rl.includes(lc);
      });
      if (hit) return hit;
    }
    return '';
  };

  // Reverse-geocode a confirmed pin position and fill region/district/village.
  const fillFromCoords = async (coords: { latitude: number; longitude: number }) => {
    setGpsCoords(coords);
    setGpsFilling(true);
    try {
      const geocoded = await reverseGeocode(coords.latitude, coords.longitude);
      const addr = (geocoded?.raw as any)?.address as Record<string, string> | undefined;
      if (!addr) {
        toast.success('Pin saved — type the area manually if needed');
        return;
      }
      const region = matchRegion([addr.city, addr.county, addr.state_district, addr.state]);
      const rawDistrict = addr.county || addr.state_district || addr.city || '';
      const district = normalizeDistrict(rawDistrict) || rawDistrict;
      const village =
        addr.village || addr.suburb || addr.neighbourhood || addr.hamlet || addr.quarter || '';
      setForm((f) => ({
        ...f,
        region: region || f.region,
        district: district || f.district,
        village: village || f.village,
        lc1_village: village || f.lc1_village,
      }));
      setPrefilledFromProfile(false);
      toast.success('Location filled from the pin 📍');
    } finally {
      setGpsFilling(false);
    }
  };

  // Capture GPS, then open the map so the agent can drag the pin before filling.
  const autoFillFromGps = async () => {
    setGpsFilling(true);
    try {
      const res = await captureSmartLocation();
      if (res.ok !== true) {
        toast.error(res.message || 'Could not get your location');
        return;
      }
      setMapInitial({ latitude: res.latitude, longitude: res.longitude });
      setMapPickerOpen(true);
    } finally {
      setGpsFilling(false);
    }
  };

  const scrollDialogToTop = () => {
    requestAnimationFrame(() => {
      document
        .querySelector('[role="dialog"]')
        ?.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  // ─── Guided wizard navigation ───
  const TOTAL_STEPS = 2;
  const STEP_LABELS = ['House & photos', 'Landlord & list'];

  // Validate just the current step before moving forward. Returns true if OK.
  const validateStep = (s: number): boolean => {
    if (s === 1) {
      // Essentials only: rent, region and at least one photo.
      if (!monthlyRent || monthlyRent < 10000) {
        toast.error('Monthly rent must be at least UGX 10,000');
        return false;
      }
      if (!form.region) {
        toast.error('Please select a region');
        return false;
      }
      if (houseImages.length === 0) {
        toast.error('Add at least one photo of the house');
        return false;
      }
    }
    if (s === 2) {
      // Landlord phone is mandatory — every listing must carry a reachable landlord number.
      const phoneErr = validateLandlordPhone(form.landlord_phone);
      if (phoneErr) {
        toast.error(phoneErr);
        setLandlordPhoneError(phoneErr);
        return false;
      }
      if (form.caretaker_type === 'other' && (!form.caretaker_name.trim() || !form.caretaker_phone.trim())) {
        toast.error('Enter the caretaker name and phone');
        return false;
      }
      if (lc1Selection) {
        const lc1Err = validateLc1Selection(lc1Selection);
        if (lc1Err) {
          toast.error(lc1Err);
          return false;
        }
      }
    }
    return true;
  };

  const goNext = () => {
    setAttempted(true);
    if (!validateStep(step)) {
      scrollDialogToTop();
      return;
    }
    setAttempted(false);
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
    scrollDialogToTop();
  };

  const goBack = () => {
    setStep((s) => Math.max(1, s - 1));
    scrollDialogToTop();
  };

  // ─── Preflight gate check ───
  // Compute every MANDATORY requirement up front so the agent can see at a
  // glance exactly what is still missing (and on which step) before they can
  // submit. Each gate carries the wizard step the agent should go back to.
  type PreflightGate = { label: string; ok: boolean; hint: string; step: number };
  const caretakerOk = form.caretaker_type !== 'other' || (!!form.caretaker_name.trim() && !!form.caretaker_phone.trim());
  // LC1 is optional — only flag it as incomplete once the agent starts filling it in.
  const lc1PartialErr = lc1Selection ? validateLc1Selection(lc1Selection) : null;
  const preflightGates: PreflightGate[] = [
    { label: 'Monthly rent (min UGX 10,000)', ok: !!monthlyRent && monthlyRent >= 10000, hint: 'Enter a monthly rent of at least UGX 10,000', step: 1 },
    { label: 'Region selected', ok: !!form.region, hint: 'Choose the region', step: 1 },
    { label: 'At least one photo', ok: houseImages.length > 0, hint: 'Add at least one photo of the house', step: 1 },
  ];
  preflightGates.push({ label: 'Landlord phone number', ok: !validateLandlordPhone(form.landlord_phone), hint: landlordPhoneError || 'Add a valid Ugandan phone number (e.g. 0771234567)', step: 2 });
  if (form.caretaker_type === 'other') {
    preflightGates.push({ label: 'Caretaker details', ok: caretakerOk, hint: 'Enter the caretaker name and phone', step: 2 });
  }
  if (lc1Selection) {
    preflightGates.push({ label: 'LC1 chairperson details', ok: !lc1PartialErr, hint: lc1PartialErr || 'Complete the LC1 chairperson details', step: 2 });
  }
  const missingGates = preflightGates.filter((g) => !g.ok);
  const allGatesPass = missingGates.length === 0;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    // If the form is submitted (e.g. Enter key) before the last step, just
    // advance the wizard instead of running full validation.
    if (step < TOTAL_STEPS) {
      goNext();
      return;
    }
    setAttempted(true);

    const failWith = (msg: string) => {
      toast.error(msg);
      scrollDialogToTop();
    };

    if (!monthlyRent || monthlyRent < 10000) {
      failWith('Monthly rent must be at least UGX 10,000');
      return;
    }
    if (!form.region) {
      failWith('Please select a region');
      return;
    }
    if (houseImages.length === 0) {
      failWith('Add at least one photo of the house');
      return;
    }
    // Landlord phone is mandatory for every listing.
    if (!form.landlord_phone.trim()) {
      failWith('Landlord phone number is required');
      return;
    }
    if (form.caretaker_type === 'other' && (!form.caretaker_name.trim() || !form.caretaker_phone.trim())) {
      failWith('Enter the caretaker name and phone');
      return;
    }
    // LC1 is optional — only validate if the agent began filling it in.
    if (lc1Selection) {
      const lc1Err = validateLc1Selection(lc1Selection);
      if (lc1Err) { failWith(lc1Err); return; }
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Try to find or create landlord reference
      let landlordId: string | null = null;
      if (selectedLandlord?.id) {
        // Agent picked an existing landlord from the system search — link directly.
        landlordId = selectedLandlord.id;
      } else if (form.landlord_phone) {
        const normalizedPhone = form.landlord_phone.trim();
        const { data: landlord } = await supabase
          .from('landlords')
          .select('id')
          .eq('phone', normalizedPhone)
          .maybeSingle();

        if (landlord?.id) {
          landlordId = landlord.id;
        } else if (form.landlord_name.trim()) {
          // Landlord doesn't exist yet — create one so the listing links properly
          const { data: newLandlord } = await supabase
            .from('landlords')
            .insert({
              name: form.landlord_name.trim(),
              phone: normalizedPhone,
              has_smartphone: form.landlord_has_smartphone,
              property_address: form.address || null,
              village: form.village || null,
              district: form.district || null,
              region: form.region || null,
            })
            .select('id')
            .single();
          landlordId = newLandlord?.id || null;
        }
      }

      // Determine caretaker details
      const isAgentCaretaker = form.caretaker_type === 'self';
      const caretakerUserId = isAgentCaretaker ? user.id : null;
      const caretakerName = form.caretaker_type === 'other' ? form.caretaker_name : (isAgentCaretaker ? null : null);
      const caretakerPhone = form.caretaker_type === 'other' ? form.caretaker_phone : null;

      const { data: listing, error } = await supabase
        .from('house_listings')
        .insert({
          agent_id: user.id,
          landlord_id: landlordId,
          title: form.title || `${HOUSE_CATEGORIES.find(c => c.value === form.house_category)?.label} in ${form.region}`,
          description: form.description || null,
          house_category: form.house_category,
          number_of_rooms: form.number_of_rooms,
          monthly_rent: monthlyRent,
          daily_rate: pricing.dailyRate,
          access_fee: pricing.accessFee,
          platform_fee: pricing.platformFee,
          total_monthly_cost: pricing.totalMonthlyCost,
          region: form.region,
          district: form.district || null,
          address: form.address,
          latitude: position?.latitude || null,
          longitude: position?.longitude || null,
          has_water: form.has_water,
          has_electricity: form.has_electricity,
          has_security: form.has_security,
          has_parking: form.has_parking,
          is_furnished: form.is_furnished,
          // Caretaker fields
          landlord_has_smartphone: form.landlord_has_smartphone,
          is_agent_caretaker: isAgentCaretaker,
          caretaker_user_id: caretakerUserId,
          caretaker_name: caretakerName,
          caretaker_phone: caretakerPhone,
          // LC1 fields
          lc1_chairperson_name: lc1Selection?.name ?? null,
          lc1_chairperson_phone: lc1Selection?.phone ?? null,
          lc1_chairperson_village: lc1Selection?.village || form.village || null,
        } as any)
        .select('id')
        .single();

      if (error) throw error;

      // Remember this landlord locally so the next listing can reuse them in one tap.
      try {
        const remembered: LandlordHit | null = selectedLandlord
          ? selectedLandlord
          : (landlordId && form.landlord_name.trim())
            ? { id: landlordId, name: form.landlord_name.trim(), phone: form.landlord_phone.trim(), verified: false, verifiedHouses: 0 }
            : null;
        if (remembered) {
          localStorage.setItem(`welile_last_landlord_${user.id}`, JSON.stringify(remembered));
          setLastLandlord(remembered);
        }
      } catch {
        /* non-critical */
      }

      // Instant UGX 1,000 listing reward → agent withdrawable wallet (best-effort,
      // never blocks listing). The remaining UGX 4,000 is auto-paid when Landlord
      // Ops verifies the house.
      if (listing?.id) {
        supabase.functions
          .invoke('credit-house-listed-bonus', { body: { listing_id: listing.id } })
          .catch((e) => console.warn('[ListEmptyHouseDialog] instant listing bonus failed:', e));
      }

      // ─── LC1 chairperson persistence + two-stage reward ───
      // Existing LC1 (picked from search) → nothing to insert, no bonus.
      // New LC1 (agent registering) → insert with registered_by = agent and
      // trigger the UGX 1,000 instant reward. The remaining UGX 4,000 is auto-
      // paid by `credit-lc1-verification-bonus` once Landlord Ops verifies.
      if (lc1Selection?.mode === 'new') {
        try {
          const lc1Phone = lc1Selection.phone.trim();
          const lc1Village = lc1Selection.village.trim();
          // Guard against duplicates (and double-paying) if the agent skipped the
          // search: reuse an existing row when phone+village already matches.
          const { data: existingLc1 } = await supabase
            .from('lc1_chairpersons')
            .select('id, registered_by')
            .eq('phone', lc1Phone)
            .eq('village', lc1Village)
            .maybeSingle();

          let lc1Id = existingLc1?.id ?? null;
          if (lc1Id) {
            if (!existingLc1?.registered_by) {
              await supabase
                .from('lc1_chairpersons')
                .update({ registered_by: user.id } as any)
                .eq('id', lc1Id);
            }
          } else {
            const { data: createdLc1, error: lc1InsertErr } = await supabase
              .from('lc1_chairpersons')
              .insert({
                name: lc1Selection.name.trim(),
                phone: lc1Phone,
                village: lc1Village,
                region: lc1Selection.region || null,
                district: lc1Selection.district || null,
                county: lc1Selection.county || null,
                sub_county: lc1Selection.sub_county || null,
                parish: lc1Selection.parish || null,
                town_council: lc1Selection.town_council || null,
                cell: lc1Selection.cell || null,
                zone: lc1Selection.zone || null,
                registered_by: user.id,
              } as any)
              .select('id')
              .single();
            if (lc1InsertErr) throw lc1InsertErr;
            lc1Id = createdLc1?.id ?? null;
          }

          // Instant UGX 1,000 LC1-registration reward (best-effort, idempotent).
          if (lc1Id) {
            supabase.functions
              .invoke('credit-lc1-registered-bonus', { body: { lc1_id: lc1Id } })
              .catch((e) => console.warn('[ListEmptyHouseDialog] instant LC1 reward failed:', e));
          }
        } catch (lc1Err) {
          console.warn('[ListEmptyHouseDialog] LC1 registration warning:', lc1Err);
        }
      }

      // Upload images if any
      if (houseImages.length > 0 && listing) {
        const urls = await uploadHouseImages(
          user.id,
          listing.id,
          houseImages.map(i => i.file)
        );
        if (urls.length > 0) {
          await supabase
            .from('house_listings')
            .update({ image_urls: urls } as any)
            .eq('id', listing.id);
        }
      }

      toast.success('House listed successfully!', {
        description: `UGX 1,000 sent to your wallet now · earn UGX 4,000 more when Landlord Ops verifies this house (UGX 5,000 total)`,
      });
      onSuccess?.();

      // Fetch short_code (generated by DB trigger) so the share link is friendly
      const { data: created } = await supabase
        .from('house_listings')
        .select('id, short_code, title, region, daily_rate')
        .eq('id', listing.id)
        .maybeSingle();

      setSuccessListing({
        id: listing.id,
        shortCode: (created as any)?.short_code ?? null,
        title: (created as any)?.title || form.title || `${HOUSE_CATEGORIES.find(c => c.value === form.house_category)?.label} in ${form.region}`,
        region: form.region,
        dailyRate: pricing.dailyRate,
      });
      houseImages.forEach(i => URL.revokeObjectURL(i.previewUrl));
      setHouseImages([]);
      setAttempted(false);
    } catch (err: any) {
      console.error('[ListEmptyHouseDialog] submit failed:', err);
      toast.error(err?.message || 'Failed to list house');
      scrollDialogToTop();
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({
      title: '', description: '', house_category: 'single_room',
      number_of_rooms: 1, monthly_rent: '', region: '', district: '',
      address: '', village: '', landlord_name: '', landlord_phone: '',
      landlord_has_smartphone: true,
      has_water: false, has_electricity: false, has_security: false,
      has_parking: false, is_furnished: false,
      caretaker_type: 'none', caretaker_name: '', caretaker_phone: '',
      lc1_name: '', lc1_phone: '', lc1_village: '',
    });
    setLc1Selection(null);
    setShowOptional(false);
    setLandlordQuery('');
    setLandlordResults([]);
    setSearchedOnce(false);
    setSelectedLandlord(null);
    setManualLandlord(false);
    setPrefilledFromProfile(false);
    setStep(1);
  };

  const buildShare = () => {
    if (!successListing) return { url: '', message: '', ogUrl: '' };
    const ref = successListing.shortCode || successListing.id;
    const url = `${APP_URL}/house/${ref}`;
    const ogUrl = successListing.shortCode
      ? `${OG_FUNCTION_URL}?c=${successListing.shortCode}`
      : `${OG_FUNCTION_URL}?id=${successListing.id}`;
    const message = `🏠 New rental on Welile!\n\n*${successListing.title}*\n📍 ${successListing.region}\n💰 ${formatUGX(successListing.dailyRate)}/day\n\n👉 ${ogUrl}`;
    return { url, message, ogUrl };
  };

  const handleWhatsApp = () => {
    const { message } = buildShare();
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleCopy = async () => {
    const { message } = buildShare();
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success('Link copied — paste anywhere to share');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy');
    }
  };

  const handleNativeShare = async () => {
    const { url, message } = buildShare();
    if (navigator.share) {
      try { await navigator.share({ title: successListing?.title || 'House on Welile', text: message, url }); } catch {}
    } else {
      handleCopy();
    }
  };

  const closeAll = () => {
    setSuccessListing(null);
    resetForm();
    onOpenChange(false);
  };

  const listAnother = () => {
    setSuccessListing(null);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) closeAll(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {successListing ? (
          <div className="space-y-5 py-2">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-full bg-success/15 flex items-center justify-center">
                <PartyPopper className="h-7 w-7 text-success" />
              </div>
              <DialogTitle className="text-xl">House listed!</DialogTitle>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">UGX 1,000</span> is on its way to your wallet now.
                You earn <span className="font-semibold text-foreground">UGX 4,000</span> more once Landlord Ops verifies
                this house — <span className="font-semibold text-foreground">UGX 5,000</span> in total.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1">
              <p className="font-semibold text-sm truncate">{successListing.title}</p>
              <p className="text-xs text-muted-foreground">
                📍 {successListing.region} · 💰 {formatUGX(successListing.dailyRate)}/day
              </p>
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                onClick={handleWhatsApp}
                className="w-full h-12 bg-[#25D366] hover:bg-[#1FB955] text-white"
              >
                <MessageCircle className="h-5 w-5 mr-2" />
                Share on WhatsApp
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={handleCopy} className="h-11">
                  {copied ? <Check className="h-4 w-4 mr-2 text-success" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
                <Button type="button" variant="outline" onClick={handleNativeShare} className="h-11">
                  <Share2 className="h-4 w-4 mr-2" />
                  More
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={listAnother}>List another</Button>
              <Button type="button" variant="secondary" onClick={closeAll}>Done</Button>
            </div>
          </div>
        ) : (
        <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            List Empty House
          </DialogTitle>
          <DialogDescription>
            Register an available rental · Earn UGX 5,000 when a tenant is placed
          </DialogDescription>
        </DialogHeader>

        {/* Promotional campaign badge when opened from the agent dashboard banner */}
        {fromPromoBanner && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
              <Trophy className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-emerald-700 leading-tight">
                Weekly Prize Campaign
              </p>
              <p className="text-xs text-emerald-600/80 leading-snug">
                This listing counts toward the UGX 70,000 prize. Register 10 landlords with empty houses to win.
              </p>
            </div>
            <div className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-400/25">
              <Sparkles className="h-3 w-3 text-amber-600" />
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Promo</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Progress stepper — big, visual, minimal reading */}
          <div className="flex items-center gap-1.5">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              const active = n === step;
              const done = n < step;
              return (
                <div key={label} className="flex-1 text-center">
                  <div
                    className={`mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      done
                        ? 'bg-success text-success-foreground'
                        : active
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {done ? <Check className="h-4 w-4" /> : n}
                  </div>
                  <span className={`text-[10px] ${active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{label}</span>
                </div>
              );
            })}
          </div>

          {/* ── Step 2: Landlord (optional) ── */}
          {step === 2 && (
          <>
          <div className="text-center">
            <p className="text-base font-semibold">Landlord & finishing touches</p>
            <p className="text-xs text-muted-foreground">The landlord phone number is required — the rest can come later</p>
          </div>
          {/* Landlord Info */}
          <div className="space-y-3 p-3 rounded-xl bg-muted/30 border border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Landlord Details <span className="normal-case text-[10px] font-normal text-destructive">(phone required)</span></p>

            {/* Step 1 — search the system for a verified landlord */}
            {!selectedLandlord && !manualLandlord && (
              <div className="space-y-2">
                {/* One-tap reuse of the agent's most recently used landlord */}
                {lastLandlord && (
                  <button
                    type="button"
                    onClick={() => selectLandlord(lastLandlord)}
                    className="w-full text-left p-2.5 rounded-lg border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-primary uppercase tracking-wide">
                        <UserCheck className="h-3.5 w-3.5" /> Use last landlord
                      </span>
                      {lastLandlord.verified && (
                        <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
                      )}
                    </div>
                    <p className="font-medium text-sm truncate mt-0.5">{lastLandlord.name}</p>
                    <p className="text-xs text-muted-foreground">{lastLandlord.phone}</p>
                  </button>
                )}
                <Label className="text-xs">Search the landlord in the system first</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Landlord name or phone"
                    value={landlordQuery}
                    onChange={(e) => setLandlordQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); searchLandlords(); }
                    }}
                  />
                  <Button type="button" variant="secondary" onClick={searchLandlords} disabled={searchingLandlord}>
                    {searchingLandlord ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {landlordResults.length > 0 && (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {landlordResults.map((hit) => (
                      <button
                        type="button"
                        key={hit.id}
                        onClick={() => selectLandlord(hit)}
                        className="w-full text-left p-2.5 rounded-lg border border-border bg-background hover:bg-accent/40 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm truncate">{hit.name}</span>
                          {hit.verified ? (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-success shrink-0">
                              <ShieldCheck className="h-3.5 w-3.5" /> Verified
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground shrink-0">Unverified</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{hit.phone}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {hit.verifiedHouses > 0
                            ? `${hit.verifiedHouses} verified house${hit.verifiedHouses > 1 ? 's' : ''} in system`
                            : 'No verified houses yet'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {searchedOnce && !searchingLandlord && landlordResults.length === 0 && (
                  <p className="text-xs text-muted-foreground">No landlord found in the system for that search.</p>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 text-xs w-full"
                  onClick={() => { setManualLandlord(true); setForm(f => ({ ...f, landlord_name: landlordQuery.trim().match(/^[0-9+]/) ? f.landlord_name : landlordQuery.trim() })); }}
                >
                  Can't find them? Add a new landlord
                </Button>
              </div>
            )}

            {/* Selected existing landlord */}
            {selectedLandlord && (
              <div className="p-2.5 rounded-lg border border-success/40 bg-success/5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate flex items-center gap-1.5">
                      {selectedLandlord.verified && <ShieldCheck className="h-4 w-4 text-success shrink-0" />}
                      {selectedLandlord.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{selectedLandlord.phone}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedLandlord.verifiedHouses > 0
                        ? `${selectedLandlord.verifiedHouses} verified house${selectedLandlord.verifiedHouses > 1 ? 's' : ''} in system`
                        : 'No verified houses yet'}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs shrink-0" onClick={clearLandlordSelection}>
                    <X className="h-3.5 w-3.5 mr-1" /> Change
                  </Button>
                </div>
              </div>
            )}

            {/* Manual new landlord entry (after search returned no match) */}
            {manualLandlord && !selectedLandlord && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Landlord Name</Label>
                    <Input
                      placeholder="Name"
                      value={form.landlord_name}
                      onChange={e => setForm(f => ({ ...f, landlord_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Landlord Phone <span className="text-destructive">*</span></Label>
                    <PhoneInput
                      placeholder="0771234567"
                      value={form.landlord_phone}
                      onChange={(v) => setForm(f => ({ ...f, landlord_phone: v }))}
                      onContactPicked={({ name }) => {
                        if (name && !form.landlord_name.trim()) setForm(f => ({ ...f, landlord_name: name }));
                      }}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => { setManualLandlord(false); setForm(f => ({ ...f, landlord_name: '', landlord_phone: '' })); }}
                >
                  ← Back to search
                </Button>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={!form.landlord_has_smartphone}
                onCheckedChange={v => setForm(f => ({
                  ...f,
                  landlord_has_smartphone: !v,
                  // Auto-fill the caretaker as the agent (self) so a smartphone-less
                  // landlord needs no extra typing. Reset to none if reverted.
                  caretaker_type: v ? (f.caretaker_type === 'none' ? 'self' : f.caretaker_type) : 'none',
                }))}
              />
              <span className="text-sm">Landlord doesn't have / can't use a smartphone</span>
            </label>
          </div>

          {/* Caretaker Section — only if landlord has no smartphone */}
          {!form.landlord_has_smartphone && (
            <div className="space-y-3 p-3 rounded-xl bg-accent/30 border border-accent/50">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-accent-foreground" />
                <p className="text-xs font-semibold text-accent-foreground uppercase">Caretaker Registration</p>
              </div>
              <p className="text-xs text-muted-foreground">Since the landlord can't use a smartphone, assign a caretaker to manage this rental on the platform.</p>
              
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={form.caretaker_type === 'self' ? 'default' : 'outline'}
                  onClick={() => setForm(f => ({ ...f, caretaker_type: 'self' }))}
                  className="flex-1"
                >
                  I'm the Caretaker
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.caretaker_type === 'other' ? 'default' : 'outline'}
                  onClick={() => setForm(f => ({ ...f, caretaker_type: 'other' }))}
                  className="flex-1"
                >
                  Someone Else
                </Button>
              </div>

              {form.caretaker_type === 'self' && (
                <p className="text-xs text-success font-medium bg-success/10 rounded-lg p-2 text-center">
                  ✅ You'll be registered as the caretaker for this rental
                </p>
              )}

              {form.caretaker_type === 'other' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Caretaker Name *</Label>
                    <Input
                      placeholder="Full name"
                      value={form.caretaker_name}
                      onChange={e => setForm(f => ({ ...f, caretaker_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Caretaker Phone *</Label>
                    <Input
                      placeholder="0771234567"
                      value={form.caretaker_phone}
                      onChange={e => setForm(f => ({ ...f, caretaker_phone: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          </>
          )}

          {/* ── Step 1: House type & rent ── */}
          {step === 1 && (
          <>
          <div className="text-center">
            <p className="text-base font-semibold">What kind of house?</p>
            <p className="text-xs text-muted-foreground">Tap the picture that matches</p>
          </div>
          {/* Property Details */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Rooms</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={form.number_of_rooms}
                  onChange={e => setForm(f => ({ ...f, number_of_rooms: parseInt(e.target.value) || 1 }))}
                />
              </div>
            </div>
            {/* Big visual category picker */}
            <div className="grid grid-cols-3 gap-2">
              {HOUSE_CATEGORIES.map(c => {
                const selected = form.house_category === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, house_category: c.value }))}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-3 text-center transition-colors ${
                      selected ? 'border-primary bg-primary/10 ring-2 ring-primary' : 'border-border bg-muted/30 hover:bg-muted/50'
                    }`}
                  >
                    <span className="text-2xl leading-none">{c.emoji}</span>
                    <span className="text-[11px] font-medium leading-tight">{c.label}</span>
                  </button>
                );
              })}
            </div>

            <div>
              <Label className="text-xs">Monthly Rent (UGX) *</Label>
              <Input
                type="number"
                placeholder="e.g. 150000"
                value={form.monthly_rent}
                onChange={e => setForm(f => ({ ...f, monthly_rent: e.target.value }))}
                className={attempted && !monthlyRent ? 'border-destructive' : ''}
              />
              {monthlyRent > 0 && (
                <div className="mt-2 p-3 rounded-lg bg-success/10 border border-success/20">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Landlord gets</span>
                    <span className="font-semibold">{formatUGX(monthlyRent)}/month</span>
                  </div>
                  <div className="border-t border-success/20 mt-2 pt-2 flex justify-between">
                    <span className="text-sm font-bold text-success">Daily Rate</span>
                    <span className="text-sm font-bold text-success">{formatUGX(pricing.dailyRate)}/day</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          </>
          )}

          {/* ── Step 1 (cont.): Photos & place ── */}
          {step === 1 && (
          <>
          <div className="text-center">
            <p className="text-base font-semibold">Photos &amp; where is it?</p>
            <p className="text-xs text-muted-foreground">Add at least one photo and the area</p>
          </div>
          {/* Photos */}
          <Label className="text-xs font-semibold">Photos * <span className="text-muted-foreground font-normal">— at least one</span></Label>
          <HouseImageUploader
            images={houseImages}
            onChange={setHouseImages}
            maxImages={5}
            region={form.region}
            district={form.district}
            village={form.village}
          />

          {/* Location */}
          <div className="space-y-3 p-3 rounded-xl bg-muted/30 border border-border">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Location</p>
              {prefilledFromProfile && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                  <Sparkles className="h-3 w-3" /> Filled from your profile
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Region *</Label>
                <Select value={form.region} onValueChange={v => setForm(f => ({ ...f, region: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {REGIONS.map(r => (
                      <SelectItem key={r} value={r}>{regionLabel(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">District</Label>
                <Input
                  placeholder="District"
                  value={form.district}
                  onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                  onBlur={e => {
                    const normalized = normalizeDistrict(e.target.value);
                    if (normalized && normalized !== e.target.value.trim()) {
                      setForm(f => ({ ...f, district: normalized }));
                    }
                  }}
                />
                {districtWarning(form.district) && (
                  <p className="text-[10px] text-warning leading-tight mt-1">
                    {districtWarning(form.district)}
                  </p>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs">Address <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="e.g. Plot 12, Nansana Road"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Village / Zone <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="e.g. Kikaya Zone B"
                value={form.village}
                onChange={e => {
                  const val = e.target.value;
                  setForm(f => ({ ...f, village: val, lc1_village: val }));
                }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={autoFillFromGps}
              disabled={gpsFilling}
              className="w-full"
            >
              {gpsFilling ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4 mr-2" />
              )}
              {gpsFilling
                ? 'Getting your location…'
                : position
                  ? '📍 Re-capture GPS'
                  : 'Use my GPS & map to fill area'}
            </Button>
            {position && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setMapInitial(position); setMapPickerOpen(true); }}
                className="w-full"
              >
                <MapPin className="h-4 w-4 mr-2" /> Adjust pin on map
              </Button>
            )}
            <p className="text-[10px] text-muted-foreground text-center leading-tight">
              Drag the pin on the map to the exact house, then it fills region, district & village
            </p>
          </div>
          </>
          )}

          {/* ── Step 2 (cont.): LC1 (optional) & confirm ── */}
          {step === 2 && (
          <>
          <div className="text-center">
            <p className="text-base font-semibold">Almost done!</p>
            <p className="text-xs text-muted-foreground">LC1 chairperson is optional — list the house whenever you're ready</p>
          </div>
          {/* LC1 Chairperson — optional, but registering one earns UGX 5,000 */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase">LC1 Chairperson <span className="normal-case text-[10px] font-normal">(optional · earns UGX 5,000)</span></p>
          </div>
          <Lc1ChairpersonPicker
            value={lc1Selection}
            onChange={setLc1Selection}
            defaultRegion={form.region}
            defaultDistrict={form.district}
            defaultVillage={form.village}
            attempted={attempted && !!lc1Selection}
          />

          {/* Amenities */}
          {/* Optional extras — collapsed by default to keep the form short */}
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowOptional(s => !s)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            >
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                Optional details {showOptional ? '' : '(title, description, amenities)'}
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showOptional ? 'rotate-180' : ''}`} />
            </button>
            {showOptional && (
              <div className="p-3 space-y-3">
                <div>
                  <Label className="text-xs">House Title</Label>
                  <Input
                    placeholder="e.g. Spacious single room near town"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    placeholder="Describe the property..."
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Amenities</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'has_water', label: '💧 Water' },
                      { key: 'has_electricity', label: '⚡ Electricity' },
                      { key: 'has_security', label: '🔒 Security' },
                      { key: 'has_parking', label: '🚗 Parking' },
                      { key: 'is_furnished', label: '🛋️ Furnished' },
                    ].map(a => (
                      <label key={a.key} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 cursor-pointer">
                        <Checkbox
                          checked={(form as any)[a.key]}
                          onCheckedChange={v => setForm(f => ({ ...f, [a.key]: !!v }))}
                        />
                        <span className="text-sm">{a.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bonus reminder */}
          <div className="p-2 rounded-lg bg-chart-4/10 border border-chart-4/20 text-center">
            <p className="text-xs text-chart-4 font-semibold">
              💰 You earn UGX 5,000 the moment a tenant is placed in this house
            </p>
          </div>

          {/* ── Preflight check: exactly what's still required before listing ── */}
          <div className={`rounded-xl border p-3 space-y-2 ${allGatesPass ? 'border-success/30 bg-success/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
            <p className={`text-xs font-bold flex items-center gap-1.5 ${allGatesPass ? 'text-success' : 'text-amber-700 dark:text-amber-400'}`}>
              {allGatesPass ? <Check className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              {allGatesPass
                ? 'All set — you can list this house'
                : `${missingGates.length} thing${missingGates.length === 1 ? '' : 's'} still needed before you can list`}
            </p>
            <ul className="space-y-1.5">
              {preflightGates.map((g) => (
                <li key={g.label} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${g.ok ? 'bg-success text-success-foreground' : 'bg-amber-500 text-white'}`}>
                    {g.ok ? <Check className="h-2.5 w-2.5" /> : '!'}
                  </span>
                  <span className="min-w-0">
                    <span className={g.ok ? 'text-muted-foreground line-through' : 'font-medium text-foreground'}>{g.label}</span>
                    {!g.ok && (
                      <span className="block text-[11px] text-amber-700 dark:text-amber-400">
                        {g.hint}
                        {g.step !== 2 && (
                          <button type="button" onClick={() => { setStep(g.step); scrollDialogToTop(); }} className="ml-1 underline font-semibold">
                            Fix on step {g.step}
                          </button>
                        )}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          </>
          )}

          {/* Wizard navigation — big Back / Next / List buttons */}
          <div className="flex gap-2 pt-1">
            {step > 1 && (
              <Button type="button" variant="outline" className="h-12 flex-1 text-base" onClick={goBack}>
                <ArrowLeft className="h-5 w-5 mr-1" /> Back
              </Button>
            )}
            {step < TOTAL_STEPS ? (
              <Button type="button" className="h-12 flex-[2] text-base" onClick={goNext}>
                Next <ArrowRight className="h-5 w-5 ml-1" />
              </Button>
            ) : (
              <Button
                type="submit"
                className="h-12 flex-[2] text-base"
                disabled={submitting || !allGatesPass}
                onClick={(e) => {
                  // Defensive: some mobile browsers swallow form submit when
                  // a native-validated input (e.g. type="number") rejects silently.
                  // Guarantee the handler always runs.
                  if (e.currentTarget.form) return;
                  handleSubmit();
                }}
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Home className="h-5 w-5 mr-2" />}
                {allGatesPass ? 'List house' : `${missingGates.length} item${missingGates.length === 1 ? '' : 's'} left`}
              </Button>
            )}
          </div>
        </form>
        </>
        )}
      </DialogContent>
      <MapPinPicker
        open={mapPickerOpen}
        onOpenChange={setMapPickerOpen}
        initial={mapInitial}
        onConfirm={(pos) => fillFromCoords(pos)}
      />
    </Dialog>
  );
}

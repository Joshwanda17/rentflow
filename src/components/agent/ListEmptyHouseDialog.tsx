import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Home, MapPin, Loader2, Shield, UserCheck, Share2, MessageCircle, Copy, Check, PartyPopper, ChevronDown } from 'lucide-react';
import { PhoneInput } from '@/components/ui/phone-input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { calculateDailyRentalRate } from '@/hooks/useHouseListings';
import { useGeolocation } from '@/hooks/useGeolocation';
import { HouseImageUploader, uploadHouseImages, type HouseImageFile } from './HouseImageUploader';

const APP_URL = 'https://welilereceipts.com';
const OG_FUNCTION_URL = 'https://wirntoujqoyjobfhyelc.supabase.co/functions/v1/og-house';

interface ListEmptyHouseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const HOUSE_CATEGORIES = [
  { value: 'single_room', label: 'Single Room' },
  { value: 'double_room', label: 'Double Room' },
  { value: 'bedsitter', label: 'Bedsitter' },
  { value: 'one_bedroom', label: '1 Bedroom' },
  { value: 'two_bedroom', label: '2 Bedrooms' },
  { value: 'three_bedroom', label: '3 Bedrooms' },
  { value: 'studio', label: 'Studio' },
  { value: 'shop', label: 'Shop / Commercial' },
];

const REGIONS = [
  'Central', 'Eastern', 'Northern', 'Western',
  'Kampala', 'Wakiso', 'Mukono', 'Jinja', 'Mbale',
  'Mbarara', 'Gulu', 'Lira', 'Fort Portal', 'Masaka',
  'Entebbe', 'Nansana', 'Kira', 'Bweyogerere',
];

import { normalizeDistrict, districtWarning, regionLabel } from '@/lib/ugandaDistricts';

export function ListEmptyHouseDialog({ open, onOpenChange, onSuccess }: ListEmptyHouseDialogProps) {
  const geo = useGeolocation(true);
  const geoLoading = geo.loading;
  const position = geo.latitude && geo.longitude ? { latitude: geo.latitude, longitude: geo.longitude } : null;
  const getPosition = geo.requestGPSPermission;
  const [submitting, setSubmitting] = useState(false);
  const [houseImages, setHouseImages] = useState<HouseImageFile[]>([]);
  const [existingLc1Options, setExistingLc1Options] = useState<Array<{name: string; phone: string; village: string}>>([]);
  const [attempted, setAttempted] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [successListing, setSuccessListing] = useState<null | {
    id: string;
    shortCode: string | null;
    title: string;
    region: string;
    dailyRate: number;
  }>(null);
  const [copied, setCopied] = useState(false);
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

  const monthlyRent = parseInt(form.monthly_rent) || 0;
  const pricing = calculateDailyRentalRate(monthlyRent);

  // Auto-populate LC1 village from property village and fetch existing LC1 chairpersons
  const fetchLc1ForVillage = async (villageQuery: string) => {
    try {
      const { data, error } = await supabase
        .from('lc1_chairpersons')
        .select('name, phone, village')
        .ilike('village', `%${villageQuery.trim()}%`)
        .limit(5);
      
      if (error) throw error;
      setExistingLc1Options(data || []);
      
      // Auto-fill if exact match exists
      if (data && data.length === 1 && data[0].village.toLowerCase() === villageQuery.toLowerCase()) {
        setForm(f => ({ ...f, lc1_name: data[0].name, lc1_phone: data[0].phone }));
      }
    } catch (error) {
      console.error('Error fetching LC1 chairpersons:', error);
    }
  };

  const scrollDialogToTop = () => {
    requestAnimationFrame(() => {
      document
        .querySelector('[role="dialog"]')
        ?.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setAttempted(true);

    // Auto-sync lc1_village from village
    const syncedForm = { ...form, lc1_village: form.village.trim() };

    const failWith = (msg: string) => {
      toast.error(msg);
      scrollDialogToTop();
    };

    if (!monthlyRent || monthlyRent < 10000) {
      failWith('Monthly rent must be at least UGX 10,000');
      return;
    }
    if (!syncedForm.region) {
      failWith('Please select a region');
      return;
    }
    if (!syncedForm.address.trim()) {
      failWith('Address is required');
      return;
    }
    if (!syncedForm.village.trim()) {
      failWith('Village/Zone is required');
      return;
    }
    if (!syncedForm.lc1_name.trim()) {
      failWith('LC1 Chairperson name is required');
      return;
    }
    if (!syncedForm.lc1_phone.trim()) {
      failWith('LC1 Chairperson phone is required');
      return;
    }

    // Update form with synced lc1_village
    setForm(syncedForm);

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Try to find or create landlord reference
      let landlordId: string | null = null;
      if (form.landlord_phone) {
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
          lc1_chairperson_name: form.lc1_name,
          lc1_chairperson_phone: form.lc1_phone,
          lc1_chairperson_village: form.lc1_village || null,
        } as any)
        .select('id')
        .single();

      if (error) throw error;

      // Save LC1 chairperson to lookup table if new
      const { error: lc1Error } = await supabase
        .from('lc1_chairpersons')
        .upsert(
          { name: form.lc1_name.trim(), phone: form.lc1_phone.trim(), village: form.lc1_village.trim() },
          { onConflict: 'phone,village', ignoreDuplicates: true }
        );

      if (lc1Error) console.warn('LC1 save warning:', lc1Error);

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
        description: `Daily rate: ${formatUGX(pricing.dailyRate)}/day · Earn UGX 5,000 the moment a tenant is placed in this house`,
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
    setExistingLc1Options([]);
    setShowOptional(false);
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
                Share it now so a tenant can rent it fast — you earn{' '}
                <span className="font-semibold text-foreground">UGX 5,000</span> the moment they're placed.
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

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Landlord Info */}
          <div className="space-y-3 p-3 rounded-xl bg-muted/30 border border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Landlord Details</p>
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
                <Label className="text-xs">Landlord Phone</Label>
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
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={!form.landlord_has_smartphone}
                onCheckedChange={v => setForm(f => ({ ...f, landlord_has_smartphone: !v, caretaker_type: v ? f.caretaker_type : 'none' }))}
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

          {/* Property Details */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category *</Label>
                <Select value={form.house_category} onValueChange={v => setForm(f => ({ ...f, house_category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOUSE_CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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

          {/* Photos */}
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
            <p className="text-xs font-semibold text-muted-foreground uppercase">Location</p>
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
              <Label className="text-xs">Address *</Label>
              <Input
                placeholder="e.g. Plot 12, Nansana Road"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                className={attempted && !form.address.trim() ? 'border-destructive' : ''}
              />
            </div>
            <div>
              <Label className="text-xs">Village / Zone *</Label>
              <Input
                placeholder="e.g. Kikaya Zone B"
                value={form.village}
                onChange={e => {
                  const val = e.target.value;
                  setForm(f => ({ ...f, village: val, lc1_village: val }));
                  if (val.trim().length >= 3) fetchLc1ForVillage(val);
                }}
                className={attempted && !form.village.trim() ? 'border-destructive' : ''}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={getPosition}
              disabled={geoLoading}
              className="w-full"
            >
              <MapPin className="h-4 w-4 mr-2" />
              {geoLoading ? 'Getting location...' : position ? '📍 GPS Captured' : 'Capture GPS Location'}
            </Button>
          </div>

          {/* LC1 Chairperson — Required */}
          <div className="space-y-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold text-primary uppercase">LC1 Chairperson Details *</p>
            </div>
            <p className="text-xs text-muted-foreground">Required for property verification by the platform</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name *</Label>
                <Input
                  placeholder="Chairperson name"
                  value={form.lc1_name}
                  onChange={e => setForm(f => ({ ...f, lc1_name: e.target.value }))}
                  className={attempted && !form.lc1_name.trim() ? 'border-destructive' : ''}
                />
              </div>
              <div>
                <Label className="text-xs">Phone *</Label>
                <Input
                  placeholder="0771234567"
                  value={form.lc1_phone}
                  onChange={e => setForm(f => ({ ...f, lc1_phone: e.target.value }))}
                  className={attempted && !form.lc1_phone.trim() ? 'border-destructive' : ''}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Village / Zone (auto-filled from property address)</Label>
              <Input
                value={form.lc1_village}
                disabled
                className="bg-muted/50"
              />
              {existingLc1Options.length > 0 && (
                <div className="mt-2 p-2 bg-primary/5 border border-primary/20 rounded-lg text-xs">
                  <p className="font-semibold text-primary mb-1.5">✅ Existing LC1 Chairpersons in {form.village}:</p>
                  <div className="space-y-1">
                    {existingLc1Options.map((lc1, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setForm(f => ({ ...f, lc1_name: lc1.name, lc1_phone: lc1.phone }));
                          toast.success('LC1 details auto-filled');
                        }}
                        className="block w-full text-left px-2 py-1.5 hover:bg-primary/10 rounded transition-colors"
                      >
                        <span className="font-medium">{lc1.name}</span> · <span className="text-muted-foreground">{lc1.phone}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

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

          <Button
            type="submit"
            className="w-full h-12 text-base"
            disabled={submitting}
            onClick={(e) => {
              // Defensive: some mobile browsers swallow form submit when
              // a native-validated input (e.g. type="number") rejects silently.
              // Guarantee the handler always runs.
              if (e.currentTarget.form) return;
              handleSubmit();
            }}
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Home className="h-5 w-5 mr-2" />}
            List & share house{monthlyRent > 0 ? ` · ${formatUGX(pricing.dailyRate)}/day` : ''}
          </Button>
        </form>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}

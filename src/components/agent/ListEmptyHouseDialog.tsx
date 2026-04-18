import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Home, MapPin, Loader2, Shield, UserCheck } from 'lucide-react';
import { PhoneInput } from '@/components/ui/phone-input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { calculateDailyRentalRate } from '@/hooks/useHouseListings';
import { useGeolocation } from '@/hooks/useGeolocation';
import { HouseImageUploader, uploadHouseImages, type HouseImageFile } from './HouseImageUploader';

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

export function ListEmptyHouseDialog({ open, onOpenChange, onSuccess }: ListEmptyHouseDialogProps) {
  const geo = useGeolocation(true);
  const geoLoading = geo.loading;
  const position = geo.latitude && geo.longitude ? { latitude: geo.latitude, longitude: geo.longitude } : null;
  const getPosition = geo.requestGPSPermission;
  const [submitting, setSubmitting] = useState(false);
  const [houseImages, setHouseImages] = useState<HouseImageFile[]>([]);
  const [existingLc1Options, setExistingLc1Options] = useState<Array<{name: string; phone: string; village: string}>>([]);
  const [attempted, setAttempted] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);

    // Auto-sync lc1_village from village
    const syncedForm = { ...form, lc1_village: form.village.trim() };

    if (!monthlyRent || monthlyRent < 10000) {
      toast.error('Monthly rent must be at least UGX 10,000');
      return;
    }
    if (!syncedForm.region) {
      toast.error('Please select a region');
      return;
    }
    if (!syncedForm.address.trim()) {
      toast.error('Address is required');
      return;
    }
    if (!syncedForm.village.trim()) {
      toast.error('Village/Zone is required');
      return;
    }
    if (!syncedForm.lc1_name.trim()) {
      toast.error('LC1 Chairperson name is required');
      return;
    }
    if (!syncedForm.lc1_phone.trim()) {
      toast.error('LC1 Chairperson phone is required');
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
        description: `Daily rate: ${formatUGX(pricing.dailyRate)}/day · UGX 5,000 bonus on landlord verification`,
      });
      onSuccess?.();
      onOpenChange(false);
      houseImages.forEach(i => URL.revokeObjectURL(i.previewUrl));
      setHouseImages([]);
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
      setAttempted(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to list house');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            List Empty House
          </DialogTitle>
          <DialogDescription>
            Register an available rental · Earn UGX 5,000 on verification
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <div>
              <Label className="text-xs">House Title (optional)</Label>
              <Input
                placeholder="e.g. Spacious single room near town"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            
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

            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                placeholder="Describe the property..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
              />
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
                      <SelectItem key={r} value={r}>{r}</SelectItem>
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
                />
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
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Amenities</p>
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

          {/* Bonus reminder */}
          <div className="p-2 rounded-lg bg-chart-4/10 border border-chart-4/20 text-center">
            <p className="text-xs text-chart-4 font-semibold">💰 You earn UGX 5,000 when this landlord is verified</p>
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Home className="h-4 w-4 mr-2" />}
            List House at {monthlyRent > 0 ? `${formatUGX(pricing.dailyRate)}/day` : '...'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

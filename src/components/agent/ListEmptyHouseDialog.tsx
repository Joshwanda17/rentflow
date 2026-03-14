import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Home, MapPin, Loader2 } from 'lucide-react';
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
  const [form, setForm] = useState({
    title: '',
    description: '',
    house_category: 'single_room',
    number_of_rooms: 1,
    monthly_rent: '',
    region: '',
    district: '',
    address: '',
    landlord_name: '',
    landlord_phone: '',
    has_water: false,
    has_electricity: false,
    has_security: false,
    has_parking: false,
    is_furnished: false,
  });

  const monthlyRent = parseInt(form.monthly_rent) || 0;
  const pricing = calculateDailyRentalRate(monthlyRent);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!monthlyRent || monthlyRent < 10000) {
      toast.error('Monthly rent must be at least UGX 10,000');
      return;
    }
    if (!form.region || !form.address) {
      toast.error('Region and address are required');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Try to find or create landlord reference
      let landlordId: string | null = null;
      if (form.landlord_phone) {
        const { data: landlord } = await supabase
          .from('landlords')
          .select('id')
          .eq('phone', form.landlord_phone)
          .maybeSingle();
        landlordId = landlord?.id || null;
      }

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
        } as any)
        .select('id')
        .single();

      if (error) throw error;

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
        description: `Daily rate: ${formatUGX(pricing.dailyRate)}/day`,
      });
      onSuccess?.();
      onOpenChange(false);
      // Cleanup previews
      houseImages.forEach(i => URL.revokeObjectURL(i.previewUrl));
      setHouseImages([]);
      // Reset form
      setForm({
        title: '', description: '', house_category: 'single_room',
        number_of_rooms: 1, monthly_rent: '', region: '', district: '',
        address: '', landlord_name: '', landlord_phone: '',
        has_water: false, has_electricity: false, has_security: false,
        has_parking: false, is_furnished: false,
      });
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
            Register an available rental for daily-rate tenants
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
                <Input
                  placeholder="0771234567"
                  value={form.landlord_phone}
                  onChange={e => setForm(f => ({ ...f, landlord_phone: e.target.value }))}
                />
              </div>
            </div>
          </div>

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
              />
              {monthlyRent > 0 && (
                <div className="mt-2 p-3 rounded-lg bg-success/10 border border-success/20">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Landlord gets</span>
                    <span className="font-semibold">{formatUGX(monthlyRent)}/month</span>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-muted-foreground">Access fee (33%)</span>
                    <span>{formatUGX(pricing.accessFee)}</span>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-muted-foreground">Platform fee</span>
                    <span>{formatUGX(pricing.platformFee)}</span>
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

          {/* Photos — Booking.com style */}
          <HouseImageUploader images={houseImages} onChange={setHouseImages} maxImages={5} />

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

          <Button type="submit" className="w-full" disabled={submitting || !monthlyRent || !form.region || !form.address}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Home className="h-4 w-4 mr-2" />}
            List House at {monthlyRent > 0 ? `${formatUGX(pricing.dailyRate)}/day` : '...'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

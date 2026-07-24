import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { HouseListing, calculateDailyRentalRate } from '@/hooks/useHouseListings';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2, X, AlertTriangle, Video, Check, User, UserPlus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { HouseImageUploader, uploadHouseImages, type HouseImageFile } from './HouseImageUploader';
import { parseHouseVideo, normalizeHouseVideoUrl } from '@/lib/houseVideoUrl';
import { FieldError } from '@/components/shared/FormFeedback';
import { LandlordSearchSelect, type LandlordOption } from './LandlordSearchSelect';
import { toUgandaLocalDigits, normalizeUgandaPhone, validateLandlordPhone } from '@/lib/phoneUtils';

interface EditHouseListingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: HouseListing | null;
  onSaved?: () => void;
}

const MAX_PHOTOS = 5;

export function EditHouseListingDialog({ open, onOpenChange, listing, onSaved }: EditHouseListingDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [region, setRegion] = useState('');
  const [monthlyRent, setMonthlyRent] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  // Photos already stored on the listing (kept unless the agent removes them).
  const [existingUrls, setExistingUrls] = useState<string[]>([]);
  // Newly captured/selected photos pending upload.
  const [newImages, setNewImages] = useState<HouseImageFile[]>([]);

  // Landlord attachment (search existing or register new). Mirrors the
  // ListEmptyHouseDialog flow so the same debounced trigram search + duplicate
  // guard + auto-create fallback is used when the agent edits a listing.
  const [selectedLandlord, setSelectedLandlord] = useState<LandlordOption | null>(null);
  const [manualLandlord, setManualLandlord] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [loadingLandlord, setLoadingLandlord] = useState(false);

  useEffect(() => {
    if (listing) {
      setTitle(listing.title);
      setAddress(listing.address);
      setRegion(listing.region);
      setMonthlyRent(listing.monthly_rent);
      setDescription(listing.description ?? '');
      setVideoUrl(listing.video_url ?? '');
      setExistingUrls(Array.isArray(listing.image_urls) ? listing.image_urls.filter(Boolean) : []);
      setNewImages([]);
      // Reset landlord state, then hydrate from the currently linked landlord.
      setSelectedLandlord(null);
      setManualLandlord(false);
      setManualName('');
      setManualPhone('');
      if (listing.landlord_id) {
        setLoadingLandlord(true);
        supabase
          .from('landlords_directory')
          .select('id, name, phone, property_address, district, town_council, county, village, verified')
          .eq('id', listing.landlord_id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) setSelectedLandlord(data as LandlordOption);
          })
          .then(undefined, () => {})
          // supabase's PostgrestBuilder doesn't chain .finally in all versions
          .then(() => setLoadingLandlord(false));
      }
    }
  }, [listing]);

  if (!listing) return null;

  const calc = monthlyRent > 0 ? calculateDailyRentalRate(monthlyRent) : null;
  const trimmedVideo = videoUrl.trim();
  const parsedVideo = parseHouseVideo(trimmedVideo);
  const videoInvalid = trimmedVideo.length > 0 && !parsedVideo;
  const videoTouched = videoUrl !== (listing?.video_url ?? '');
  const totalPhotos = existingUrls.length + newImages.length;
  const remainingSlots = Math.max(0, MAX_PHOTOS - existingUrls.length);
  const manualPhoneError = manualLandlord ? validateLandlordPhone(manualPhone) : null;
  const manualLandlordReady =
    manualLandlord && manualName.trim().length >= 2 && !manualPhoneError;
  const hasLandlord = !!selectedLandlord?.id || manualLandlordReady;
  const canSave = !videoInvalid && hasLandlord;

  const handleSave = async () => {
    if (!title.trim() || !address.trim() || !region.trim() || monthlyRent <= 0) {
      toast({ title: 'Missing info', description: 'Title, address, region and rent are required.', variant: 'destructive' });
      return;
    }
    if (videoInvalid) {
      toast({ title: 'Invalid video link', description: 'Paste a YouTube or Google Drive video link, or leave it empty.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Resolve landlord first — we never want to save a listing without one.
      let landlordId: string | null = selectedLandlord?.id ?? null;
      let landlordName: string | null = selectedLandlord?.name ?? null;
      let landlordPhone: string | null = selectedLandlord?.phone ?? null;

      if (!landlordId && manualLandlord) {
        const canonicalPhone = toUgandaLocalDigits(manualPhone);
        const cleanName = manualName.trim();
        // Duplicate guard — reuse existing landlord if name+phone already exists.
        const { data: matches } = await supabase.rpc('find_landlord_duplicate', {
          p_name: cleanName,
          p_phone: canonicalPhone,
        });
        const dup = Array.isArray(matches) && matches.length > 0 ? matches[0] : null;
        if (dup?.id) {
          landlordId = dup.id;
          landlordName = (dup as any).name ?? cleanName;
          landlordPhone = (dup as any).phone ?? canonicalPhone;
          toast({
            title: `Linked to existing landlord "${landlordName}"`,
            description: 'A landlord with these details already existed — reused to avoid a duplicate.',
          });
        } else {
          const { data: newLandlord, error: llErr } = await supabase
            .from('landlords')
            .insert({
              name: cleanName,
              phone: canonicalPhone,
              property_address: address.trim() || null,
              region: region.trim() || null,
              registered_by: user?.id ?? null,
              managed_by_agent_id: user?.id ?? null,
            })
            .select('id')
            .single();
          if (llErr || !newLandlord?.id) {
            throw new Error(llErr?.message ? `Could not save the landlord: ${llErr.message}` : 'Could not save the landlord.');
          }
          landlordId = newLandlord.id;
          landlordName = cleanName;
          landlordPhone = canonicalPhone;
        }
      }

      if (!landlordId) {
        throw new Error('Attach a landlord (search an existing one or register a new one) before saving.');
      }

      // Upload any newly added photos and merge with the ones the agent kept.
      let imageUrls = [...existingUrls];
      if (newImages.length && user?.id) {
        const uploaded = await uploadHouseImages(
          user.id,
          listing.id,
          newImages.map(i => i.file),
          newImages.map(i => i.thumbnailFile),
        );
        imageUrls = [...imageUrls, ...uploaded];
      }
      const updates: any = {
        title: title.trim(),
        address: address.trim(),
        region: region.trim(),
        description: description.trim() || null,
        monthly_rent: monthlyRent,
        image_urls: imageUrls,
        video_url: normalizeHouseVideoUrl(trimmedVideo) || null,
        landlord_id: landlordId,
        landlord_name: landlordName,
        landlord_phone: landlordPhone ? normalizeUgandaPhone(landlordPhone) : null,
      };
      if (calc) {
        updates.access_fee = calc.accessFee;
        updates.platform_fee = calc.platformFee;
        updates.total_monthly_cost = calc.totalMonthlyCost;
        updates.daily_rate = calc.dailyRate;
      }
      const { error } = await supabase.from('house_listings').update(updates).eq('id', listing.id);
      if (error) throw error;
      toast({ title: 'Listing updated' });
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit listing</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-address">Address</Label>
            <Input id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-region">Region</Label>
            <Input id="edit-region" value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-rent">Monthly rent (UGX)</Label>
            <Input
              id="edit-rent"
              type="number"
              inputMode="numeric"
              min={0}
              value={monthlyRent || ''}
              onChange={(e) => setMonthlyRent(Number(e.target.value) || 0)}
            />
            {calc && (
              <p className="text-[11px] text-muted-foreground">
                Daily rate updates to <span className="font-semibold text-success">{formatUGX(calc.dailyRate)}/day</span>
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-desc">Description (optional)</Label>
            <Textarea id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          {/* Walkthrough video link (external — YouTube / Google Drive) */}
          <div className="space-y-1">
            <Label htmlFor="edit-video" className="flex items-center gap-1.5">
              <Video className="h-3.5 w-3.5" /> Walkthrough video (optional)
            </Label>
            <Input
              id="edit-video"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onBlur={() => {
                if (trimmedVideo.length > 0 && !parsedVideo) {
                  toast({ title: 'Invalid video link', description: 'Only YouTube or Google Drive links are accepted.', variant: 'destructive' });
                }
              }}
              placeholder="Paste a YouTube or Google Drive link"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              className={videoInvalid && videoTouched ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {videoInvalid ? (
              <FieldError message="Only YouTube or Google Drive links are accepted. Paste a valid share link or leave empty." />
            ) : parsedVideo ? (
              <p className="text-[11px] text-success flex items-center gap-1">
                <Check className="h-3 w-3" /> {parsedVideo.provider === 'youtube' ? 'YouTube' : 'Google Drive'} video linked.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Record a short clip (≤30s), upload it to YouTube or Drive, then paste the share link here.
              </p>
            )}
          </div>

          {/* Photos: existing (removable) + add new */}
          <div className="space-y-2 pt-1">
            <Label className="text-xs">Photos ({totalPhotos}/{MAX_PHOTOS})</Label>
            {existingUrls.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {existingUrls.map((url) => (
                  <div key={url} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border">
                    <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    <button
                      type="button"
                      onClick={() => setExistingUrls((prev) => prev.filter((u) => u !== url))}
                      className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <HouseImageUploader
              images={newImages}
              onChange={setNewImages}
              maxImages={remainingSlots}
              region={region}
              district={listing.district ?? undefined}
              village={listing.village ?? undefined}
            />
            {totalPhotos === 0 && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-[10px] text-amber-700 dark:text-amber-400">
                  Houses without a real photo are hidden from tenants. Add at least one photo so this listing appears.
                </p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !canSave} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
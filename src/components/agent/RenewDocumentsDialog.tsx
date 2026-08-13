import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, Camera, FileImage, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { optimizeImage } from '@/lib/imageOptimizer';
import { captureGps, isGpsRequiredError } from '@/lib/captureGps';

export interface RenewDocsState {
  passport: boolean;
  lcLetter: boolean;
  houseImages: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  tenantName: string;
  prevRequestId: string;
  /** What the tenant already has on file. */
  docs: RenewDocsState;
  /** Called after the renewal has been posted with the documents attached. */
  onRenewed: () => void;
}

const REQUIRED_HOUSE_IMAGES = 4;
const MAX_MB = 10;

type Picked = { file: File; preview: string };

/**
 * Renewal document custody gate. A renewal may only be posted when the tenant
 * has a passport photo, four house photos and an LC letter on file. Anything
 * missing is captured here and stamped on the new rent request, which the
 * `sync_rent_request_tenant_documents` trigger registers as tenant documents.
 */
export function RenewDocumentsDialog({
  open, onOpenChange, tenantId, tenantName, prevRequestId, docs, onRenewed,
}: Props) {
  const { user } = useAuth();
  const [passport, setPassport] = useState<Picked | null>(null);
  const [housePhotos, setHousePhotos] = useState<Picked[]>([]);
  const [lcLetter, setLcLetter] = useState<Picked | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const needPassport = !docs.passport;
  const needLcLetter = !docs.lcLetter;
  const houseNeeded = Math.max(0, REQUIRED_HOUSE_IMAGES - docs.houseImages);

  useEffect(() => {
    if (!open) {
      passport && URL.revokeObjectURL(passport.preview);
      housePhotos.forEach(p => URL.revokeObjectURL(p.preview));
      lcLetter && URL.revokeObjectURL(lcLetter.preview);
      setPassport(null);
      setHousePhotos([]);
      setLcLetter(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ready = useMemo(() => (
    (!needPassport || !!passport) &&
    (!needLcLetter || !!lcLetter) &&
    housePhotos.length >= houseNeeded
  ), [needPassport, passport, needLcLetter, lcLetter, housePhotos.length, houseNeeded]);

  const pickImage = (
    e: React.ChangeEvent<HTMLInputElement>,
    apply: (p: Picked) => void,
    label: string,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())) {
      toast.error(`${label} must be a JPG, PNG or WebP image`);
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`${label} must be ${MAX_MB} MB or smaller`);
      return;
    }
    apply({ file, preview: URL.createObjectURL(file) });
  };

  const pickHousePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const ok = files.filter(f => f.size <= MAX_MB * 1024 * 1024);
    if (ok.length !== files.length) toast.error(`Some photos were over ${MAX_MB} MB and were skipped`);
    setHousePhotos(prev => [...prev, ...ok.map(f => ({ file: f, preview: URL.createObjectURL(f) }))].slice(0, houseNeeded));
  };

  const handleSubmit = async () => {
    if (!user?.id || submitting) return;
    if (!ready) { toast.error('Upload every missing document before renewing'); return; }
    setSubmitting(true);
    try {
      const stamp = `renewal-${prevRequestId}-${Date.now()}`;

      // 1. Upload first — a failed upload must never leave a renewal posted
      //    without its documents.
      let passportUrl: string | null = null;
      if (passport) {
        const opt = await optimizeImage(passport.file, { maxWidth: 1200, quality: 0.85 });
        const path = `${user.id}/${stamp}/tenant_passport.${opt.file.name.split('.').pop() || 'webp'}`;
        const { error } = await supabase.storage.from('house-images').upload(path, opt.file, { cacheControl: '86400', upsert: true });
        if (error) throw new Error(`Passport photo upload failed: ${error.message}`);
        passportUrl = supabase.storage.from('house-images').getPublicUrl(path).data.publicUrl;
      }

      const houseUrls: string[] = [];
      for (let i = 0; i < housePhotos.length; i++) {
        const opt = await optimizeImage(housePhotos[i].file, { maxWidth: 1200, quality: 0.8 });
        const path = `${user.id}/${stamp}/photo_${i}.${opt.file.name.split('.').pop() || 'webp'}`;
        const { error } = await supabase.storage.from('house-images').upload(path, opt.file, { cacheControl: '86400', upsert: true });
        if (error) throw new Error(`House photo ${i + 1} upload failed: ${error.message}`);
        houseUrls.push(supabase.storage.from('house-images').getPublicUrl(path).data.publicUrl);
      }

      let letterPath: string | null = null;
      if (lcLetter) {
        const ext = (lcLetter.file.name.split('.').pop() || 'jpg').toLowerCase();
        letterPath = `${user.id}/${stamp}/lc_letter.${ext}`;
        const { error } = await supabase.storage
          .from('lc-letters')
          .upload(letterPath, lcLetter.file, { cacheControl: '86400', upsert: true, contentType: lcLetter.file.type });
        if (error) throw new Error(`LC letter upload failed: ${error.message}`);
      }

      // 2. Post the renewal.
      const postRenewal = (gps?: { latitude: number; longitude: number }) =>
        supabase.rpc('renew_rent_request' as any, {
          p_prev_request_id: prevRequestId,
          ...(gps ? { p_latitude: gps.latitude, p_longitude: gps.longitude } : {}),
        });

      let { data: newId, error: renewErr } = await postRenewal();
      // No property GPS on record anywhere — capture it here at the house and retry once.
      if (renewErr && isGpsRequiredError(renewErr?.message)) {
        toast.info('Capturing the property GPS at the house…');
        const gps = await captureGps();
        ({ data: newId, error: renewErr } = await postRenewal(gps));
      }
      if (renewErr) throw renewErr;
      if (!newId) throw new Error('The rent request could not be posted. Please try again.');

      // 3. Stamp the documents on the new request.
      const patch: Record<string, unknown> = {};
      if (passportUrl) patch.tenant_photo_url = passportUrl;
      if (houseUrls.length) patch.house_image_urls = houseUrls;
      if (letterPath) { patch.lc_letter_path = letterPath; patch.lc_letter_bucket = 'lc-letters'; }
      if (Object.keys(patch).length) {
        const { error: upErr } = await supabase
          .from('rent_requests')
          .update(patch as any)
          .eq('id', newId as string);
        if (upErr) throw new Error(`Renewal posted, but attaching documents failed: ${upErr.message}`);
      }

      toast.success(`Rent request renewed for ${tenantName} with documents attached`);
      onOpenChange(false);
      onRenewed();
    } catch (err: any) {
      const raw = err?.message || 'Something went wrong. Please try again.';
      const friendly = raw.includes('DAILY_ELIGIBILITY_BLOCKED')
        ? 'Collect from your existing tenants first — you must reach 50% of your daily target before posting a new rent request.'
        : raw;
      console.error('Renewal with documents failed:', err);
      toast.error(friendly);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Documents required to renew</DialogTitle>
          <DialogDescription className="text-xs">
            {tenantName} is missing documents on file. Upload them to post this renewal.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-2.5 text-[11px]">
          <p className="font-semibold text-amber-800 dark:text-amber-300 inline-flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Missing
          </p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground list-disc pl-4">
            {needPassport && <li>Tenant passport photo</li>}
            {houseNeeded > 0 && <li>House photos ({docs.houseImages} of {REQUIRED_HOUSE_IMAGES} on file)</li>}
            {needLcLetter && <li>LC letter</li>}
          </ul>
        </div>

        {needPassport && (
          <div className="space-y-2">
            <Label className="text-sm">Tenant passport photo *</Label>
            {passport ? (
              <div className="flex items-center gap-2">
                <img src={passport.preview} alt="Passport photo" className="h-16 w-16 rounded-lg object-cover" />
                <Button variant="outline" size="sm" onClick={() => setPassport(null)} disabled={submitting}>Replace</Button>
              </div>
            ) : (
              <label className="flex h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground">
                <Camera className="h-4 w-4" /> Take the passport photo
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => pickImage(e, setPassport, 'The passport photo')} />
              </label>
            )}
          </div>
        )}

        {houseNeeded > 0 && (
          <div className="space-y-2">
            <Label className="text-sm">House photos * — {housePhotos.length} of {houseNeeded} captured</Label>
            <div className="grid grid-cols-4 gap-2">
              {housePhotos.map((p, i) => (
                <div key={i} className="relative">
                  <img src={p.preview} alt={`House ${i + 1}`} className="h-16 w-full rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => setHousePhotos(prev => prev.filter((_, x) => x !== i))}
                    disabled={submitting}
                    className="absolute -right-1 -top-1 rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground"
                  >×</button>
                </div>
              ))}
              {housePhotos.length < houseNeeded && (
                <label className="flex h-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground">
                  <Camera className="h-4 w-4" />
                  <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={pickHousePhotos} />
                </label>
              )}
            </div>
          </div>
        )}

        {needLcLetter && (
          <div className="space-y-2">
            <Label className="text-sm">LC letter * — JPG, JPEG or PNG, max {MAX_MB} MB</Label>
            {lcLetter ? (
              <div className="flex items-center gap-2">
                <img src={lcLetter.preview} alt="LC letter" className="h-16 w-16 rounded-lg object-cover" />
                <Button variant="outline" size="sm" onClick={() => setLcLetter(null)} disabled={submitting}>Replace</Button>
              </div>
            ) : (
              <label className="flex h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground">
                <FileImage className="h-4 w-4" /> Upload the LC letter
                <input type="file" accept="image/jpeg,image/jpg,image/png" className="hidden"
                  onChange={(e) => pickImage(e, setLcLetter, 'The LC letter')} />
              </label>
            )}
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!ready || submitting} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {submitting ? 'Renewing…' : 'Upload & renew'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
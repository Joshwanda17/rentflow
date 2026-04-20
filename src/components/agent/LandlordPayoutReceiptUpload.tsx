import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Camera, Upload, Loader2, CheckCircle2 } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  payout: {
    id: string;
    landlord_name: string;
    amount: number;
    finops_momo_reference?: string | null;
  } | null;
  onSuccess?: () => void;
};

function formatUGX(n: number) {
  return `UGX ${Number(n).toLocaleString()}`;
}

export function LandlordPayoutReceiptUpload({ open, onOpenChange, payout, onSuccess }: Props) {
  const qc = useQueryClient();
  const [receiptNumber, setReceiptNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setReceiptNumber('');
    setFile(null);
    setPreviewUrl(null);
    setSubmitting(false);
  };

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast.error('Image must be smaller than 8 MB');
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!payout) return;
    if (receiptNumber.trim().length < 4) {
      toast.error('Receipt number must be at least 4 characters');
      return;
    }
    if (!file) {
      toast.error('Please attach the receipt image');
      return;
    }
    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) throw new Error('Not signed in');

      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${userId}/${payout.id}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('landlord-payout-receipts')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { error: fnErr } = await supabase.functions.invoke('submit-landlord-payout-receipt', {
        body: {
          payout_id: payout.id,
          receipt_number: receiptNumber.trim(),
          receipt_image_url: path,
        },
      });
      if (fnErr) throw fnErr;

      toast.success('Receipt filed — payout completed');
      qc.invalidateQueries({ queryKey: ['agent-pending-receipts'] });
      qc.invalidateQueries({ queryKey: ['agent-landlord-float'] });
      qc.invalidateQueries({ queryKey: ['landlord-float-allocations'] });
      onSuccess?.();
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to submit receipt');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Upload landlord receipt
          </DialogTitle>
          <DialogDescription>
            {payout && (
              <>
                Confirm the {formatUGX(payout.amount)} you collected for <span className="font-semibold text-foreground">{payout.landlord_name}</span>.
                {payout.finops_momo_reference && (
                  <> MoMo ref: <span className="font-mono">{payout.finops_momo_reference}</span></>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="receipt-no">Landlord receipt number *</Label>
            <Input
              id="receipt-no"
              value={receiptNumber}
              onChange={e => setReceiptNumber(e.target.value)}
              placeholder="e.g. RCT-00482"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground mt-1">From the landlord's own receipt book.</p>
          </div>

          <div>
            <Label>Receipt photo *</Label>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0] ?? null)}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0] ?? null)}
            />

            {previewUrl ? (
              <div className="relative rounded-lg overflow-hidden border bg-muted">
                <img src={previewUrl} alt="Receipt preview" className="w-full max-h-64 object-contain" />
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute top-2 right-2"
                  onClick={() => { setFile(null); setPreviewUrl(null); }}
                >
                  Replace
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()}>
                  <Camera className="h-4 w-4 mr-1" /> Take photo
                </Button>
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1" /> Choose file
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Later
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !file || receiptNumber.trim().length < 4}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Receipt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
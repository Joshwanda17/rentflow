import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, UserX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RemoveTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  houseId: string;
  houseTitle: string;
  onComplete?: () => void;
}

export function RemoveTenantDialog({ open, onOpenChange, houseId, houseTitle, onComplete }: RemoveTenantDialogProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setReason(''); } }, [open]);

  const canSubmit = reason.trim().length >= 10 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('landlord_ops_remove_tenant_from_house', {
        p_house_id: houseId,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      toast({ title: 'Tenant removed', description: `${houseTitle} is now marked vacant.` });
      onComplete?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message ?? String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-destructive" />
            Remove tenant from house
          </DialogTitle>
          <DialogDescription>
            Use this when the tenant has absconded or moved out of <span className="font-medium">{houseTitle}</span>.
            The house will be marked available again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Reason (min 10 characters)</Label>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Tenant absconded after missing 14 days of rent"
            rows={3}
            disabled={busy}
          />
          <p className="text-[11px] text-muted-foreground">{reason.trim().length}/10</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={!canSubmit}>
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Confirm remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

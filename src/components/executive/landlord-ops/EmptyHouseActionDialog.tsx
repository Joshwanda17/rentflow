import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Trash2, XCircle } from 'lucide-react';

interface EmptyHouseActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  listingTitle: string;
  actionType: 'delete' | 'delist' | 'reject';
  userId: string;
  onComplete: () => void;
}

export function EmptyHouseActionDialog({
  open,
  onOpenChange,
  listingId,
  listingTitle,
  actionType,
  userId,
  onComplete,
}: EmptyHouseActionDialogProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const isDelete = actionType === 'delete';
  const isReject = actionType === 'reject';
  const label = isDelete ? 'Delete' : isReject ? 'Reject' : 'Delist';
  const minChars = 10;
  const valid = reason.trim().length >= minChars;

  const handleSubmit = async () => {
    if (!valid) return;
    setLoading(true);
    try {
      if (isDelete) {
        const { error } = await supabase.from('house_listings').delete().eq('id', listingId);
        if (error) throw error;
      } else {
        const newStatus = isReject ? 'rejected' : 'delisted';
        const { error } = await supabase.from('house_listings').update({ status: newStatus }).eq('id', listingId);
        if (error) throw error;
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action_type: isDelete ? 'listing_deleted' : isReject ? 'listing_rejected' : 'listing_delisted',
        table_name: 'house_listings',
        record_id: listingId,
        metadata: { reason: reason.trim(), listing_title: listingTitle },
      });

      toast({ title: `${label}ed`, description: `${listingTitle} has been ${label.toLowerCase()}ed.` });
      setReason('');
      onOpenChange(false);
      onComplete();
    } catch (err: any) {
      toast({ title: `${label} Failed`, description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDelete ? <Trash2 className="h-4 w-4 text-destructive" /> : isReject ? <XCircle className="h-4 w-4 text-orange-600" /> : <XCircle className="h-4 w-4 text-warning" />}
            {label} Listing
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            You are about to <strong>{label.toLowerCase()}</strong> <strong>{listingTitle}</strong>. This action will be logged.
          </p>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Reason (min {minChars} characters) *
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={`Why is this listing being ${label.toLowerCase()}ed?`}
              className="min-h-[80px]"
            />
            {reason.length > 0 && reason.trim().length < minChars && (
              <p className="text-[10px] text-destructive mt-1">{minChars - reason.trim().length} more characters needed</p>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant={isDelete ? 'destructive' : 'warning'}
              size="sm"
              onClick={handleSubmit}
              disabled={!valid || loading}
            >
              {loading ? 'Processing...' : `${label} Listing`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

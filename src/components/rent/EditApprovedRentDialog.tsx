import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';


interface EditableRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
  access_fee?: number;
  request_fee?: number;
  total_repayment?: number;
  daily_repayment?: number;
  number_of_payments?: number | null;
}

interface EditApprovedRentDialogProps {
  request: EditableRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const EDITABLE_FIELDS = [
  { key: 'rent_amount', label: 'Rent Amount (UGX)', type: 'number' },
  { key: 'duration_days', label: 'Duration (Days)', type: 'number' },
  { key: 'access_fee', label: 'Access Fee (UGX)', type: 'number' },
  { key: 'request_fee', label: 'Request Fee (UGX)', type: 'number' },
  { key: 'total_repayment', label: 'Total Repayment (UGX)', type: 'number' },
  { key: 'daily_repayment', label: 'Daily Repayment (UGX)', type: 'number' },
  { key: 'number_of_payments', label: 'Number of Payments', type: 'number' },
] as const;

export function EditApprovedRentDialog({ request, open, onOpenChange, onSaved }: EditApprovedRentDialogProps) {
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState(false);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen && request) {
      const initial: Record<string, number | null> = {};
      EDITABLE_FIELDS.forEach(f => {
        initial[f.key] = (request as any)[f.key] ?? null;
      });
      setValues(initial);
    }
    onOpenChange(isOpen);
  };

  const handleSave = async () => {
    if (!request) return;
    setSaving(true);

    const updates: Record<string, number | null> = {};
    EDITABLE_FIELDS.forEach(f => {
      const newVal = values[f.key];
      const oldVal = (request as any)[f.key] ?? null;
      if (newVal !== oldVal) {
        updates[f.key] = newVal;
      }
    });

    if (Object.keys(updates).length === 0) {
      toast.info('No changes made');
      setSaving(false);
      onOpenChange(false);
      return;
    }

    const { error } = await supabase
      .from('rent_requests')
      .update(updates)
      .eq('id', request.id);

    setSaving(false);

    if (error) {
      console.error('Rent request update error:', error);
      toast.error('Failed to update: ' + (error.message || error.code || 'Unknown error'));
    } else {
      toast.success('Rent request updated successfully');
      onOpenChange(false);
      onSaved();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Approved Rent Request</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {EDITABLE_FIELDS.map(f => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs font-medium">{f.label}</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={values[f.key] ?? ''}
                onChange={e => {
                  const val = e.target.value === '' ? null : Number(e.target.value);
                  setValues(prev => ({ ...prev, [f.key]: val }));
                }}
                className="h-9"
              />
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

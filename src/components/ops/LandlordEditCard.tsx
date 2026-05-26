import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Pencil, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

type Props = {
  landlordId: string;
  landlord: any;
  canEdit: boolean;
};

const FIELDS: Array<{ key: string; label: string; type?: 'text' | 'number' | 'textarea' }> = [
  { key: 'name', label: 'Landlord name' },
  { key: 'phone', label: 'Phone' },
  { key: 'mobile_money_number', label: 'MoMo number' },
  { key: 'mobile_money_name', label: 'MoMo name' },
  { key: 'monthly_rent', label: 'Monthly rent (UGX)', type: 'number' },
  { key: 'number_of_rooms', label: 'Rooms', type: 'number' },
  { key: 'property_address', label: 'Property address' },
  { key: 'district', label: 'District' },
  { key: 'sub_county', label: 'Sub-county' },
  { key: 'village', label: 'Village' },
  { key: 'house_number', label: 'House number' },
  { key: 'bank_name', label: 'Bank name' },
  { key: 'account_number', label: 'Bank account #' },
  { key: 'caretaker_name', label: 'Caretaker name' },
  { key: 'caretaker_phone', label: 'Caretaker phone' },
  { key: 'electricity_meter_number', label: 'Electricity meter #' },
  { key: 'water_meter_number', label: 'Water meter #' },
  { key: 'description', label: 'Description / notes', type: 'textarea' },
];

export function LandlordEditCard({ landlordId, landlord, canEdit }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, landlord?.[f.key] != null ? String(landlord[f.key]) : ''])),
  );
  const [reason, setReason] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 10) throw new Error('Reason must be ≥ 10 characters');
      const patch: Record<string, string> = {};
      for (const f of FIELDS) {
        const original = landlord?.[f.key] != null ? String(landlord[f.key]) : '';
        const next = (form[f.key] ?? '').trim();
        if (next !== original.trim()) patch[f.key] = next;
      }
      if (Object.keys(patch).length === 0) throw new Error('No changes to save');
      const { error } = await supabase.rpc('ops_update_landlord' as any, {
        p_landlord_id: landlordId,
        p_patch: patch,
        p_reason: reason.trim(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Landlord profile updated');
      qc.invalidateQueries({ queryKey: ['drilldown-landlord', landlordId] });
      setOpen(false);
      setReason('');
    },
    onError: (e: any) => toast.error(e.message ?? 'Update failed'),
  });

  if (!canEdit) return null;

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="h-8 w-full justify-center" onClick={() => setOpen(true)}>
        <Pencil className="h-3 w-3 mr-1" /> Edit landlord profile
      </Button>
    );
  }

  return (
    <Card className="p-3 space-y-2 border-primary/40">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium flex items-center gap-1">
          <Pencil className="h-3 w-3" /> Edit landlord profile
        </div>
        <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setOpen(false)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
            <Label className="text-[10px] uppercase text-muted-foreground">{f.label}</Label>
            {f.type === 'textarea' ? (
              <Textarea
                value={form[f.key] ?? ''}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                rows={2}
                className="text-xs"
              />
            ) : (
              <Input
                type={f.type === 'number' ? 'number' : 'text'}
                value={form[f.key] ?? ''}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                className="h-8 text-sm"
              />
            )}
          </div>
        ))}
      </div>
      <Textarea
        placeholder="Reason for change (min 10 chars) — required audit log"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="text-xs"
      />
      <Button
        size="sm"
        className="w-full"
        disabled={save.isPending || reason.trim().length < 10}
        onClick={() => save.mutate()}
      >
        {save.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
        Save landlord changes
      </Button>
    </Card>
  );
}
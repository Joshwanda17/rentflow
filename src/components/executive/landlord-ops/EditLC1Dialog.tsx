import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';

interface LC1Data {
  id: string;
  name: string;
  phone: string | null;
  village: string | null;
  listingIds: string[];
}

interface Props {
  lc1: LC1Data | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EditLC1Dialog({ lc1, open, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', village: '' });

  useEffect(() => {
    if (!open || !lc1) return;
    let cancelled = false;
    const fetchFresh = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('lc1_chairpersons')
          .select('name, phone, village')
          .eq('id', lc1.id)
          .maybeSingle();
        if (!cancelled) {
          setForm({
            name: data?.name || lc1.name || '',
            phone: data?.phone || lc1.phone || '',
            village: data?.village || lc1.village || '',
          });
        }
      } catch {
        if (!cancelled) {
          setForm({
            name: lc1.name || '',
            phone: lc1.phone || '',
            village: lc1.village || '',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchFresh();
    return () => { cancelled = true; };
  }, [open, lc1]);

  const handleSave = async () => {
    if (!lc1 || !user) return;
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const updates: Record<string, string | null> = {
        lc1_chairperson_name: form.name.trim(),
        lc1_chairperson_phone: form.phone.trim() || null,
        lc1_chairperson_village: form.village.trim() || null,
      };

      for (const listingId of lc1.listingIds) {
        await supabase.from('house_listings').update(updates).eq('id', listingId);
      }

      const { error: lc1Error, data: updatedRows } = await supabase.from('lc1_chairpersons').update({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        village: form.village.trim() || null,
      }).eq('id', lc1.id).select();

      if (lc1Error) throw lc1Error;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Update failed — no rows were modified. You may lack permission.');
      }

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'lc1_profile_edited',
        table_name: 'house_listings',
        record_id: lc1.listingIds[0] || null,
        metadata: {
          original_name: lc1.name,
          updated_name: form.name.trim(),
          listings_updated: lc1.listingIds.length,
          editor_role: 'landlord_ops',
        },
      });

      toast.success(`LC1 profile updated across ${lc1.listingIds.length} listing(s)`);
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update LC1');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Edit LC1 Chairperson</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="LC1 Chairperson name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="07XXXXXXXX" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Village</Label>
              <Input value={form.village} onChange={e => setForm(f => ({ ...f, village: e.target.value }))} placeholder="Village name" />
            </div>
            <p className="text-[10px] text-muted-foreground">
              This will update {lc1?.listingIds.length || 0} house listing(s) linked to this LC1.
            </p>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

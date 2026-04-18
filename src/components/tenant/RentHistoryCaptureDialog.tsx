import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import RentHistoryCaptureGrid, { RentHistoryEntry } from '@/components/agent/RentHistoryCaptureGrid';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function RentHistoryCaptureDialog({ open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<RentHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pre-load existing records so the tenant can see + extend their history
  useEffect(() => {
    if (!open || !user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('rent_history_records')
        .select('id, landlord_name, landlord_phone, property_location, rent_amount, start_date')
        .eq('tenant_id', user.id)
        .order('start_date', { ascending: false });

      if (!cancelled) {
        if (error) {
          console.warn('[rent-history] load error', error);
        } else if (data) {
          setEntries(
            data
              .filter((r) => r.start_date)
              .map((r) => ({
                monthKey: format(new Date(r.start_date as string), 'yyyy-MM'),
                landlord_name: r.landlord_name || '',
                landlord_phone: r.landlord_phone || '',
                property_location: r.property_location || '',
                rent_amount: Number(r.rent_amount) || 0,
              }))
          );
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;
    const valid = entries.filter(
      (e) =>
        e.rent_amount > 0 &&
        e.landlord_name.trim() &&
        e.landlord_phone.trim() &&
        e.property_location.trim()
    );
    if (valid.length === 0) {
      toast.error('Add at least one complete month before saving');
      return;
    }

    setSaving(true);
    try {
      // Fetch already-saved month keys so we only insert new ones
      // (tenants can't delete; back-office verifies/edits existing rows).
      const { data: existing, error: fetchErr } = await supabase
        .from('rent_history_records')
        .select('start_date')
        .eq('tenant_id', user.id);
      if (fetchErr) throw fetchErr;

      const existingKeys = new Set(
        (existing ?? [])
          .filter((r) => r.start_date)
          .map((r) => format(new Date(r.start_date as string), 'yyyy-MM'))
      );

      const fresh = valid.filter((e) => !existingKeys.has(e.monthKey));
      if (fresh.length === 0) {
        toast.info('All entered months are already on file', {
          description: 'Add a new month or wait for verification.',
        });
        setSaving(false);
        return;
      }

      const { error: insErr } = await supabase.from('rent_history_records').insert(
        fresh.map((e) => ({
          tenant_id: user.id,
          landlord_name: e.landlord_name.trim(),
          landlord_phone: e.landlord_phone.trim(),
          property_location: e.property_location.trim(),
          rent_amount: e.rent_amount,
          months_paid: 1,
          start_date: `${e.monthKey}-01`,
          status: 'pending',
        }))
      );
      if (insErr) throw insErr;

      toast.success(`Saved ${fresh.length} new month${fresh.length === 1 ? '' : 's'} of rent history`, {
        description: 'Welile will verify your records and unlock your higher limit.',
      });
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error('[rent-history] save error', err);
      toast.error(err.message || 'Failed to save rent history');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Record your rent history
          </DialogTitle>
          <DialogDescription>
            For each of the last 12 months, tell us who your landlord was, where you stayed and how much rent you paid. The more you record, the higher your Welile limit grows.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading your history…
            </div>
          ) : (
            <RentHistoryCaptureGrid entries={entries} onChange={setEntries} />
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-end gap-2 bg-muted/20">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading} className="min-w-[120px]">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" /> Save history
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

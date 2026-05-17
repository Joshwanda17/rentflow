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
import { Loader2 } from 'lucide-react';

interface EditHouseListingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: HouseListing | null;
  onSaved?: () => void;
}

export function EditHouseListingDialog({ open, onOpenChange, listing, onSaved }: EditHouseListingDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [region, setRegion] = useState('');
  const [monthlyRent, setMonthlyRent] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (listing) {
      setTitle(listing.title);
      setAddress(listing.address);
      setRegion(listing.region);
      setMonthlyRent(listing.monthly_rent);
      setDescription(listing.description ?? '');
    }
  }, [listing]);

  if (!listing) return null;

  const calc = monthlyRent > 0 ? calculateDailyRentalRate(monthlyRent) : null;

  const handleSave = async () => {
    if (!title.trim() || !address.trim() || !region.trim() || monthlyRent <= 0) {
      toast({ title: 'Missing info', description: 'Title, address, region and rent are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const updates: any = {
        title: title.trim(),
        address: address.trim(),
        region: region.trim(),
        description: description.trim() || null,
        monthly_rent: monthlyRent,
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
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
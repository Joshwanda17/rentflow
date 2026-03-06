import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useGeoLocation } from '@/hooks/useGeoLocation';
import { useProfile } from '@/hooks/useProfile';
import { MapPin, Loader2, CheckCircle2, User, Phone, Home, Banknote } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface Tenant {
  id: string;
  full_name: string;
  phone: string;
  city?: string;
  monthly_rent?: number;
}

interface AgentVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (visitId: string, tenant: Tenant) => void;
}

export function AgentVisitDialog({ open, onOpenChange, onSuccess }: AgentVisitDialogProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const { loading: gpsLoading, captureLocation } = useGeoLocation();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (open && profile?.id) loadTenants();
    if (!open) { setSelectedTenant(null); setSuccess(false); setSearchQuery(''); }
  }, [open, profile?.id]);

  const loadTenants = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, phone, city, monthly_rent')
      .eq('referrer_id', profile!.id)
      .order('full_name');
    setTenants((data as Tenant[]) || []);
  };

  const filtered = tenants.filter(t =>
    t.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.phone.includes(searchQuery)
  );

  const handleCheckIn = async () => {
    if (!selectedTenant || !profile?.id) return;
    setSaving(true);

    const loc = await captureLocation();
    if (!loc) {
      toast({ title: 'Could not capture GPS location', variant: 'destructive' });
      setSaving(false);
      return;
    }

    const { data, error } = await supabase.from('agent_visits').insert({
      agent_id: profile.id,
      tenant_id: selectedTenant.id,
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
    }).select('id').single();

    setSaving(false);
    if (error) {
      toast({ title: 'Failed to record visit', description: error.message, variant: 'destructive' });
      return;
    }

    setSuccess(true);
    toast({ title: 'Visit recorded successfully!' });
    onSuccess?.(data.id, selectedTenant);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-500" />
            Visit Tenant
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="text-center py-8 space-y-3">
            <div className="w-16 h-16 mx-auto bg-success/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold">Visit Recorded!</h3>
            <p className="text-sm text-muted-foreground">{selectedTenant?.full_name}</p>
            <Button onClick={() => onOpenChange(false)} className="w-full h-12">Done</Button>
          </div>
        ) : !selectedTenant ? (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Search tenant..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 rounded-lg border border-input bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No tenants found</p>}
              {filtered.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTenant(t)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 text-left transition-colors"
                >
                  <div className="p-2 rounded-lg bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{t.full_name}</p>
                    <p className="text-xs text-muted-foreground">{t.phone}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tenant details */}
            <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">{selectedTenant.full_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                <span>{selectedTenant.phone}</span>
              </div>
              {selectedTenant.city && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Home className="h-3.5 w-3.5" />
                  <span>{selectedTenant.city}</span>
                </div>
              )}
              {selectedTenant.monthly_rent && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Banknote className="h-3.5 w-3.5" />
                  <span>Rent: {formatUGX(selectedTenant.monthly_rent)}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelectedTenant(null)} className="flex-1 h-12">
                Back
              </Button>
              <Button onClick={handleCheckIn} disabled={saving || gpsLoading} className="flex-1 h-12">
                {saving || gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                  <>
                    <MapPin className="h-4 w-4 mr-1" />
                    Check In
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

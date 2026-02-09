import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUGX } from '@/lib/rentCalculations';
import { Building2, MapPin, Phone, Banknote, BedDouble, Home, ExternalLink, ClipboardList } from 'lucide-react';

interface ManagedProperty {
  id: string;
  name: string;
  phone: string;
  mobile_money_number: string | null;
  property_address: string;
  description: string | null;
  number_of_rooms: number | null;
  number_of_houses: number | null;
  monthly_rent: number | null;
  latitude: number | null;
  longitude: number | null;
  tenant_id: string | null;
  tenant_name?: string | null;
}

interface AgentManagedPropertiesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestPayout?: (property: ManagedProperty) => void;
}

export function AgentManagedPropertiesSheet({ open, onOpenChange, onRequestPayout }: AgentManagedPropertiesSheetProps) {
  const { user } = useAuth();
  const [properties, setProperties] = useState<ManagedProperty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && user) fetchProperties();
  }, [open, user]);

  const fetchProperties = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('landlords')
      .select('id, name, phone, mobile_money_number, property_address, description, number_of_rooms, number_of_houses, monthly_rent, latitude, longitude, tenant_id')
      .eq('managed_by_agent_id', user.id)
      .eq('is_agent_managed', true);

    const withTenants = await Promise.all(
      (data || []).map(async (p) => {
        if (p.tenant_id) {
          const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', p.tenant_id).maybeSingle();
          return { ...p, tenant_name: profile?.full_name };
        }
        return { ...p, tenant_name: null };
      })
    );

    setProperties(withTenants);
    setLoading(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl p-0">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Properties You Manage ({properties.length})
          </SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto p-4 space-y-3" style={{ maxHeight: 'calc(85vh - 70px)' }}>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))
          ) : properties.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">No managed properties yet</p>
              <p className="text-xs text-muted-foreground mt-1">Register a property for a landlord without a smartphone</p>
            </div>
          ) : (
            properties.map((p) => {
              const isOccupied = !!p.tenant_id;
              return (
                <div key={p.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary shrink-0" />
                        <p className="font-semibold text-sm truncate">{p.property_address}</p>
                      </div>
                      {p.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                      )}
                    </div>
                    <Badge variant={isOccupied ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
                      {isOccupied ? 'Occupied' : 'Empty'}
                    </Badge>
                  </div>

                  {/* Landlord info */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">For: {p.name}</span>
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Home className="h-3.5 w-3.5 shrink-0" />
                      <span>{p.number_of_houses || 1} unit(s)</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <BedDouble className="h-3.5 w-3.5 shrink-0" />
                      <span>{p.number_of_rooms || '—'} rooms</span>
                    </div>
                    <div className="flex items-center gap-1.5 justify-end">
                      <Banknote className="h-3.5 w-3.5 text-success shrink-0" />
                      <span className="font-semibold text-success">{formatUGX(p.monthly_rent || 0)}</span>
                    </div>
                  </div>

                  {/* Tenant */}
                  {isOccupied && p.tenant_name && (
                    <p className="text-xs text-muted-foreground">
                      Tenant: <span className="font-medium text-foreground">{p.tenant_name}</span>
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    {p.latitude && p.longitude && (
                      <Button variant="outline" size="sm" className="text-xs flex-1" asChild>
                        <a href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" /> Map
                        </a>
                      </Button>
                    )}
                    {onRequestPayout && (
                      <Button variant="default" size="sm" className="text-xs flex-1" onClick={() => onRequestPayout(p)}>
                        <ClipboardList className="h-3 w-3 mr-1" /> Request Payout
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Shield, Home, MapPin, CheckCircle2, Loader2, Navigation } from 'lucide-react';

import { hapticTap } from '@/lib/haptics';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { formatUGX } from '@/lib/rentCalculations';
import { VerifyTenantButton } from '@/components/verification';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface UnverifiedRequest {
  id: string;
  rent_amount: number;
  created_at: string;
  landlord_id: string;
  tenant?: { full_name: string; city: string } | null;
  landlord?: { name: string; property_address: string; latitude: number | null; longitude: number | null } | null;
}

interface UnverifiedHouse {
  id: string;
  title: string;
  address: string;
  region: string;
  monthly_rent: number;
  daily_rate: number;
  number_of_rooms: number;
  house_category: string;
  status: string;
  created_at: string;
  verified: boolean | null;
  latitude: number | null;
  longitude: number | null;
}

export function VerificationOpportunitiesButton() {
  const { user } = useAuth();
  const [rentCount, setRentCount] = useState(0);
  const [houseCount, setHouseCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<UnverifiedRequest[]>([]);
  const [houses, setHouses] = useState<UnverifiedHouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifyingHouse, setVerifyingHouse] = useState<string | null>(null);
  const [promptHouseId, setPromptHouseId] = useState<string | null>(null);
  const [promptTenantId, setPromptTenantId] = useState<string | null>(null);
  const totalCount = rentCount + houseCount;

  useEffect(() => {
    fetchCounts();
  }, [open]);

  const fetchCounts = async () => {
    const [rentRes, houseRes] = await Promise.all([
      supabase
        .from('rent_requests')
        .select('*', { count: 'exact', head: true })
        .eq('agent_verified', false)
        .in('status', ['pending', 'approved']),
      supabase
        .from('house_listings')
        .select('*', { count: 'exact', head: true })
        .or('verified.is.null,verified.eq.false')
        .in('status', ['pending', 'available']),
    ]);
    setRentCount(rentRes.count || 0);
    setHouseCount(houseRes.count || 0);
  };

  const fetchAll = async () => {
    setLoading(true);
    const [rentRes, houseRes] = await Promise.all([
      supabase
        .from('rent_requests')
        .select('id, rent_amount, created_at, landlord_id, tenant:profiles!rent_requests_tenant_id_fkey(full_name, city), landlord:landlords!rent_requests_landlord_id_fkey(name, property_address, latitude, longitude)')
        .eq('agent_verified', false)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false }),
      supabase
        .from('house_listings')
        .select('id, title, address, region, monthly_rent, daily_rate, number_of_rooms, house_category, status, created_at, verified, latitude, longitude')
        .or('verified.is.null,verified.eq.false')
        .in('status', ['pending', 'available'])
        .order('created_at', { ascending: false }),
    ]);
    setRequests((rentRes.data as any) || []);
    setHouses((houseRes.data as any) || []);
    setLoading(false);
  };

  const handleOpen = () => {
    hapticTap();
    setOpen(true);
    fetchAll();
  };

  const handleVerifyHouse = async (houseId: string) => {
    if (!user) return;
    setVerifyingHouse(houseId);
    try {
      const { data, error } = await supabase.functions.invoke('credit-listing-bonus', {
        body: { listing_id: houseId },
      });
      if (error) throw error;
      if (data?.already_paid) {
        toast.success('Already verified and bonus paid.');
      } else {
        toast.success(`House verified! UGX 5,000 bonus credited to listing agent.`);
      }
      fetchCounts();
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Verification failed');
    }
    setVerifyingHouse(null);
  };

  const navigateToLandlord = (req: UnverifiedRequest) => {
    hapticTap();
    const ll = req.landlord;
    if (!ll) return;
    const dest = ll.latitude && ll.longitude
      ? `${ll.latitude},${ll.longitude}`
      : encodeURIComponent(`${ll.property_address}, Uganda`);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank');
  };

  if (totalCount === 0) return null;

  return (
    <>
      <button
        onClick={handleOpen}
        className="fixed bottom-24 sm:bottom-28 right-4 z-40 flex items-center gap-1.5 px-3 py-2 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 touch-manipulation text-xs active:scale-95 transition-transform"
      >
        <Shield className="h-3.5 w-3.5" />
        <span className="font-bold">Verify & Earn</span>
        <Badge variant="outline" className="bg-white/20 border-white/30 text-primary-foreground text-[10px] px-1 py-0">
          {totalCount}
        </Badge>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl p-0">
          <SheetHeader className="p-4 pb-2">
            <SheetTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-destructive" />
              Verification Opportunities
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              Verify houses & tenants to earn <span className="font-bold text-success">UGX 5,000–10,000</span> bonuses
            </p>
          </SheetHeader>

          <Tabs defaultValue="houses" className="flex-1">
            <TabsList className="mx-4 mb-2 w-[calc(100%-2rem)]">
              <TabsTrigger value="houses" className="flex-1 gap-1 text-xs">
                <Home className="h-3 w-3" /> Houses {houseCount > 0 && <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">{houseCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="tenants" className="flex-1 gap-1 text-xs">
                <Shield className="h-3 w-3" /> Tenants {rentCount > 0 && <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">{rentCount}</Badge>}
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[calc(85vh-160px)] px-4 pb-4">
              {/* ─── Houses Tab ─── */}
              <TabsContent value="houses" className="mt-0">
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
                  </div>
                ) : houses.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No houses to verify right now</p>
                ) : (
                  <div className="space-y-3">
                    {houses.map(house => (
                      <Card key={house.id} className="border-border/60">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">{house.title}</p>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{house.address}, {house.region}</span>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-warning/10 text-warning border-warning/30 shrink-0">
                              Pending
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="font-bold">{formatUGX(house.monthly_rent)}/mo</span>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-primary font-medium">{formatUGX(house.daily_rate)}/day</span>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-muted-foreground">{house.number_of_rooms} rooms</span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <p className="text-xs text-success font-medium">💰 UGX 5,000 listing bonus</p>
                              <Button
                                onClick={() => setPromptHouseId(promptHouseId === house.id ? null : house.id)}
                                variant={promptHouseId === house.id ? 'secondary' : 'default'}
                                size="sm"
                                className="gap-1 text-xs h-8"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Verify House
                              </Button>
                            </div>

                            {promptHouseId === house.id && (
                              <div
                                className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2"
                              >
                                <p className="text-xs font-semibold text-foreground">📍 Visit this house physically to verify it</p>
                                <p className="text-[11px] text-muted-foreground">Navigate to the property, confirm it exists and matches the listing, then tap "Confirm Verified".</p>
                                <div className="flex items-center gap-2">
                                  <Button
                                    onClick={() => {
                                      const dest = house.latitude && house.longitude
                                        ? `${house.latitude},${house.longitude}`
                                        : encodeURIComponent(`${house.address}, ${house.region}, Uganda`);
                                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank');
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 text-xs h-8 flex-1 border-primary/30 text-primary"
                                  >
                                    <Navigation className="h-3.5 w-3.5" />
                                    Navigate to House
                                  </Button>
                                  <Button
                                    onClick={() => { setPromptHouseId(null); handleVerifyHouse(house.id); }}
                                    disabled={verifyingHouse === house.id}
                                    size="sm"
                                    className="gap-1 text-xs h-8 flex-1"
                                  >
                                    {verifyingHouse === house.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    )}
                                    Confirm Verified
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ─── Tenants Tab (GPS-gated landlord visit) ─── */}
              <TabsContent value="tenants" className="mt-0">
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
                  </div>
                ) : requests.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No tenant requests to verify right now</p>
                ) : (
                  <div className="space-y-3">
                    {/* Info banner */}
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                      <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">GPS Required:</span> You must physically visit the landlord's property to verify each tenant.
                      </p>
                    </div>

                    {requests.map(req => (
                      <Card key={req.id} className="border-border/60">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold">{req.tenant?.full_name || 'Unknown Tenant'}</p>
                              <p className="text-xs text-muted-foreground">{req.tenant?.city || 'No location'}</p>
                            </div>
                            <p className="font-bold text-primary">{formatUGX(req.rent_amount)}</p>
                          </div>

                          {/* Landlord details with location */}
                          <div className="p-2.5 rounded-lg bg-muted/40 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Home className="h-3 w-3 text-muted-foreground" />
                              <p className="text-xs font-semibold">Landlord: {req.landlord?.name || 'Unknown'}</p>
                            </div>
                            <div className="flex items-center gap-1.5 pl-[18px]">
                              <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                              <p className="text-[11px] text-muted-foreground">{req.landlord?.property_address || 'N/A'}</p>
                            </div>
                            {req.landlord?.latitude && req.landlord?.longitude && (
                              <p className="text-[10px] text-primary/60 pl-[18px]">
                                📍 GPS: {req.landlord.latitude.toFixed(4)}, {req.landlord.longitude.toFixed(4)}
                              </p>
                            )}
                          </div>

                          <div className="flex justify-between items-center">
                            <div className="text-xs space-y-0.5">
                              <p className="text-success font-medium">💰 UGX 10,000 bonus</p>
                              <p className="text-success font-medium">📈 5% ongoing commission</p>
                            </div>
                            <Button
                              onClick={() => setPromptTenantId(promptTenantId === req.id ? null : req.id)}
                              variant={promptTenantId === req.id ? 'secondary' : 'default'}
                              size="sm"
                              className="gap-1 text-xs h-8"
                            >
                              <Shield className="h-3.5 w-3.5" />
                              Verify Tenant
                            </Button>
                          </div>

                          {/* GPS-gated visit prompt */}
                          {promptTenantId === req.id && (
                            <div
                              className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3"
                            >
                              <div>
                                <p className="text-xs font-semibold text-foreground">📍 Visit the landlord's property to verify this tenant</p>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                  Go to <span className="font-medium text-foreground">{req.landlord?.name || 'the landlord'}</span>'s property, confirm the tenant lives there, then complete verification.
                                </p>
                              </div>

                              {/* Navigate button */}
                              <Button
                                onClick={() => navigateToLandlord(req)}
                                variant="outline"
                                size="sm"
                                className="w-full gap-1.5 text-xs h-9 border-primary/30 text-primary"
                              >
                                <Navigation className="h-3.5 w-3.5" />
                                Navigate to Landlord's Property
                              </Button>

                              {/* Verify button (only after visiting) */}
                              <div className="pt-1 border-t border-border/40">
                                <p className="text-[10px] text-muted-foreground mb-2 text-center">
                                  ✅ Already at the property? Complete verification below
                                </p>
                                <VerifyTenantButton
                                  requestId={req.id}
                                  landlordId={req.landlord_id}
                                  variant="agent"
                                  onVerified={() => {
                                    setPromptTenantId(null);
                                    fetchCounts();
                                    fetchAll();
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}

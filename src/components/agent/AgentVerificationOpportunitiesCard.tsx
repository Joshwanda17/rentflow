import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, MapPin, Home, Navigation, CheckCircle2, Loader2, UserCheck, ChevronRight } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';
import { toast } from 'sonner';
import { VerifyTenantButton } from '@/components/verification';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useGeoLocation } from '@/hooks/useGeoLocation';

interface UnverifiedRequest {
  id: string;
  rent_amount: number;
  created_at: string;
  landlord_id: string;
  tenant_id: string;
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

export function AgentVerificationOpportunitiesCard() {
  const { user } = useAuth();
  const { captureLocation, loading: gpsLoading } = useGeoLocation();
  const [tenantCount, setTenantCount] = useState(0);
  const [houseCount, setHouseCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<UnverifiedRequest[]>([]);
  const [houses, setHouses] = useState<UnverifiedHouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifyingHouse, setVerifyingHouse] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Guarantee dialog state
  const [guaranteeDialog, setGuaranteeDialog] = useState<{ open: boolean; request: UnverifiedRequest | null }>({ open: false, request: null });
  const [guaranteeNote, setGuaranteeNote] = useState('');
  const [guaranteeing, setGuaranteeing] = useState(false);

  const totalCount = tenantCount + houseCount;

  // Preview items shown on the card itself
  const [previewTenants, setPreviewTenants] = useState<UnverifiedRequest[]>([]);
  const [previewHouses, setPreviewHouses] = useState<UnverifiedHouse[]>([]);

  useEffect(() => {
    fetchCountsAndPreviews();
  }, []);

  const fetchCountsAndPreviews = async () => {
    const [rentRes, houseRes] = await Promise.all([
      supabase.from('rent_requests').select('*', { count: 'exact', head: true }).eq('agent_verified', false).in('status', ['pending', 'approved']),
      supabase.from('house_listings').select('*', { count: 'exact', head: true }).or('verified.is.null,verified.eq.false').in('status', ['pending', 'available']),
    ]);
    setTenantCount(rentRes.count || 0);
    setHouseCount(houseRes.count || 0);

    // Fetch preview data — use separate queries to avoid RLS join issues
    const [tenantPreview, housePreview] = await Promise.all([
      supabase
        .from('rent_requests')
        .select('id, rent_amount, created_at, landlord_id, tenant_id')
        .eq('agent_verified', false)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('house_listings')
        .select('id, title, address, region, monthly_rent, daily_rate, number_of_rooms, house_category, status, created_at, verified, latitude, longitude')
        .or('verified.is.null,verified.eq.false')
        .in('status', ['pending', 'available'])
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

    if (tenantPreview.data && tenantPreview.data.length > 0) {
      const tenantIds = [...new Set(tenantPreview.data.map(r => r.tenant_id).filter(Boolean))];
      const landlordIds = [...new Set(tenantPreview.data.map(r => r.landlord_id).filter(Boolean))];

      const [profilesRes, landlordsRes] = await Promise.all([
        tenantIds.length > 0
          ? supabase.from('profiles').select('id, full_name, city').in('id', tenantIds)
          : Promise.resolve({ data: [] }),
        landlordIds.length > 0
          ? supabase.from('landlords').select('id, name, property_address, latitude, longitude').in('id', landlordIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
      const landlordMap = new Map((landlordsRes.data || []).map((l: any) => [l.id, l]));

      setPreviewTenants(tenantPreview.data.map((r: any) => ({
        ...r,
        tenant: profileMap.get(r.tenant_id) || null,
        landlord: landlordMap.get(r.landlord_id) || null,
      })));
    } else {
      setPreviewTenants([]);
    }

    setPreviewHouses((housePreview.data as any) || []);
  };

  const fetchAll = async () => {
    setLoading(true);

    // Use separate queries to avoid RLS join issues
    const [rentRes, houseRes] = await Promise.all([
      supabase
        .from('rent_requests')
        .select('id, rent_amount, created_at, landlord_id, tenant_id')
        .eq('agent_verified', false)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('house_listings')
        .select('id, title, address, region, monthly_rent, daily_rate, number_of_rooms, house_category, status, created_at, verified, latitude, longitude')
        .or('verified.is.null,verified.eq.false')
        .in('status', ['pending', 'available'])
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (rentRes.data && rentRes.data.length > 0) {
      const tenantIds = [...new Set(rentRes.data.map(r => r.tenant_id).filter(Boolean))];
      const landlordIds = [...new Set(rentRes.data.map(r => r.landlord_id).filter(Boolean))];

      const [profilesRes, landlordsRes] = await Promise.all([
        tenantIds.length > 0
          ? supabase.from('profiles').select('id, full_name, city').in('id', tenantIds)
          : Promise.resolve({ data: [] }),
        landlordIds.length > 0
          ? supabase.from('landlords').select('id, name, property_address, latitude, longitude').in('id', landlordIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
      const landlordMap = new Map((landlordsRes.data || []).map((l: any) => [l.id, l]));

      setRequests(rentRes.data.map((r: any) => ({
        ...r,
        tenant: profileMap.get(r.tenant_id) || null,
        landlord: landlordMap.get(r.landlord_id) || null,
      })));
    } else {
      setRequests([]);
    }

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
      toast.success(data?.already_paid ? 'Already verified.' : 'House verified! UGX 5,000 bonus credited.');
      fetchCountsAndPreviews();
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Verification failed');
    }
    setVerifyingHouse(null);
  };

  const handleGuarantee = async () => {
    if (!user || !guaranteeDialog.request) return;
    setGuaranteeing(true);
    
    const loc = await captureLocation();

    // Mark agent_verified on the rent_request — agent is guaranteeing this tenant
    const { error } = await supabase
      .from('rent_requests')
      .update({
        agent_verified: true,
        agent_verified_by: user.id,
        agent_verified_at: new Date().toISOString(),
      })
      .eq('id', guaranteeDialog.request.id);

    if (error) {
      toast.error('Failed to guarantee tenant');
      setGuaranteeing(false);
      return;
    }

    // Record a visit if GPS was captured
    if (loc) {
      await supabase.from('agent_visits').insert({
        agent_id: user.id,
        tenant_id: guaranteeDialog.request.tenant_id,
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy,
      });
    }

    toast.success('Tenant guaranteed! You\'ll earn 5% ongoing commission on repayments.');
    setGuaranteeDialog({ open: false, request: null });
    setGuaranteeNote('');
    setGuaranteeing(false);
    fetchCountsAndPreviews();
    fetchAll();
  };

  return (
    <>
      {/* Dashboard Card */}
      <Card className="border-border/60 bg-card overflow-hidden animate-fade-in">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm text-foreground">Verify & Earn</p>
                <p className="text-[10px] text-muted-foreground">Tenants & houses needing verification</p>
              </div>
            </div>
            {totalCount > 0 && (
              <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-xs font-bold px-2">
                {totalCount} pending
              </Badge>
            )}
          </div>

          {totalCount === 0 ? (
            <div className="text-center py-4 space-y-1">
              <CheckCircle2 className="h-8 w-8 text-success/40 mx-auto" />
              <p className="text-xs text-muted-foreground">All caught up! No verifications pending.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Tenant previews */}
              {tenantCount > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-primary" />
                      <p className="text-xs font-bold text-foreground">{tenantCount} Tenant{tenantCount > 1 ? 's' : ''} to Verify</p>
                    </div>
                    <p className="text-[10px] text-success font-medium">💰 UGX 10,000 each</p>
                  </div>
                  {previewTenants.map(req => (
                    <div key={req.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border/30">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">{(req.tenant as any)?.full_name || 'Unknown Tenant'}</p>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{(req.landlord as any)?.property_address || (req.tenant as any)?.city || 'N/A'}</span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-primary shrink-0 ml-2">{formatUGX(req.rent_amount)}</span>
                    </div>
                  ))}
                  {tenantCount > 3 && (
                    <p className="text-[10px] text-muted-foreground text-center">+{tenantCount - 3} more tenants</p>
                  )}
                </div>
              )}

              {/* House previews */}
              {houseCount > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Home className="h-3.5 w-3.5 text-chart-4" />
                      <p className="text-xs font-bold text-foreground">{houseCount} House{houseCount > 1 ? 's' : ''} to Verify</p>
                    </div>
                    <p className="text-[10px] text-success font-medium">💰 UGX 5,000 each</p>
                  </div>
                  {previewHouses.map(house => (
                    <div key={house.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border/30">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">{house.title}</p>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{house.address}, {house.region}</span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-primary shrink-0 ml-2">{formatUGX(house.monthly_rent)}</span>
                    </div>
                  ))}
                  {houseCount > 3 && (
                    <p className="text-[10px] text-muted-foreground text-center">+{houseCount - 3} more houses</p>
                  )}
                </div>
              )}

              <Button onClick={handleOpen} className="w-full h-11 font-bold gap-2 text-sm">
                <Shield className="h-4 w-4" />
                View All & Verify
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full List Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl p-0">
          <SheetHeader className="p-4 pb-2">
            <SheetTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Verification Opportunities
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              Visit or guarantee tenants to earn <span className="font-bold text-success">UGX 5,000–10,000</span>
            </p>
          </SheetHeader>

          <Tabs defaultValue={tenantCount > 0 ? 'tenants' : 'houses'} className="flex-1">
            <TabsList className="mx-4 mb-2 w-[calc(100%-2rem)]">
              <TabsTrigger value="tenants" className="flex-1 gap-1 text-xs">
                <UserCheck className="h-3 w-3" /> Tenants {tenantCount > 0 && <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">{tenantCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="houses" className="flex-1 gap-1 text-xs">
                <Home className="h-3 w-3" /> Houses {houseCount > 0 && <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">{houseCount}</Badge>}
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[calc(90vh-160px)] px-4 pb-4">
              {/* Tenants Tab */}
              <TabsContent value="tenants" className="mt-0">
                {loading ? (
                  <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}</div>
                ) : requests.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">No tenants to verify right now</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                      <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Two ways to verify:</span> Visit the tenant physically <em>or</em> guarantee them if you know them personally.
                      </p>
                    </div>

                    {requests.map((req, i) => (
                      <motion.div
                        key={req.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                      >
                        <Card className="border-border/60">
                          <CardContent className="p-4 space-y-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-semibold text-sm">{(req.tenant as any)?.full_name || 'Unknown Tenant'}</p>
                                <p className="text-xs text-muted-foreground">{(req.tenant as any)?.city || 'No location'}</p>
                              </div>
                              <p className="font-bold text-primary text-sm">{formatUGX(req.rent_amount)}</p>
                            </div>

                            {/* Landlord details */}
                            <div className="p-2.5 rounded-lg bg-muted/40 space-y-1">
                              <div className="flex items-center gap-1.5">
                                <Home className="h-3 w-3 text-muted-foreground" />
                                <p className="text-xs font-semibold">Landlord: {(req.landlord as any)?.name || 'Unknown'}</p>
                              </div>
                              <div className="flex items-center gap-1.5 pl-[18px]">
                                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                                <p className="text-[11px] text-muted-foreground">{(req.landlord as any)?.property_address || 'N/A'}</p>
                              </div>
                            </div>

                            <div className="text-xs space-y-0.5">
                              <p className="text-success font-medium">💰 UGX 10,000 verification bonus</p>
                              <p className="text-success font-medium">📈 5% ongoing commission on repayments</p>
                            </div>

                            {/* Two action buttons */}
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                                variant="outline"
                                size="sm"
                                className="gap-1.5 text-xs h-10 border-primary/30 text-primary"
                              >
                                <MapPin className="h-3.5 w-3.5" />
                                Visit & Verify
                              </Button>
                              <Button
                                onClick={() => {
                                  hapticTap();
                                  setGuaranteeDialog({ open: true, request: req });
                                }}
                                variant="default"
                                size="sm"
                                className="gap-1.5 text-xs h-10 bg-chart-4 hover:bg-chart-4/90"
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                                Guarantee
                              </Button>
                            </div>

                            {/* Expanded visit verification */}
                            {expandedId === req.id && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3"
                              >
                                <p className="text-xs font-semibold">📍 Visit the landlord's property to verify</p>
                                <Button
                                  onClick={() => {
                                    const ll = req.landlord as any;
                                    if (!ll) return;
                                    const dest = ll.latitude && ll.longitude
                                      ? `${ll.latitude},${ll.longitude}`
                                      : encodeURIComponent(`${ll.property_address}, Uganda`);
                                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank');
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className="w-full gap-1.5 text-xs h-9 border-primary/30 text-primary"
                                >
                                  <Navigation className="h-3.5 w-3.5" />
                                  Navigate to Property
                                </Button>
                                <div className="pt-1 border-t border-border/40">
                                  <VerifyTenantButton
                                    requestId={req.id}
                                    landlordId={req.landlord_id}
                                    variant="agent"
                                    onVerified={() => {
                                      setExpandedId(null);
                                      fetchCountsAndPreviews();
                                      fetchAll();
                                    }}
                                  />
                                </div>
                              </motion.div>
                            )}
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Houses Tab */}
              <TabsContent value="houses" className="mt-0">
                {loading ? (
                  <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
                ) : houses.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">No houses to verify right now</p>
                ) : (
                  <div className="space-y-3">
                    {houses.map((house, i) => (
                      <motion.div
                        key={house.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                      >
                        <Card className="border-border/60">
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
                                Unverified
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="font-bold">{formatUGX(house.monthly_rent)}/mo</span>
                              <span className="text-muted-foreground">•</span>
                              <span>{house.number_of_rooms} rooms</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-success font-medium">💰 UGX 5,000 bonus</p>
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => {
                                    const dest = house.latitude && house.longitude
                                      ? `${house.latitude},${house.longitude}`
                                      : encodeURIComponent(`${house.address}, ${house.region}, Uganda`);
                                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank');
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className="gap-1 text-xs h-8"
                                >
                                  <Navigation className="h-3 w-3" />
                                </Button>
                                <Button
                                  onClick={() => handleVerifyHouse(house.id)}
                                  disabled={verifyingHouse === house.id}
                                  size="sm"
                                  className="gap-1 text-xs h-8"
                                >
                                  {verifyingHouse === house.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  )}
                                  Verify
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Guarantee Dialog */}
      <Dialog open={guaranteeDialog.open} onOpenChange={(v) => setGuaranteeDialog({ open: v, request: v ? guaranteeDialog.request : null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-chart-4" />
              Guarantee Tenant
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-muted/50 space-y-1">
              <p className="font-semibold text-sm">{(guaranteeDialog.request?.tenant as any)?.full_name}</p>
              <p className="text-xs text-muted-foreground">Rent: {formatUGX(guaranteeDialog.request?.rent_amount || 0)}</p>
            </div>

            <div className="p-3 rounded-xl bg-warning/5 border border-warning/20 space-y-1.5">
              <p className="text-xs font-semibold text-warning">⚠️ By guaranteeing this tenant:</p>
              <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-4">
                <li>You confirm you know this tenant personally</li>
                <li>You vouch for their ability to repay rent</li>
                <li>You'll earn <span className="font-bold text-success">5% commission</span> on their repayments</li>
                <li>Note: No UGX 5,000 verification bonus for guarantees</li>
              </ul>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">How do you know this tenant? (optional)</label>
              <Textarea
                value={guaranteeNote}
                onChange={(e) => setGuaranteeNote(e.target.value)}
                placeholder="E.g. neighbour, church member, friend..."
                className="mt-1.5 h-20 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setGuaranteeDialog({ open: false, request: null })} className="flex-1 h-11">
                Cancel
              </Button>
              <Button
                onClick={handleGuarantee}
                disabled={guaranteeing || gpsLoading}
                className="flex-1 h-11 bg-chart-4 hover:bg-chart-4/90 font-bold gap-2"
              >
                {guaranteeing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                Confirm Guarantee
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

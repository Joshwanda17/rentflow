import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import {
  Landmark, MapPin, Upload, Loader2, CheckCircle2, X, Phone,
  AlertCircle, ArrowRight, Clock, User2, Home, Camera
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface AgentFloatPayoutWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'select' | 'pay' | 'receipt' | 'done';

const GPS_MATCH_THRESHOLD = 500;

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function AgentFloatPayoutWizard({ open, onOpenChange }: AgentFloatPayoutWizardProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('select');
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [transactionId, setTransactionId] = useState('');
  const [provider, setProvider] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [agentGps, setAgentGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [landlordGps, setLandlordGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState<'agent' | 'landlord' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch float balance
  const { data: floatBalance = 0 } = useQuery({
    queryKey: ['agent-landlord-float', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data } = await supabase
        .from('agent_landlord_float')
        .select('balance')
        .eq('agent_id', user.id)
        .maybeSingle();
      return data?.balance ?? 0;
    },
    enabled: !!user && open,
  });

  // Fetch disbursed rent requests assigned to this agent
  const { data: assignedRequests = [], isLoading } = useQuery({
    queryKey: ['agent-float-payout-requests', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data: assignments } = await supabase
        .from('agent_landlord_assignments')
        .select('landlord_id, rent_request_id')
        .eq('agent_id', user.id)
        .eq('status', 'active');
      
      if (!assignments?.length) return [];
      const landlordIds = [...new Set(assignments.map(a => a.landlord_id))];

      const { data } = await supabase
        .from('rent_requests')
        .select('id, rent_amount, tenant_id, landlord_id, status, request_latitude, request_longitude, created_at')
        .in('landlord_id', landlordIds)
        .in('status', ['disbursed', 'coo_approved', 'funded'])
        .order('created_at', { ascending: false });

      // Enrich + filter already-paid
      const enriched = await Promise.all((data || []).map(async (r: any) => {
        const [{ data: landlord }, { data: tenant }, { data: existing }] = await Promise.all([
          supabase.from('landlords').select('id, name, phone, mobile_money_number').eq('id', r.landlord_id).single(),
          supabase.from('profiles').select('id, full_name, phone').eq('id', r.tenant_id).single(),
          supabase.from('agent_float_withdrawals').select('id').eq('rent_request_id', r.id).eq('agent_id', user.id).maybeSingle(),
        ]);
        return { ...r, landlord, tenant, hasPaid: !!existing?.id };
      }));

      return enriched.filter((r: any) => !r.hasPaid);
    },
    enabled: !!user && open,
  });

  const resetForm = () => {
    setStep('select');
    setSelectedRequest(null);
    setTransactionId('');
    setProvider('');
    setNotes('');
    setPhotos([]);
    setAgentGps(null);
    setLandlordGps(null);
  };

  const handleClose = () => { resetForm(); onOpenChange(false); };

  const captureGPS = (type: 'agent' | 'landlord') => {
    if (!navigator.geolocation) { toast.error('GPS not supported'); return; }
    setGpsLoading(type);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        if (type === 'agent') setAgentGps(loc);
        else setLandlordGps(loc);
        setGpsLoading(null);
        toast.success(`${type === 'agent' ? 'Your' : 'Landlord'} GPS captured`);
      },
      () => { setGpsLoading(null); toast.error('GPS access denied'); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 3) { toast.error('Max 3 photos'); return; }
    setPhotos(prev => [...prev, ...files].slice(0, 3));
  };

  const removePhoto = (i: number) => setPhotos(prev => prev.filter((_, idx) => idx !== i));

  const submitPayout = useMutation({
    mutationFn: async () => {
      if (!user || !selectedRequest || !landlordGps || !agentGps) throw new Error('Missing GPS data');
      if (photos.length === 0) throw new Error('Please add at least one receipt photo');
      if (!transactionId.trim()) throw new Error('Please enter the transaction ID');

      const req = selectedRequest;
      if (req.rent_amount > floatBalance) throw new Error('Insufficient landlord float balance');

      // Upload photos
      const photoUrls: string[] = [];
      for (const file of photos) {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `landlord-float-payouts/${req.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('receipts').upload(path, file);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
        photoUrls.push(urlData.publicUrl);
      }

      // GPS match check
      const propLat = req.request_latitude;
      const propLng = req.request_longitude;
      let gpsMatch = false;
      let distance: number | null = null;
      if (propLat && propLng) {
        distance = haversineDistance(landlordGps.lat, landlordGps.lng, propLat, propLng);
        gpsMatch = distance <= GPS_MATCH_THRESHOLD;
      }

      const { data: payout, error } = await supabase.from('agent_float_withdrawals').insert({
        agent_id: user.id,
        rent_request_id: req.id,
        landlord_id: req.landlord_id,
        tenant_id: req.tenant_id,
        amount: req.rent_amount,
        landlord_name: req.landlord?.name || 'Unknown',
        landlord_phone: req.landlord?.mobile_money_number || req.landlord?.phone || '',
        mobile_money_provider: provider,
        transaction_id: transactionId.trim(),
        receipt_photo_urls: photoUrls,
        agent_latitude: agentGps.lat,
        agent_longitude: agentGps.lng,
        agent_location_accuracy: agentGps.accuracy,
        landlord_latitude: landlordGps.lat,
        landlord_longitude: landlordGps.lng,
        landlord_location_accuracy: landlordGps.accuracy,
        property_latitude: propLat || null,
        property_longitude: propLng || null,
        gps_match: gpsMatch,
        gps_distance_meters: distance !== null ? Math.round(distance) : null,
        notes: notes || null,
      } as any).select('id').single();

      if (error) throw error;
      return { id: payout?.id, gpsMatch, distance };
    },
    onSuccess: (result) => {
      setStep('done');
      qc.invalidateQueries({ queryKey: ['agent-landlord-float'] });
      qc.invalidateQueries({ queryKey: ['agent-float-payout-requests'] });
      qc.invalidateQueries({ queryKey: ['agent-float-pending-count'] });
      toast.success(result?.gpsMatch
        ? 'Payout submitted! GPS matched — pending Agent Ops review.'
        : 'Payout submitted! Awaiting Agent Ops approval.');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to submit'),
  });

  const req = selectedRequest;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-chart-4" />
            Pay Landlord from Float
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs font-mono">
              Float: {formatUGX(floatBalance)}
            </Badge>
          </div>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* Step 1: Select approved rent request */}
          {step === 'select' && (
            <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <p className="text-sm text-muted-foreground">Select an approved rent request to pay the landlord:</p>
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : assignedRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Home className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No pending landlord payouts assigned to you.
                </div>
              ) : (
                assignedRequests.map((r: any) => {
                  const canAfford = r.rent_amount <= floatBalance;
                  return (
                    <Card
                      key={r.id}
                      className={`cursor-pointer transition-colors ${canAfford ? 'hover:border-chart-4/50' : 'opacity-60 cursor-not-allowed'}`}
                      onClick={() => { if (canAfford) { setSelectedRequest(r); setStep('pay'); } }}
                    >
                      <CardContent className="p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <User2 className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{r.landlord?.name || 'Unknown'}</span>
                          </div>
                          <Badge variant={canAfford ? 'secondary' : 'destructive'} className="text-xs">
                            {formatUGX(r.rent_amount)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{r.landlord?.mobile_money_number || r.landlord?.phone || 'N/A'}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(r.created_at), 'dd MMM')}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">Tenant: {r.tenant?.full_name || 'Unknown'}</div>
                        {!canAfford && <p className="text-[10px] text-destructive">Insufficient float balance</p>}
                        {canAfford && (
                          <div className="flex items-center justify-end">
                            <ArrowRight className="h-4 w-4 text-chart-4" />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </motion.div>
          )}

          {/* Step 2: Pay landlord details */}
          {step === 'pay' && req && (
            <motion.div key="pay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="p-4 rounded-xl bg-chart-4/5 border border-chart-4/20 space-y-2">
                <h3 className="font-bold text-sm text-chart-4">Landlord Details</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Name:</span> <span className="font-bold">{req.landlord?.name}</span></div>
                  <div><span className="text-muted-foreground">Amount:</span> <span className="font-bold text-chart-4">{formatUGX(req.rent_amount)}</span></div>
                  <div className="col-span-2 flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    <span className="font-mono font-bold text-base">{req.landlord?.mobile_money_number || req.landlord?.phone || 'N/A'}</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  ⚠️ Send exactly {formatUGX(req.rent_amount)} to the number above. The phone must be registered in <strong>{req.landlord?.name}</strong>'s name.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Mobile Money Provider *</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MTN">MTN Mobile Money</SelectItem>
                    <SelectItem value="Airtel">Airtel Money</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Transaction ID (TID) *</Label>
                <Input
                  value={transactionId}
                  onChange={e => setTransactionId(e.target.value)}
                  placeholder="Enter the MoMo transaction ID"
                  className="font-mono"
                />
              </div>

              <Button className="w-full" disabled={!provider || !transactionId.trim()} onClick={() => setStep('receipt')}>
                <ArrowRight className="h-4 w-4 mr-2" />
                Next: Capture GPS & Receipt
              </Button>

              <Button variant="ghost" size="sm" className="w-full" onClick={() => { setSelectedRequest(null); setStep('select'); }}>
                ← Back
              </Button>
            </motion.div>
          )}

          {/* Step 3: GPS + Receipt */}
          {step === 'receipt' && req && (
            <motion.div key="receipt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm">
                <p className="font-bold text-warning flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  Capture Proof of Payment
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Both your GPS and the landlord's location must be captured. Upload a signed receipt from the landlord.
                </p>
              </div>

              {/* Agent GPS */}
              <div>
                <Label className="text-xs font-bold mb-1 block">Your Location (Agent GPS) *</Label>
                <Button variant="outline" size="sm" onClick={() => captureGPS('agent')} disabled={gpsLoading === 'agent'} className="w-full">
                  {gpsLoading === 'agent' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <MapPin className="h-3 w-3 mr-1" />}
                  {agentGps ? `${agentGps.lat.toFixed(5)}, ${agentGps.lng.toFixed(5)}` : 'Capture Your GPS *'}
                </Button>
                {agentGps && (
                  <p className="text-[10px] text-success mt-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Accuracy: {agentGps.accuracy.toFixed(0)}m
                  </p>
                )}
              </div>

              {/* Landlord GPS */}
              <div>
                <Label className="text-xs font-bold mb-1 block">Landlord's Location GPS *</Label>
                <Button variant="outline" size="sm" onClick={() => captureGPS('landlord')} disabled={gpsLoading === 'landlord'} className="w-full">
                  {gpsLoading === 'landlord' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <MapPin className="h-3 w-3 mr-1 text-chart-4" />}
                  {landlordGps ? `${landlordGps.lat.toFixed(5)}, ${landlordGps.lng.toFixed(5)}` : 'Capture Landlord GPS *'}
                </Button>
                {landlordGps && (
                  <p className="text-[10px] text-success mt-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Accuracy: {landlordGps.accuracy.toFixed(0)}m
                    {req.request_latitude && (
                      <span className="text-muted-foreground ml-2">
                        | {Math.round(haversineDistance(landlordGps.lat, landlordGps.lng, req.request_latitude, req.request_longitude))}m from property
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Receipt Photos */}
              <div>
                <Label className="text-xs font-bold mb-1 block">Receipt Photos *</Label>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={handleFiles} className="hidden" />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={photos.length >= 3} className="w-full">
                  <Camera className="h-3 w-3 mr-1" />Receipt Photos ({photos.length}/3)
                </Button>
                {photos.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {photos.map((f, i) => (
                      <div key={i} className="relative">
                        <img src={URL.createObjectURL(f)} alt="" className="h-16 w-16 object-cover rounded border" />
                        <button onClick={() => removePhoto(i)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-4 w-4 flex items-center justify-center">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Textarea
                placeholder="Notes (optional)"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="h-16 text-sm"
              />

              <Button
                onClick={() => submitPayout.mutate()}
                disabled={submitPayout.isPending || !agentGps || !landlordGps || photos.length === 0}
                className="w-full"
              >
                {submitPayout.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Submit Payout for Approval
              </Button>

              <Button variant="ghost" size="sm" className="w-full" onClick={() => setStep('pay')}>
                ← Back
              </Button>
            </motion.div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6 space-y-4">
              <div className="w-16 h-16 mx-auto bg-success/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Payout Submitted!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Your payout request has been sent to Agent Ops for review.
                  {req && ` Amount: ${formatUGX(req.rent_amount)}`}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <p>The Agent Ops manager will verify the GPS location and receipt before approving. The float balance has been reserved.</p>
              </div>
              <Button onClick={handleClose} className="w-full">Done</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

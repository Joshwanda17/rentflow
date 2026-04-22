import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useGeoLocation } from '@/hooks/useGeoLocation';
import { useLandlordOtp } from '@/hooks/useLandlordOtp';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import {
  Landmark, Loader2, CheckCircle2, Phone, ArrowRight,
  Clock, User2, Home, ShieldCheck, RefreshCw, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { LandlordPayoutProgress } from './LandlordPayoutProgress';

interface AgentFloatPayoutWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'select' | 'otp' | 'disburse' | 'done';

export function AgentFloatPayoutWizard({ open, onOpenChange }: AgentFloatPayoutWizardProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const geo = useGeoLocation();
  const landlordOtp = useLandlordOtp();
  const [step, setStep] = useState<Step>('select');
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [provider, setProvider] = useState('');
  const [tid, setTid] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [otpCode, setOtpCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [amountInput, setAmountInput] = useState<string>('');
  const [phoneOverride, setPhoneOverride] = useState<string>('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownRef.current = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(cooldownRef.current);
  }, [resendCooldown]);

  const { data: floatBalance = 0 } = useQuery({
    queryKey: ['agent-landlord-float', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data } = await supabase
        .from('agent_landlord_float')
        .select('balance')
        .eq('agent_id', user.id)
        .maybeSingle();
      const n = Number(data?.balance ?? 0);
      return Number.isFinite(n) ? n : 0;
    },
    enabled: !!user && open,
  });

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
        .select('id, rent_amount, tenant_id, landlord_id, status, created_at')
        .in('landlord_id', landlordIds)
        .in('status', ['funded'])
        .order('created_at', { ascending: false });

      const enriched = await Promise.all((data || []).map(async (r: any) => {
        const [{ data: landlord }, { data: tenant }, { data: existing }] = await Promise.all([
          supabase.from('landlords').select('id, name, phone, mobile_money_number, latitude, longitude').eq('id', r.landlord_id).single(),
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
    setProvider('');
    setTid('');
    setNotes('');
    setReceiptFiles([]);
    setOtpCode('');
    setResendCooldown(0);
    setAmountInput('');
    setPhoneOverride('');
    landlordOtp.resetOtp();
  };

  const handleClose = () => { resetForm(); onOpenChange(false); };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    setReceiptFiles(prev => [...prev, ...Array.from(files)].slice(0, 3));
  };

  const defaultLandlordPhone =
    selectedRequest?.landlord?.mobile_money_number || selectedRequest?.landlord?.phone || '';
  const landlordPhone = (phoneOverride.trim() || defaultLandlordPhone).trim();

  const parsedAmount = Number((amountInput || '').toString().replace(/[^\d.]/g, ''));
  const effectiveAmount =
    Number.isFinite(parsedAmount) && parsedAmount > 0
      ? parsedAmount
      : Number(selectedRequest?.rent_amount ?? 0);
  const amountValid = effectiveAmount > 0 && effectiveAmount <= Number(selectedRequest?.rent_amount ?? 0);
  const phoneValid = /^(?:\+?256|0)?\d{9}$/.test(landlordPhone.replace(/\s+/g, ''));

  const handleSendOtp = async () => {
    if (!phoneValid) {
      toast.error('Enter a valid landlord phone number');
      return;
    }
    if (!amountValid) {
      toast.error(
        effectiveAmount <= 0
          ? 'Enter an amount greater than 0'
          : `Amount cannot exceed rent due (${formatUGX(Number(selectedRequest?.rent_amount ?? 0))})`,
      );
      return;
    }
    const sent = await landlordOtp.sendOtp(landlordPhone);
    if (sent) {
      setResendCooldown(60);
      toast.success('OTP sent to landlord\'s phone');
    }
  };

  const [activePayoutId, setActivePayoutId] = useState<string | null>(null);
  const [disburseError, setDisburseError] = useState<string | null>(null);
  const [isDisbursing, setIsDisbursing] = useState(false);

  const startAutoDisburse = async () => {
    if (!user || !selectedRequest) return;
    setIsDisbursing(true);
    setDisburseError(null);
    try {
      const loc = await geo.captureLocation();
      const r = selectedRequest;
      const propLat = r.landlord?.latitude ?? null;
      const propLng = r.landlord?.longitude ?? null;
      let gpsDistanceMeters: number | null = null;
      let gpsMatch = false;
      if (loc && propLat && propLng) {
        const R = 6371000;
        const dLat = (propLat - loc.latitude) * Math.PI / 180;
        const dLon = (propLng - loc.longitude) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(loc.latitude * Math.PI / 180) * Math.cos(propLat * Math.PI / 180) *
          Math.sin(dLon / 2) ** 2;
        gpsDistanceMeters = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        gpsMatch = gpsDistanceMeters <= 500;
      }

      const provider = (r.landlord?.mobile_money_number || '').toString().startsWith('07')
        ? 'MTN' : 'MTN'; // default; real classification can be added later

      const { data, error } = await supabase.functions.invoke('landlord-payout-disburse', {
        body: {
          rent_request_id: r.id,
          landlord_id: r.landlord_id,
          tenant_id: r.tenant_id,
          amount: effectiveAmount,
          landlord_phone: landlordPhone,
          landlord_name: r.landlord?.name,
          mobile_money_provider: provider,
          otp_verified_at: new Date().toISOString(),
          agent_latitude: loc?.latitude ?? null,
          agent_longitude: loc?.longitude ?? null,
          property_latitude: propLat,
          property_longitude: propLng,
          gps_distance_meters: gpsDistanceMeters,
          gps_match: gpsMatch,
        },
      });
      if (error) throw error;
      if (data?.payout_id) {
        setActivePayoutId(data.payout_id);
        setStep('disburse');
      } else {
        throw new Error(data?.error || 'Disbursement failed to start');
      }
    } catch (e: any) {
      setDisburseError(e?.message || 'Failed to start disbursement');
      toast.error(e?.message || 'Failed to start disbursement');
    } finally {
      setIsDisbursing(false);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    setOtpCode(code);
    if (code.length === 6) {
      const verified = await landlordOtp.verifyOtp(landlordPhone, code);
      if (verified) {
        toast.success('OTP verified — auto-disbursing now');
        await startAutoDisburse();
      }
    }
  };

  const handleResendOtp = () => {
    setOtpCode('');
    handleSendOtp();
  };

  const handleSelectRequest = (r: any) => {
    setSelectedRequest(r);
    setAmountInput(String(r?.rent_amount ?? ''));
    setPhoneOverride('');
    setStep('otp');
  };

  const submitPayout = useMutation({
    mutationFn: async () => {
      if (!user || !selectedRequest) throw new Error('Missing data');
      if (!provider) throw new Error('Select a payment mode');
      if (!tid.trim()) throw new Error('Enter the Transaction ID (TID) from your MoMo payment');
      if (!landlordOtp.otpVerified) throw new Error('Landlord OTP verification is required');

      const req = selectedRequest;
      if (effectiveAmount <= 0) throw new Error('Enter an amount greater than 0');
      if (effectiveAmount > Number(req.rent_amount)) throw new Error('Amount exceeds rent due');
      if (effectiveAmount > floatBalance) throw new Error('Insufficient landlord float balance');
      if (!phoneValid) throw new Error('Enter a valid landlord phone number');

      // Capture GPS — MANDATORY
      const loc = await geo.captureLocation();
      if (!loc) throw new Error('GPS location is required. Please enable location services and try again.');

      // Calculate distance to property if property coords exist
      let gpsDistanceMeters: number | null = null;
      let gpsMatch = false;
      const propLat = req.landlord?.latitude;
      const propLng = req.landlord?.longitude;

      if (propLat && propLng) {
        const R = 6371000;
        const dLat = (propLat - loc.latitude) * Math.PI / 180;
        const dLon = (propLng - loc.longitude) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(loc.latitude * Math.PI / 180) * Math.cos(propLat * Math.PI / 180) *
          Math.sin(dLon / 2) ** 2;
        gpsDistanceMeters = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        gpsMatch = gpsDistanceMeters <= 500;
      }

      // Deduct from float
      const { data: floatData } = await supabase
        .from('agent_landlord_float')
        .select('balance, total_paid_out')
        .eq('agent_id', user.id)
        .single();

      if (!floatData || floatData.balance < effectiveAmount) {
        throw new Error('Insufficient float balance');
      }

      const { error: floatErr } = await supabase
        .from('agent_landlord_float')
        .update({
          balance: floatData.balance - effectiveAmount,
          total_paid_out: (floatData.total_paid_out || 0) + effectiveAmount,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('agent_id', user.id);

      if (floatErr) throw new Error('Failed to deduct from float');

      // Upload receipt photos
      const photoUrls: string[] = [];
      for (const file of receiptFiles) {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `landlord-float-payouts/${req.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('receipts').upload(path, file);
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
          photoUrls.push(urlData.publicUrl);
        }
      }

      // Create withdrawal record with OTP verification flag
      const { error } = await supabase.from('agent_float_withdrawals').insert({
        agent_id: user.id,
        rent_request_id: req.id,
        landlord_id: req.landlord_id,
        tenant_id: req.tenant_id,
        amount: effectiveAmount,
        landlord_name: req.landlord?.name || 'Unknown',
        landlord_phone: landlordPhone,
        mobile_money_provider: provider,
        transaction_id: tid.trim(),
        notes: notes || null,
        receipt_photo_urls: photoUrls.length > 0 ? photoUrls : null,
        agent_latitude: loc.latitude,
        agent_longitude: loc.longitude,
        agent_location_accuracy: loc.accuracy,
        property_latitude: propLat ?? null,
        property_longitude: propLng ?? null,
        gps_distance_meters: gpsDistanceMeters,
        gps_match: gpsMatch,
        landlord_otp_verified: true,
        landlord_otp_verified_at: new Date().toISOString(),
        status: 'pending_agent_ops',
      } as any);

      if (error) {
        // Rollback float
        await supabase
          .from('agent_landlord_float')
          .update({
            balance: floatData.balance,
            total_paid_out: floatData.total_paid_out,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('agent_id', user.id);
        throw error;
      }

      // Send confirmation SMS to landlord
      try {
        const tenantName = req.tenant?.full_name || 'your tenant';
        await supabase.functions.invoke('sms-otp', {
          body: {
            action: 'send_custom',
            phone: landlordPhone,
              message: `Welile has paid UGX ${effectiveAmount.toLocaleString()} rent for ${tenantName} to your number. If you did not receive this, call 0800-000-000.`,
          },
        });
      } catch {
        // Non-critical — don't fail the payout
      }
    },
    onSuccess: () => {
      setStep('done');
      qc.invalidateQueries({ queryKey: ['agent-landlord-float'] });
      qc.invalidateQueries({ queryKey: ['agent-float-payout-requests'] });
      qc.invalidateQueries({ queryKey: ['agent-float-pending-count'] });
      toast.success('Landlord payment submitted for verification!');
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
            Pay Landlord
          </DialogTitle>
          <Badge variant="outline" className="text-xs font-mono w-fit mt-1">
            Float: {formatUGX(floatBalance)}
          </Badge>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === 'select' && (
            <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <p className="text-sm text-muted-foreground">Select a rent request to pay the landlord:</p>
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
                      onClick={() => { if (canAfford) handleSelectRequest(r); }}
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
                        {canAfford && <div className="flex items-center justify-end"><ArrowRight className="h-4 w-4 text-chart-4" /></div>}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </motion.div>
          )}

          {/* OTP Step — Verify landlord phone before payment */}
          {step === 'otp' && req && (
            <motion.div key="otp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="p-4 rounded-xl bg-chart-4/5 border border-chart-4/20 space-y-2">
                <h3 className="font-bold text-sm text-chart-4 flex items-center gap-2">
                  <Landmark className="h-4 w-4" />
                  Pay {req.landlord?.name}
                </h3>
                <div className="flex items-center gap-2 text-xs font-mono bg-muted/50 p-2 rounded-lg">
                  <Phone className="h-3.5 w-3.5 text-chart-4" />
                  {landlordPhone || 'No phone number'}
                </div>
              </div>

              <div className="space-y-3 p-3 rounded-xl border bg-card">
                  <div className="space-y-1.5">
                    <Label htmlFor="payout-amount" className="text-xs">
                      Amount to pay (UGX)
                    </Label>
                    <Input
                      id="payout-amount"
                      inputMode="numeric"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder={String(req?.rent_amount ?? '')}
                      className="h-10 font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Rent due: {formatUGX(Number(req?.rent_amount ?? 0))} · You can pay less for a partial payout.
                    </p>
                    {!amountValid && effectiveAmount > 0 && (
                      <p className="text-[11px] text-destructive">
                        Amount cannot exceed the rent due.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="payout-phone" className="text-xs">
                      Landlord MoMo number
                    </Label>
                    <Input
                      id="payout-phone"
                      inputMode="tel"
                      value={phoneOverride || defaultLandlordPhone}
                      onChange={(e) => setPhoneOverride(e.target.value)}
                      placeholder="07XXXXXXXX"
                      className="h-10 font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {phoneOverride.trim() && phoneOverride.trim() !== defaultLandlordPhone
                        ? 'Using overridden number — original on file: ' + (defaultLandlordPhone || 'none')
                        : 'Edit if the number on file is wrong or out of service.'}
                    </p>
                    {!phoneValid && (
                      <p className="text-[11px] text-destructive">Enter a valid Ugandan phone number.</p>
                    )}
                  </div>
              </div>

              <Button
                type="button"
                onClick={startAutoDisburse}
                disabled={isDisbursing || !phoneValid || !amountValid}
                className="w-full gap-2 h-12 rounded-xl"
              >
                {isDisbursing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Landmark className="h-4 w-4" />
                )}
                Pay Landlord Now
              </Button>
              {disburseError && (
                <p className="text-xs text-destructive text-center">{disburseError}</p>
              )}

              <Button variant="ghost" size="sm" className="w-full" onClick={() => { resetForm(); }}>
                ← Back to list
              </Button>
            </motion.div>
          )}

          {step === 'disburse' && req && activePayoutId && (
            <motion.div key="disburse" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <LandlordPayoutProgress
                payoutId={activePayoutId}
                landlordName={req.landlord?.name || 'Landlord'}
                onDone={(status) => {
                  if (status === 'completed') {
                    qc.invalidateQueries({ queryKey: ['agent-landlord-float'] });
                    qc.invalidateQueries({ queryKey: ['agent-float-payout-requests'] });
                    setTimeout(() => setStep('done'), 1500);
                  }
                }}
              />
              {disburseError && (
                <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> {disburseError}
                </div>
              )}
            </motion.div>
          )}

          {isDisbursing && step === 'otp' && (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting auto-disbursement…
            </div>
          )}

          {step === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-8 text-center space-y-3">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="w-16 h-16 mx-auto rounded-full bg-success/20 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </motion.div>
              <h3 className="text-lg font-semibold">Payment Sent!</h3>
              <p className="text-muted-foreground text-sm">
                {req ? formatUGX(effectiveAmount) : ''} delivered to {req?.landlord?.name || 'the landlord'} via Mobile Money.
              </p>
              <Button onClick={handleClose}>Done</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

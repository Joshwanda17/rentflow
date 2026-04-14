import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { FileText, CalendarClock, Banknote, Navigation, Loader2 } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { calculateRentRepayment, formatUGX, ACCESS_FEE_RATES, calculateInstalment } from '@/lib/rentCalculations';
import { generateRepaymentSchedule, insertRepaymentSchedule } from '@/lib/scheduleUtils';
import { useToast } from '@/hooks/use-toast';
import { optimizeImage } from '@/lib/imageOptimizer';

interface RentRequestFormProps {
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const MIN_DAYS = 7;
const MAX_DAYS = 120;

// Quick select options
const quickOptions = [
  { days: 7, label: '1 Week' },
  { days: 14, label: '2 Weeks' },
  { days: 30, label: '30 Days' },
  { days: 60, label: '60 Days' },
  { days: 90, label: '90 Days' },
  { days: 120, label: '4 Months' },
];

export default function RentRequestForm({ userId, onSuccess, onCancel }: RentRequestFormProps) {
  const [rentAmount, setRentAmount] = useState('');
  const [duration, setDuration] = useState(30);
  const [numberOfPayments, setNumberOfPayments] = useState(4);
  const [accessFeeRate, setAccessFeeRate] = useState(0.33);
  // Tenant details
  const [tenantNationalId, setTenantNationalId] = useState('');
  const [tenantFullName, setTenantFullName] = useState('');
  const [nationalIdError, setNationalIdError] = useState('');
  
  // Tenant utility meters
  const [tenantWaterMeter, setTenantWaterMeter] = useState('');
  const [tenantElectricityMeter, setTenantElectricityMeter] = useState('');
  
  // Landlord details
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [landlordNationalId, setLandlordNationalId] = useState('');
  const [landlordTin, setLandlordTin] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [waterMeterNumber, setWaterMeterNumber] = useState('');
  const [electricityMeterNumber, setElectricityMeterNumber] = useState('');
  
  // LC1 details
  const [lc1Name, setLc1Name] = useState('');
  const [lc1Phone, setLc1Phone] = useState('');
  const [lc1Village, setLc1Village] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // GPS & Photos
  const [propertyGps, setPropertyGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [housePhotos, setHousePhotos] = useState<{ file: File; preview: string }[]>([]);

  const capturePropertyGPS = useCallback(() => {
    if (!navigator.geolocation) { toast({ title: 'GPS not supported', variant: 'destructive' }); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPropertyGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsLoading(false);
        toast({ title: '📍 Property GPS captured!' });
      },
      (err) => {
        setGpsLoading(false);
        toast({ title: err.code === 1 ? 'Location permission denied' : 'Could not get GPS', variant: 'destructive' });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, [toast]);

  const handlePhotoAdd = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 3 - housePhotos.length;
    if (remaining <= 0) return;
    const toAdd = files.slice(0, remaining);
    const newPhotos = toAdd.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    setHousePhotos(prev => [...prev, ...newPhotos]);
    if (e.target) e.target.value = '';
  }, [housePhotos.length]);

  const removePhoto = useCallback((index: number) => {
    setHousePhotos(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const checkDuplicateNationalId = useCallback(async (value: string) => {
    setNationalIdError('');
    const cleaned = value.trim().toUpperCase();
    if (cleaned.length < 10) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('national_id', cleaned)
      .neq('id', userId)
      .maybeSingle();
    if (data) {
      setNationalIdError(`This National ID is already registered to ${data.full_name}`);
    }
  }, [userId]);

  const uploadHousePhotos = async (requestId: string): Promise<string[]> => {
    if (housePhotos.length === 0) return [];
    const urls: string[] = [];
    for (let i = 0; i < housePhotos.length; i++) {
      try {
        const optimized = await optimizeImage(housePhotos[i].file, { maxWidth: 1200, quality: 0.8 });
        const ext = optimized.file.name.split('.').pop() || 'webp';
        const path = `${userId}/${requestId}/photo_${i}.${ext}`;
        const { error } = await supabase.storage
          .from('house-images')
          .upload(path, optimized.file, { cacheControl: '86400', upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from('house-images').getPublicUrl(path);
        urls.push(data.publicUrl);
      } catch (err) {
        console.warn(`Photo ${i} upload failed:`, err);
      }
    }
    return urls;
  };

  // Max payments based on duration
  const maxPayments = Math.min(duration, 30);

  const calc = useMemo(() => {
    const amount = parseInt(rentAmount.replace(/,/g, '')) || 0;
    if (amount <= 0) return null;
    return calculateRentRepayment(amount, duration, accessFeeRate);
  }, [rentAmount, duration, accessFeeRate]);

  // Adjust numberOfPayments if duration changes
  const handleDurationChange = (days: number) => {
    setDuration(days);
    const newMax = Math.min(days, 30);
    if (numberOfPayments > newMax) {
      setNumberOfPayments(Math.max(1, newMax));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calc) return;
    if (nationalIdError) {
      toast({ title: 'Duplicate National ID', description: nationalIdError, variant: 'destructive' });
      return;
    }
    
    setLoading(true);

    // Update tenant profile with national ID and verified name
    if (tenantNationalId.trim() || tenantFullName.trim()) {
      await supabase
        .from('profiles')
        .update({ 
          national_id: tenantNationalId.trim() || undefined,
          full_name: tenantFullName.trim() || undefined
        })
        .eq('id', userId);
    }

    // Create landlord with utility meter numbers and TIN
    const { data: landlord, error: landlordError } = await supabase
      .from('landlords')
      .insert({ 
        name: landlordName, 
        phone: landlordPhone, 
        property_address: propertyAddress,
        water_meter_number: waterMeterNumber.trim() || null,
        electricity_meter_number: electricityMeterNumber.trim() || null,
        tin: landlordTin.trim() || null,
      } as any)
      .select('id')
      .single();

    if (landlordError) {
      toast({ title: 'Error', description: landlordError.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Create LC1
    const { data: lc1, error: lc1Error } = await supabase
      .from('lc1_chairpersons')
      .insert({ name: lc1Name, phone: lc1Phone, village: lc1Village })
      .select('id')
      .single();

    if (lc1Error) {
      toast({ title: 'Error', description: lc1Error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Get referral agent ID from localStorage
    const agentId = localStorage.getItem('referral_agent_id');

    // Use manually captured GPS if available, otherwise try auto-capture
    let requestLat: number | null = propertyGps?.lat ?? null;
    let requestLon: number | null = propertyGps?.lng ?? null;
    let requestCity: string | null = null;
    let requestCountry: string | null = null;
    
    if (!requestLat) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 60000,
          });
        });
        requestLat = position.coords.latitude;
        requestLon = position.coords.longitude;
      } catch (locErr) {
        console.warn('Could not capture location for rent request:', locErr);
      }
    }
    
    if (requestLat && requestLon && requestLat >= -1.5 && requestLat <= 4.2 && requestLon >= 29.5 && requestLon <= 35.0) {
      requestCountry = 'Uganda';
    }

    // Create rent request with number_of_payments and tenant meters
    const { data: rentRequest, error: requestError } = await supabase
      .from('rent_requests')
      .insert({
        tenant_id: userId,
        agent_id: agentId || null,
        landlord_id: landlord.id,
        lc1_id: lc1.id,
        rent_amount: calc.rentAmount,
        duration_days: calc.durationDays,
        access_fee: calc.accessFee,
        request_fee: calc.requestFee,
        total_repayment: calc.totalRepayment,
        daily_repayment: calc.dailyRepayment,
        number_of_payments: numberOfPayments,
        schedule_status: 'pending_acceptance',
        tenant_water_meter: tenantWaterMeter.trim() || null,
        tenant_electricity_meter: tenantElectricityMeter.trim() || null,
        request_latitude: requestLat,
        request_longitude: requestLon,
        request_city: requestCity,
        request_country: requestCountry,
      } as any)
      .select('id')
      .single();

    if (requestError) {
      toast({ title: 'Error', description: requestError.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Upload house photos if any
    if (housePhotos.length > 0 && rentRequest?.id) {
      const photoUrls = await uploadHousePhotos(rentRequest.id);
      if (photoUrls.length > 0) {
        await supabase
          .from('rent_requests')
          .update({ house_image_urls: photoUrls } as any)
          .eq('id', rentRequest.id);
      }
    }

    // Generate and insert repayment schedule
    const schedule = generateRepaymentSchedule(
      calc.totalRepayment,
      numberOfPayments,
      calc.durationDays
    );

    const scheduleResult = await insertRepaymentSchedule(
      supabase,
      rentRequest.id,
      userId,
      schedule
    );

    if (!scheduleResult.success) {
      toast({ title: 'Warning', description: 'Request created but schedule generation failed.', variant: 'destructive' });
    }

    onSuccess();
    setLoading(false);
  };

  return (
    <Card className="glass-card">
      <CardHeader className="bg-primary/10 border-b-2 border-primary/30">
        <CardTitle className="flex items-center gap-2 text-primary">
          <FileText className="h-5 w-5" />
          Rent Request Form
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ═══ RENT DETAILS — FIRST & PROMINENT ═══ */}
          <div className="space-y-4 p-4 rounded-2xl bg-primary/10 border-2 border-primary/40 shadow-lg shadow-primary/10">
            <h3 className="font-extrabold text-base text-primary flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              💰 Rent Details
            </h3>

            {/* Rent Amount */}
            <div className="space-y-2">
              <Label className="font-bold text-sm">Rent Amount (UGX)</Label>
              <p className="text-[10px] font-bold text-primary/60 italic">Let Welile pay this today</p>
              <Input 
                value={rentAmount} 
                onChange={(e) => setRentAmount(e.target.value.replace(/[^0-9]/g, ''))} 
                placeholder="e.g., 500000"
                required
                className="h-12 text-lg font-bold border-primary/30 focus:border-primary"
              />
            </div>

            {/* Access Fee Rate */}
            <div className="space-y-2">
              <Label className="font-bold text-sm">Access Fee Rate</Label>
              <div className="flex flex-wrap gap-2">
                {ACCESS_FEE_RATES.map((opt) => (
                  <Button
                    key={opt.rate}
                    type="button"
                    variant={accessFeeRate === opt.rate ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAccessFeeRate(opt.rate)}
                    className="text-xs"
                  >
                    {opt.label}/month
                  </Button>
                ))}
              </div>
            </div>

            {/* Payback Period */}
            <div className="space-y-2">
              <Label className="font-bold text-sm">Payback Period</Label>
              <div className="flex flex-wrap gap-2">
                {quickOptions.map((option) => (
                  <Button
                    key={option.days}
                    type="button"
                    variant={duration === option.days ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleDurationChange(option.days)}
                    className="text-xs"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Days Slider */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="font-bold text-sm">Custom Days</Label>
                <span className="text-sm font-bold text-primary">{duration} days</span>
              </div>
              <Slider
                value={[duration]}
                onValueChange={(value) => handleDurationChange(value[0])}
                min={MIN_DAYS}
                max={MAX_DAYS}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{MIN_DAYS} days</span>
                <span>{MAX_DAYS} days</span>
              </div>
            </div>

            {/* Number of Payments */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="font-bold text-sm">Number of Payments</Label>
                <span className="text-sm font-bold text-primary">{numberOfPayments} payment{numberOfPayments > 1 ? 's' : ''}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6].filter(n => n <= maxPayments).map((num) => (
                  <Button
                    key={num}
                    type="button"
                    variant={numberOfPayments === num ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNumberOfPayments(num)}
                    className="text-xs min-w-[40px]"
                  >
                    {num}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Max {maxPayments} payments for {duration} days
              </p>
            </div>

            {/* ═══ DAILY REPAYMENT HERO + START DATE ═══ */}
            {calc && (
              <div className="space-y-3">
                {/* Daily Amount — BIG & BOLD */}
                <div className="p-4 rounded-2xl bg-primary/20 border-2 border-primary/40 text-center">
                  <p className="text-xs font-semibold text-primary/80 mb-1 uppercase tracking-wide">And You Pay</p>
                  <p className="text-3xl font-black text-primary font-mono">{formatUGX(calc.dailyRepayment)}</p>
                  <p className="text-xs text-primary/70 mt-1">per day for {calc.durationDays} days</p>
                </div>

                {/* Repayment Start Date — next day */}
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/30 flex items-center gap-3">
                  <CalendarClock className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Repayment starts</p>
                    <p className="font-bold text-sm text-primary">
                      {format(addDays(new Date(), 1), 'EEEE, MMMM d, yyyy')}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Tomorrow — the day after posting</p>
                  </div>
                </div>

                {/* Summary breakdown */}
                <div className="space-y-2 p-3 rounded-xl bg-background/80 border">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Rent Amount:</span>
                    <span className="font-mono font-medium">{formatUGX(calc.rentAmount)}</span>
                  </div>
                  {/* Per Payment */}
                  <div className="p-2 rounded-lg bg-accent/20 border border-accent/30 text-center">
                    <p className="text-xs text-muted-foreground">
                      {numberOfPayments} payment{numberOfPayments > 1 ? 's' : ''} of
                    </p>
                    <p className="text-lg font-bold font-mono">
                      {formatUGX(Math.ceil(calc.totalRepayment / numberOfPayments))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      every {Math.floor(calc.durationDays / numberOfPayments)} days
                    </p>
                  </div>
                  {/* Instalment Breakdown */}
                  <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
                    <p className="text-xs font-medium text-muted-foreground">Instalment Breakdown</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Daily', days: 1 },
                        { label: 'Weekly', days: 7 },
                        { label: 'Bi-Weekly', days: 14 },
                        { label: 'Monthly', days: 30 },
                      ].filter(p => p.days <= calc.durationDays).map((period) => {
                        const inst = calculateInstalment(calc.totalRepayment, calc.durationDays, period.days);
                        return (
                          <div key={period.label} className="p-2 rounded bg-background border text-center">
                            <p className="text-[10px] text-muted-foreground">{period.label}</p>
                            <p className="text-sm font-bold font-mono">{formatUGX(inst.amount)}</p>
                            <p className="text-[10px] text-muted-foreground">× {inst.count} payments</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ═══ TENANT IDENTITY ═══ */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground">Your Identity (as on National ID)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name (as on ID)</Label>
                <Input 
                  placeholder="Names as on National ID"
                  value={tenantFullName}
                  onChange={(e) => setTenantFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>National ID Number</Label>
                <Input 
                  placeholder="e.g., CM12345678ABCD"
                  value={tenantNationalId}
                  onChange={(e) => { setTenantNationalId(e.target.value.toUpperCase()); setNationalIdError(''); }}
                  onBlur={() => checkDuplicateNationalId(tenantNationalId)}
                  className={nationalIdError ? 'border-destructive' : ''}
                  required
                />
                {nationalIdError && (
                  <p className="text-[11px] text-destructive font-medium">{nationalIdError}</p>
                )}
              </div>
            </div>
            {/* Tenant Utility Meters */}
            <div className="space-y-3 p-3 rounded-lg bg-muted/50 border">
              <p className="text-xs text-muted-foreground font-medium">Your Utility Meter Numbers</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Your NWSC Water Meter</Label>
                  <Input 
                    placeholder="Your water meter number" 
                    value={tenantWaterMeter} 
                    onChange={(e) => setTenantWaterMeter(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Your UEDCL/UMEME Electricity Meter</Label>
                  <Input 
                    placeholder="Your electricity meter number" 
                    value={tenantElectricityMeter} 
                    onChange={(e) => setTenantElectricityMeter(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">Landlord Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input placeholder="Landlord Name (as on National ID)" value={landlordName} onChange={(e) => setLandlordName(e.target.value)} required />
              <Input placeholder="Landlord Phone" value={landlordPhone} onChange={(e) => setLandlordPhone(e.target.value)} required />
            </div>
            <Input placeholder="Property Address" value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} required />
            <div className="space-y-1">
              <Label className="text-xs">Landlord TIN (Tax Identification Number)</Label>
              <Input placeholder="Landlord's TIN" value={landlordTin} onChange={(e) => setLandlordTin(e.target.value)} />
            </div>
            
            {/* Uganda Utility Meters */}
            <div className="space-y-3 p-3 rounded-lg bg-muted/50 border">
              <p className="text-xs text-muted-foreground font-medium">Uganda Utility Meters (Optional)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">NWSC Water Meter Number</Label>
                  <Input 
                    placeholder="National Water & Sewerage Corp" 
                    value={waterMeterNumber} 
                    onChange={(e) => setWaterMeterNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">UEDCL/UMEME Electricity Meter</Label>
                  <Input 
                    placeholder="Uganda Electricity Distribution" 
                    value={electricityMeterNumber} 
                    onChange={(e) => setElectricityMeterNumber(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Property GPS */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <Navigation className="h-3 w-3" /> Property GPS Location
              </Label>
              {propertyGps ? (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-success/10 border border-success/30">
                  <Navigation className="h-4 w-4 text-success flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-success">📍 GPS Captured</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {propertyGps.lat.toFixed(5)}, {propertyGps.lng.toFixed(5)} (±{Math.round(propertyGps.accuracy)}m)
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="ghost" className="text-xs h-7 px-2" onClick={capturePropertyGPS}>
                    Retake
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full h-10 gap-2 border-dashed" onClick={capturePropertyGPS} disabled={gpsLoading}>
                  {gpsLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Getting GPS...</>
                  ) : (
                    <><Navigation className="h-4 w-4" /> Capture Property GPS</>
                  )}
                </Button>
              )}
            </div>

            {/* House Photos (max 3) */}
            <div className="space-y-2">
              <Label className="text-xs">📸 House Photos (up to 3)</Label>
              <div className="grid grid-cols-3 gap-2">
                {housePhotos.map((photo, idx) => (
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-border">
                    <img src={photo.preview} alt={`House ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs font-bold"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {housePhotos.length < 3 && (
                  <label className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                    <span className="text-xl text-muted-foreground/50">📷</span>
                    <span className="text-[10px] text-muted-foreground/50 mt-1">Add Photo</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoAdd} />
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">LC1 Chairperson Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input placeholder="LC1 Name" value={lc1Name} onChange={(e) => setLc1Name(e.target.value)} required />
              <Input placeholder="LC1 Phone" value={lc1Phone} onChange={(e) => setLc1Phone(e.target.value)} required />
              <Input placeholder="Village" value={lc1Village} onChange={(e) => setLc1Village(e.target.value)} required />
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={loading || !calc} className="flex-1">
              {loading ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

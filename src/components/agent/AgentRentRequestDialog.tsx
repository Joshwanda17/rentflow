import { useState, useCallback } from 'react';
import { addDays, format } from 'date-fns';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { optimizeImage } from '@/lib/imageOptimizer';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  User, 
  
  MapPin,
  Navigation,
  Building2,
  Loader2,
  CheckCircle2,
  FileText,
  Calculator,
  Calendar,
  Banknote,
  Users,
  Share2,
  Copy,
  MessageCircle,
  Home
} from 'lucide-react';
import { toast } from 'sonner';
import { formatUGX, calculateRentRepayment } from '@/lib/rentCalculations';
import { hapticSuccess } from '@/lib/haptics';

interface AgentRentRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type IncomeType = 'daily' | 'weekly-monthly';
type RepaymentPeriod = '7' | '14' | '21' | '30' | '120';

const HOUSE_CATEGORIES = [
  { value: 'single-room', label: 'Single Room', emoji: '🚪' },
  { value: 'double-room', label: 'Double Room', emoji: '🛏️' },
  { value: '1-bed', label: '1 Bed House', emoji: '🏠' },
  { value: '2-bed', label: '2 Bedroom House', emoji: '🏡' },
  { value: '2-bed-full', label: '2 Bed + Sitting Room, Kitchen & 2 Toilets', emoji: '🏘️' },
  { value: '3-bed', label: '3 Bedroom Apartment', emoji: '🏢' },
  { value: '3-bed-luxury', label: '3 Bed Luxury + Boys Quarter', emoji: '🏰' },
  { value: '4-bed', label: '4+ Bedroom Villa', emoji: '🏛️' },
  { value: 'commercial', label: 'Commercial Property', emoji: '🏪' },
];

export default function AgentRentRequestDialog({ open, onOpenChange, onSuccess }: AgentRentRequestDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [activationLink, setActivationLink] = useState<string | null>(null);
  const [step, setStep] = useState<'type' | 'details' | 'confirm'>('type');
  
  // Income type
  const [incomeType, setIncomeType] = useState<IncomeType | null>(null);
  
  // Tenant info (for non-account holders)
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  
  // Rent details
  const [rentAmount, setRentAmount] = useState('');
  const [duration, setDuration] = useState<'30' | '60' | '90'>('30');
  const [repaymentPeriod, setRepaymentPeriod] = useState<RepaymentPeriod>('7');
  
  // Landlord info
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  
  // LC1 info
  const [lc1Name, setLc1Name] = useState('');
  const [lc1Phone, setLc1Phone] = useState('');
  const [lc1Village, setLc1Village] = useState('');
  const [houseCategory, setHouseCategory] = useState('');
  const [noSmartphone, setNoSmartphone] = useState(false);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [housePhotos, setHousePhotos] = useState<{ file: File; preview: string }[]>([]);

  const captureGPS = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('GPS not supported on this device');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGpsLoading(false);
        toast.success('Property GPS captured!');
      },
      (err) => {
        setGpsLoading(false);
        toast.error(err.code === 1 ? 'Location permission denied' : 'Could not get GPS. Try again.');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, []);

  const handlePhotoAdd = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 3 - housePhotos.length;
    if (remaining <= 0) { toast.error('Maximum 3 photos'); return; }
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

  const uploadHousePhotos = async (requestId: string): Promise<string[]> => {
    if (!user || housePhotos.length === 0) return [];
    const urls: string[] = [];
    for (let i = 0; i < housePhotos.length; i++) {
      try {
        const optimized = await optimizeImage(housePhotos[i].file, { maxWidth: 1200, quality: 0.8 });
        const ext = optimized.file.name.split('.').pop() || 'webp';
        const path = `${user.id}/${requestId}/photo_${i}.${ext}`;
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

  const resetForm = () => {
    setIncomeType(null);
    setTenantName('');
    setTenantPhone('');
    setRentAmount('');
    setDuration('30');
    setRepaymentPeriod('7');
    setLandlordName('');
    setLandlordPhone('');
    setPropertyAddress('');
    setLc1Name('');
    setLc1Phone('');
    setLc1Village('');
    setHouseCategory('');
    setNoSmartphone(false);
    setGpsLocation(null);
    setGpsLoading(false);
    housePhotos.forEach(p => URL.revokeObjectURL(p.preview));
    setHousePhotos([]);
    setSuccess(false);
    setActivationLink(null);
    setStep('type');
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const amount = parseInt(rentAmount.replace(/,/g, '')) || 0;
  
  // Calculate fees based on income type
  const calculateFees = () => {
    if (!amount || !incomeType) return null;
    
    if (incomeType === 'daily') {
      return calculateRentRepayment(amount, parseInt(duration) as 30 | 60 | 90);
    } else {
      // Weekly/Monthly calculation
      const DAILY_ACCESS_FEE_RATE = 0.011; // 1.1%
      const PLATFORM_FEE = 10000;
      const days = parseInt(repaymentPeriod);
      const accessFee = Math.round(amount * DAILY_ACCESS_FEE_RATE * days);
      const totalRepayment = amount + accessFee + PLATFORM_FEE;
      
      return {
        rentAmount: amount,
        durationDays: days,
        accessFee,
        requestFee: PLATFORM_FEE,
        totalRepayment,
        dailyRepayment: Math.round(totalRepayment / days),
      };
    }
  };

  const fees = calculateFees();

  const handleSubmit = async () => {
    if (!user || !fees) return;

    if (!tenantName.trim() || !tenantPhone.trim()) {
      toast.error('Please provide tenant name and phone');
      return;
    }

    if (!landlordName.trim() || !landlordPhone.trim() || !propertyAddress.trim()) {
      toast.error('Please fill in all landlord details');
      return;
    }

    if (!lc1Name.trim() || !lc1Phone.trim() || !lc1Village.trim()) {
      toast.error('Please fill in all LC1 details');
      return;
    }

    if (!houseCategory) {
      toast.error('Please select a house category');
      return;
    }

    setLoading(true);

    try {
      // Create landlord record
      const { data: landlord, error: landlordError } = await supabase
        .from('landlords')
        .insert({
          name: landlordName.trim(),
          phone: landlordPhone.trim(),
          property_address: propertyAddress.trim(),
          registered_by: user?.id,
        })
        .select('id')
        .single();

      if (landlordError) throw landlordError;

      // Create LC1 record
      const { data: lc1, error: lc1Error } = await supabase
        .from('lc1_chairpersons')
        .insert({
          name: lc1Name.trim(),
          phone: lc1Phone.trim(),
          village: lc1Village.trim(),
        })
        .select('id')
        .single();

      if (lc1Error) throw lc1Error;

      // Register tenant via edge function (handles both existing and new users)
      const { data: tenantResult, error: tenantRegError } = await supabase.functions.invoke('register-tenant', {
        body: {
          full_name: tenantName.trim(),
          phone: tenantPhone.trim(),
        },
      });

      if (tenantRegError) {
        console.error('Tenant registration error:', tenantRegError);
        // Try to extract error message from the response
        let errorMsg = 'Failed to register tenant';
        try {
          if (tenantRegError.context?.body) {
            const text = await new Response(tenantRegError.context.body).text();
            const parsed = JSON.parse(text);
            errorMsg = parsed.error || errorMsg;
          }
        } catch {}
        toast.error(errorMsg);
        setLoading(false);
        return;
      }

      if (!tenantResult?.user_id) {
        console.error('Tenant registration returned no user_id:', tenantResult);
        toast.error(tenantResult?.error || 'Failed to register tenant - no user ID returned');
        setLoading(false);
        return;
      }

      const tenantId = tenantResult.user_id;

      // Create rent request with agent_id
      const { data: rentReq, error: requestError } = await supabase
        .from('rent_requests')
        .insert({
          tenant_id: tenantId,
          agent_id: user.id,
          landlord_id: landlord.id,
          lc1_id: lc1.id,
          rent_amount: fees.rentAmount,
          duration_days: fees.durationDays,
          access_fee: fees.accessFee,
          request_fee: fees.requestFee,
          total_repayment: fees.totalRepayment,
          daily_repayment: fees.dailyRepayment,
          status: 'pending',
          house_category: houseCategory,
          tenant_no_smartphone: noSmartphone,
          request_latitude: gpsLocation?.lat ?? null,
          request_longitude: gpsLocation?.lng ?? null,
        })
        .select('id')
        .single();

      if (requestError) throw requestError;

      // Upload house photos if any
      if (housePhotos.length > 0 && rentReq?.id) {
        const photoUrls = await uploadHousePhotos(rentReq.id);
        if (photoUrls.length > 0) {
          await supabase
            .from('rent_requests')
            .update({ house_image_urls: photoUrls })
            .eq('id', rentReq.id);
        }
      }

      // Build activation link if tenant is new
      if (!tenantResult.existing && tenantResult.activation_token) {
        const link = `${getPublicOrigin()}/join?t=${tenantResult.activation_token}`;
        setActivationLink(link);
      }

      hapticSuccess();
      setSuccess(true);
      toast.success('Rent request posted successfully!');
      onSuccess?.();
    } catch (error: any) {
      console.error('Submission error:', error);
      toast.error(error.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  const getPeriodLabel = (period: RepaymentPeriod) => {
    switch (period) {
      case '7': return '7 Days (1 Week)';
      case '14': return '14 Days (2 Weeks)';
      case '21': return '21 Days (3 Weeks)';
      case '30': return '30 Days (1 Month)';
      case '120': return '120 Days (4 Months)';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Post Rent Request (For Tenant)
          </DialogTitle>
          <DialogDescription>
            Submit a rent request on behalf of a tenant who doesn't have the app
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-6 text-center space-y-4"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                className="w-16 h-16 mx-auto rounded-full bg-success/20 flex items-center justify-center"
              >
                <CheckCircle2 className="h-8 w-8 text-success" />
              </motion.div>
              <h3 className="text-lg font-semibold">Request Posted!</h3>
              <p className="text-muted-foreground text-sm">
                The rent request is now visible to supporters
              </p>

              {/* Activation Link Section */}
              {activationLink && (
                <div className="space-y-3 pt-2">
                  <Separator />
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-left space-y-2">
                    <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                      <Share2 className="h-3.5 w-3.5" />
                      Tenant Activation Link
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Share this link with <strong>{tenantName}</strong> so they can activate their account when they get a smartphone.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1.5 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(activationLink);
                          toast.success('Link copied!');
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy Link
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5 text-xs bg-[#25D366] hover:bg-[#20BD5A] text-white"
                        onClick={() => {
                          const message = `Hi ${tenantName}! 👋\n\nYour rent request has been submitted on Welile. When you get a smartphone, tap this link to activate your account:\n\n${activationLink}\n\nYou'll be able to track your rent status and make payments.`;
                          const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                          window.open(whatsappUrl, '_blank');
                        }}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Share on WhatsApp
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <Button onClick={() => handleOpenChange(false)} className="w-full mt-2">
                Done
              </Button>
            </motion.div>
          ) : step === 'type' ? (
            <motion.div
              key="type"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4 py-2"
            >
              <p className="text-sm text-muted-foreground text-center">
                How does this tenant earn income?
              </p>
              
              <div className="grid gap-3">
                <button
                  onClick={() => {
                    setIncomeType('daily');
                    setStep('details');
                  }}
                  className="p-4 rounded-xl border-2 border-muted hover:border-primary hover:bg-primary/5 transition-all text-left group active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">Daily Income Earner</p>
                      <p className="text-xs text-muted-foreground">Pays back daily over 30-90 days</p>
                    </div>
                  </div>
                </button>
                
                <button
                  onClick={() => {
                    setIncomeType('weekly-monthly');
                    setStep('details');
                  }}
                  className="p-4 rounded-xl border-2 border-muted hover:border-success hover:bg-success/5 transition-all text-left group active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-success/10 group-hover:bg-success/20">
                      <Banknote className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="font-semibold">Weekly/Monthly Earner</p>
                      <p className="text-xs text-muted-foreground">Pays back in 1-4 weeks or 4 months</p>
                    </div>
                  </div>
                </button>
              </div>
            </motion.div>
          ) : step === 'details' ? (
            <motion.div
              key="details"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              {/* ===== 1. RENT DETAILS — PRIMARY SECTION (Purple Hero) ===== */}
              <div className="space-y-3 p-4 rounded-2xl bg-primary/10 border-2 border-primary/40">
                <h4 className="text-base font-extrabold text-primary flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-primary/20">
                    <Calculator className="h-5 w-5 text-primary" />
                  </div>
                  💰 Rent Details
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-primary/80">Rent Amount (UGX) *</Label>
                    <p className="text-[10px] font-bold text-primary/60 italic">Let Welile pay this today</p>
                    <Input
                      value={rentAmount}
                      onChange={(e) => setRentAmount(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="500,000"
                      className="h-12 text-lg font-bold border-2 border-primary/30 focus:border-primary rounded-xl"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-primary/80">
                      {incomeType === 'daily' ? 'Duration' : 'Repayment Period'} *
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      {incomeType === 'daily'
                        ? 'tenant will take to repay.'
                        : 'Select the repayment cycle length for this tenant.'}
                    </p>
                    {incomeType === 'daily' ? (
                      <Select value={duration} onValueChange={(v) => setDuration(v as '30' | '60' | '90')}>
                        <SelectTrigger className="h-12 text-base font-semibold border-2 border-primary/30 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 Days</SelectItem>
                          <SelectItem value="60">60 Days</SelectItem>
                          <SelectItem value="90">90 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={repaymentPeriod} onValueChange={(v) => setRepaymentPeriod(v as RepaymentPeriod)}>
                        <SelectTrigger className="h-12 text-base font-semibold border-2 border-primary/30 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">7 Days</SelectItem>
                          <SelectItem value="14">14 Days</SelectItem>
                          <SelectItem value="21">21 Days</SelectItem>
                          <SelectItem value="30">30 Days</SelectItem>
                          <SelectItem value="120">120 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                
                {/* Daily Repayment Hero Card */}
                {fees && (
                  <div className="space-y-2">
                    <div className="p-4 rounded-2xl bg-primary/20 border-2 border-primary/40 text-center">
                      <p className="text-xs text-primary/70 font-medium mb-1">And You Pay</p>
                      <p className="text-3xl font-black text-primary font-mono">{formatUGX(fees.dailyRepayment)}</p>
                      <p className="text-xs text-primary/70 mt-1">per day for {fees.durationDays} days</p>
                    </div>

                    {/* Repayment Start Date */}
                    <div className="p-3 rounded-xl bg-primary/10 border border-primary/30 flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-[10px] text-primary/60 font-medium">Repayment starts</p>
                        <p className="font-bold text-sm text-primary">
                          {format(addDays(new Date(), 1), 'EEEE, MMMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* ===== 2. TENANT DETAILS ===== */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Tenant Details
                </h4>

                {/* No Smartphone Toggle */}
                <button
                  type="button"
                  onClick={() => setNoSmartphone(!noSmartphone)}
                  className={`w-full p-3 rounded-xl border-2 transition-all text-left flex items-center gap-3 ${
                    noSmartphone 
                      ? 'border-warning/50 bg-warning/10' 
                      : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                    noSmartphone ? 'bg-warning border-warning' : 'border-muted-foreground/40'
                  }`}>
                    {noSmartphone && <CheckCircle2 className="h-3.5 w-3.5 text-warning-foreground" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Tenant has no smartphone</p>
                    <p className="text-xs text-muted-foreground">
                      {noSmartphone 
                        ? '⚠️ Your wallet will be charged for all repayments' 
                        : 'Check if tenant cannot manage their own wallet'}
                    </p>
                  </div>
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="tenantName" className="text-xs">Full Name *</Label>
                    <Input
                      id="tenantName"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      placeholder="Tenant's name"
                      className="h-10"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tenantPhone" className="text-xs">Phone *</Label>
                    <Input
                      id="tenantPhone"
                      value={tenantPhone}
                      onChange={(e) => setTenantPhone(e.target.value)}
                      placeholder="0783..."
                      className="h-10"
                      required
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* ===== 3. HOUSE CATEGORY ===== */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Home className="h-3 w-3" />
                  House Category *
                </h4>
                <Select value={houseCategory} onValueChange={setHouseCategory}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select house type" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUSE_CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.emoji} {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* ===== 4. LANDLORD DETAILS ===== */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Landlord Details
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name *</Label>
                    <Input
                      value={landlordName}
                      onChange={(e) => setLandlordName(e.target.value)}
                      placeholder="Landlord name"
                      className="h-10"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone *</Label>
                    <Input
                      value={landlordPhone}
                      onChange={(e) => setLandlordPhone(e.target.value)}
                      placeholder="Phone"
                      className="h-10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Property Address *
                  </Label>
                  <Input
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                    placeholder="Full property address"
                    className="h-10"
                    required
                  />
                </div>

                {/* GPS Capture */}
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Navigation className="h-3 w-3" /> Property GPS
                  </Label>
                  {gpsLocation ? (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-success/10 border border-success/30">
                      <Navigation className="h-4 w-4 text-success flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-success">📍 GPS Captured</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {gpsLocation.lat.toFixed(5)}, {gpsLocation.lng.toFixed(5)} (±{Math.round(gpsLocation.accuracy)}m)
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 px-2"
                        onClick={captureGPS}
                      >
                        Retake
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-10 gap-2 border-dashed"
                      onClick={captureGPS}
                      disabled={gpsLoading}
                    >
                      {gpsLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Getting GPS...
                        </>
                      ) : (
                        <>
                          <Navigation className="h-4 w-4" />
                          Capture Property GPS
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {/* House Photos (max 3) */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1">
                    📸 House Photos (up to 3)
                  </Label>
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
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={handlePhotoAdd}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* ===== 5. LC1 DETAILS ===== */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  LC1 Chairperson Details
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name *</Label>
                    <Input
                      value={lc1Name}
                      onChange={(e) => setLc1Name(e.target.value)}
                      placeholder="LC1 name"
                      className="h-10"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone *</Label>
                    <Input
                      value={lc1Phone}
                      onChange={(e) => setLc1Phone(e.target.value)}
                      placeholder="Phone"
                      className="h-10"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Village *</Label>
                    <Input
                      value={lc1Village}
                      onChange={(e) => setLc1Village(e.target.value)}
                      placeholder="Village"
                      className="h-10"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setStep('type')}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button 
                  onClick={handleSubmit} 
                  className="flex-1" 
                  disabled={loading || !amount || amount < 50000}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Request'
                  )}
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

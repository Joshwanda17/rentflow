import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
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
  Phone, 
  MapPin, 
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
type RepaymentPeriod = '7' | '14' | '21' | '120';

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

      // Create a "virtual" tenant profile entry for non-account holders
      // We'll use a placeholder tenant_id since tenant doesn't have an account
      // The agent is the one posting on their behalf
      const virtualEmail = `${tenantPhone.replace(/[^0-9]/g, '')}@noapp.welile.user`;
      
      // Try to find existing profile with this phone
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', tenantPhone.trim())
        .maybeSingle();

      let tenantId: string;

      if (existingProfile) {
        tenantId = existingProfile.id;
      } else {
        // Create a new profile for the non-account tenant
        // Generate a UUID for the profile
        const newProfileId = crypto.randomUUID();
        
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: newProfileId,
            full_name: tenantName.trim(),
            phone: tenantPhone.trim(),
            email: virtualEmail,
          });

        if (profileError) {
          // If profile creation fails, we'll proceed without creating a new profile
          console.error('Profile creation failed:', profileError);
          toast.error('Failed to register tenant profile');
          setLoading(false);
          return;
        }
        tenantId = newProfileId;
      }

      // Create rent request with agent_id
      const { error: requestError } = await supabase
        .from('rent_requests')
        .insert({
          tenant_id: tenantId,
          agent_id: user.id, // The agent posting on behalf
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
        });

      if (requestError) throw requestError;

      // Create activation invite so tenant can claim their account later
      const tempPassword = crypto.randomUUID().slice(0, 8);
      const activationToken = crypto.randomUUID();
      
      const { error: inviteError } = await supabase
        .from('supporter_invites')
        .insert({
          full_name: tenantName.trim(),
          phone: tenantPhone.trim(),
          email: virtualEmail,
          temp_password: tempPassword,
          activation_token: activationToken,
          created_by: user.id,
          role: 'tenant',
          status: 'pending',
        });

      if (inviteError) {
        console.error('Invite creation failed:', inviteError);
      }

      // Build activation link
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/join?t=${activationToken}`;
      setActivationLink(link);

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
              {/* Tenant Section */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Tenant Details (No App Account)
                </h4>
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

              {/* House Category */}
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

              {/* Rent Amount & Duration */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Calculator className="h-3 w-3" />
                  Rent Details
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Rent Amount (UGX) *</Label>
                    <Input
                      value={rentAmount}
                      onChange={(e) => setRentAmount(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="500000"
                      className="h-10"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {incomeType === 'daily' ? 'Duration' : 'Repayment Period'} *
                    </Label>
                    {incomeType === 'daily' ? (
                      <Select value={duration} onValueChange={(v) => setDuration(v as '30' | '60' | '90')}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 Days</SelectItem>
                          <SelectItem value="60">60 Days</SelectItem>
                          <SelectItem value="90">90 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={repaymentPeriod} onValueChange={(v) => setRepaymentPeriod(v as RepaymentPeriod)}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">7 Days</SelectItem>
                          <SelectItem value="14">14 Days</SelectItem>
                          <SelectItem value="21">21 Days</SelectItem>
                          <SelectItem value="120">120 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                
                {fees && (
                  <div className="p-3 rounded-lg bg-primary/10 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Rent Amount</span>
                      <span className="font-medium">{formatUGX(fees.rentAmount)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Access Fee</span>
                      <span className="font-medium">{formatUGX(fees.accessFee)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Platform Fee</span>
                      <span className="font-medium">{formatUGX(fees.requestFee)}</span>
                    </div>
                    <Separator className="my-1" />
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Total Repayment</span>
                      <span className="font-bold text-primary">{formatUGX(fees.totalRepayment)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Daily Payment</span>
                      <span className="font-medium">{formatUGX(fees.dailyRepayment)}/day</span>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Landlord Section */}
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
              </div>

              <Separator />

              {/* LC1 Section */}
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

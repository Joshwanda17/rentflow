import { useState, useEffect } from 'react';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, UserPlus, Share2, Copy, Check, Eye, EyeOff, Users, Building2, Sparkles, UsersRound, ChevronDown, ChevronUp, Smartphone, Landmark } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';

interface CreateUserInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  defaultRole?: UserRole;
  lockRole?: boolean;
}

type UserRole = 'tenant' | 'landlord' | 'agent' | 'supporter';

const roleConfig: Record<UserRole, { label: string; icon: React.ElementType; description: string; color: string; bgColor: string; emoji: string }> = {
  tenant: {
    label: 'Tenant',
    icon: Users,
    description: 'Rent payer who can request rent assistance',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10 border-blue-500/30',
    emoji: '🏠',
  },
  landlord: {
    label: 'Landlord',
    icon: Building2,
    description: 'Property owner who receives rent payments',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10 border-emerald-500/30',
    emoji: '🏢',
  },
  agent: {
    label: 'Sub-Agent',
    icon: UsersRound,
    description: 'Team member who helps register tenants',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10 border-orange-500/30',
    emoji: '👥',
  },
  supporter: {
    label: 'Tenant Supporter',
    icon: Building2,
    description: 'Investor who funds the rent pool for returns',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10 border-purple-500/30',
    emoji: '💰',
  },
};

interface SupporterFormData {
  nationalId: string;
  country: string;
  districtCity: string;
  physicalAddress: string;
  nextOfKinName: string;
  nextOfKinRelationship: string;
  nextOfKinPhone: string;
  investmentAmount: string;
  durationMonths: string;
  roiPercentage: string;
  roiMode: string;
  paymentMethod: string;
  mobileNetwork: string;
  mobileMoneyNumber: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  portfolioPin: string;
  payoutDay: string;
}

const defaultSupporterData: SupporterFormData = {
  nationalId: '',
  country: 'Uganda',
  districtCity: '',
  physicalAddress: '',
  nextOfKinName: '',
  nextOfKinRelationship: '',
  nextOfKinPhone: '',
  investmentAmount: '',
  durationMonths: '12',
  roiPercentage: '15',
  roiMode: 'monthly_payout',
  paymentMethod: '',
  mobileNetwork: '',
  mobileMoneyNumber: '',
  bankName: '',
  accountName: '',
  accountNumber: '',
  portfolioPin: '',
  payoutDay: '15',
};

export function CreateUserInviteDialog({ open, onOpenChange, onSuccess, defaultRole, lockRole }: CreateUserInviteDialogProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>(defaultRole || 'tenant');
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    phone: '',
    password: '',
    address: '',
  });
  const [supporterData, setSupporterData] = useState<SupporterFormData>(defaultSupporterData);
  const [expandedSection, setExpandedSection] = useState<string | null>('personal');
  const [createdInvite, setCreatedInvite] = useState<{
    token: string;
    fullName: string;
    password: string;
    role: UserRole;
    portfolioToken?: string;
    portfolioCode?: string;
    investmentAmount?: number;
    durationMonths?: number;
    roiPercentage?: number;
    roiMode?: string;
  } | null>(null);

  const isSupporterRole = selectedRole === 'supporter';

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password }));
  };

  const generatePin = () => {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    setSupporterData(prev => ({ ...prev, portfolioPin: pin }));
  };

  useEffect(() => {
    if (open) {
      if (!formData.password) generatePassword();
      if (defaultRole) setSelectedRole(defaultRole);
      if (!supporterData.portfolioPin) generatePin();
    }
  }, [open, defaultRole]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
        return;
      }

      // Validate supporter-specific fields
      if (isSupporterRole) {
        const amount = Number(supporterData.investmentAmount);
        if (!amount || amount < 50000) {
          toast({ title: 'Error', description: 'Investment amount must be at least UGX 50,000', variant: 'destructive' });
          setIsLoading(false);
          return;
        }
        if (!/^\d{4}$/.test(supporterData.portfolioPin)) {
          toast({ title: 'Error', description: 'Portfolio PIN must be exactly 4 digits', variant: 'destructive' });
          setIsLoading(false);
          return;
        }
      }

      // Create the invite with extended fields
      const inviteBody: Record<string, unknown> = {
        ...formData,
        address: formData.address || supporterData.physicalAddress,
        role: selectedRole,
        isSubAgent: selectedRole === 'agent',
      };

      if (isSupporterRole) {
        inviteBody.national_id = supporterData.nationalId || undefined;
        inviteBody.country = supporterData.country || undefined;
        inviteBody.district_city = supporterData.districtCity || undefined;
        inviteBody.next_of_kin_name = supporterData.nextOfKinName || undefined;
        inviteBody.next_of_kin_relationship = supporterData.nextOfKinRelationship || undefined;
        inviteBody.next_of_kin_phone = supporterData.nextOfKinPhone || undefined;
        inviteBody.payment_method = supporterData.paymentMethod || undefined;
        inviteBody.mobile_network = supporterData.mobileNetwork || undefined;
        inviteBody.mobile_money_number = supporterData.mobileMoneyNumber || undefined;
        inviteBody.bank_name = supporterData.bankName || undefined;
        inviteBody.account_name = supporterData.accountName || undefined;
        inviteBody.account_number = supporterData.accountNumber || undefined;
      }

      const response = await supabase.functions.invoke('create-supporter-invite', {
        body: inviteBody,
      });

      if (response.error || response.data?.error) {
        const errorMsg = await extractEdgeFunctionError(response, 'Failed to create invite. Please try again.');
        throw new Error(errorMsg);
      }

      const inviteResult = response.data.invite;
      let portfolioResult: any = null;

      // If supporter, also create the portfolio
      if (isSupporterRole) {
        const portfolioResponse = await supabase.functions.invoke('create-investor-portfolio', {
          body: {
            invite_id: inviteResult.id,
            investor_id: null,
            investment_amount: Number(supporterData.investmentAmount),
            duration_months: Number(supporterData.durationMonths),
            roi_percentage: Number(supporterData.roiPercentage),
            roi_mode: supporterData.roiMode,
            portfolio_pin: supporterData.portfolioPin,
            payment_method: supporterData.paymentMethod || null,
            mobile_network: supporterData.mobileNetwork || null,
            mobile_money_number: supporterData.mobileMoneyNumber || null,
            bank_name: supporterData.bankName || null,
            account_name: supporterData.accountName || null,
            account_number: supporterData.accountNumber || null,
            payout_day: Number(supporterData.payoutDay) || 15,
          },
        });

        if (portfolioResponse.error || portfolioResponse.data?.error) {
          console.error('Portfolio creation failed:', portfolioResponse.data?.error || portfolioResponse.error);
          // Invite was created, but portfolio failed. Still show success with just invite.
        } else {
          portfolioResult = portfolioResponse.data.portfolio;
        }
      }

      setCreatedInvite({
        token: inviteResult.activation_token,
        fullName: inviteResult.full_name,
        password: formData.password,
        role: selectedRole,
        portfolioToken: portfolioResult?.activation_token,
        portfolioCode: portfolioResult?.portfolio_code,
        investmentAmount: portfolioResult?.investment_amount,
        durationMonths: portfolioResult?.duration_months,
        roiPercentage: portfolioResult?.roi_percentage,
        roiMode: portfolioResult?.roi_mode,
      });

      toast({
        title: isSupporterRole ? '✅ Investor Portfolio Created!' : `✅ ${roleConfig[selectedRole].label} Invite Created!`,
        description: isSupporterRole ? 'Share the portfolio link with the investor.' : 'Share the activation link with the user.',
      });

      onSuccess?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create invite',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getShareLink = () => {
    if (!createdInvite) return '';
    const token = encodeURIComponent(createdInvite.token);
    const password = encodeURIComponent(createdInvite.password);
    return `${getPublicOrigin()}/activate-supporter?token=${token}&password=${password}`;
  };

  const getPortfolioLink = () => {
    if (!createdInvite?.portfolioToken) return '';
    return `${getPublicOrigin()}/investor/portfolio/${createdInvite.portfolioToken}`;
  };

  const getWhatsAppMessage = () => {
    if (!createdInvite) return '';
    const config = roleConfig[createdInvite.role];

    if (isSupporterRole && createdInvite.portfolioCode) {
      return `${config.emoji} Welcome to Welile, ${createdInvite.fullName}!

You've been registered as a Tenant Supporter (Investor)!

💰 Portfolio: ${createdInvite.portfolioCode}
📊 Investment: UGX ${createdInvite.investmentAmount?.toLocaleString()}
📅 Duration: ${createdInvite.durationMonths} months
📈 ROI: ${createdInvite.roiPercentage}% ${createdInvite.roiMode === 'monthly_compounding' ? '(Compounding)' : '(Monthly Payout)'}

🔐 Your Portfolio PIN: ${supporterData.portfolioPin}
🔐 Your Password: ${createdInvite.password}

👉 View your portfolio:
${getPortfolioLink()}

👉 Activate your account:
${getShareLink()}`;
    }

    return `${config.emoji} Welcome to Welile, ${createdInvite.fullName}!

You've been invited to join as a ${config.label}!

🔐 Your password: ${createdInvite.password}

👉 Activate your account here:
${getShareLink()}

Just click the link and enter your password to get started!`;
  };

  const handleShareWhatsApp = () => {
    const message = encodeURIComponent(getWhatsAppMessage());
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const handleCopyLink = async () => {
    const links = [getShareLink()];
    if (createdInvite?.portfolioToken) {
      links.push(`Portfolio Link: ${getPortfolioLink()}`);
      links.push(`Portfolio PIN: ${supporterData.portfolioPin}`);
    }
    await navigator.clipboard.writeText(links.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied to clipboard!' });
  };

  const handleClose = () => {
    setFormData({ email: '', fullName: '', phone: '', password: '', address: '' });
    setSupporterData(defaultSupporterData);
    setCreatedInvite(null);
    setCopied(false);
    setSelectedRole(defaultRole || 'tenant');
    setExpandedSection('personal');
    onOpenChange(false);
  };

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  const RoleIcon = roleConfig[selectedRole].icon;

  const SectionHeader = ({ id, title, emoji }: { id: string; title: string; emoji: string }) => (
    <button
      type="button"
      onClick={() => toggleSection(id)}
      className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted/70 transition-colors"
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <span>{emoji}</span> {title}
      </span>
      {expandedSection === id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
    </button>
  );

  const supporterFormSections = (
    <>
      {/* Section 1: Personal Details */}
      <SectionHeader id="personal" title="Personal Details" emoji="👤" />
      {expandedSection === 'personal' && (
        <div className="space-y-3 px-1">
          <div className="space-y-1.5">
            <Label htmlFor="fullName" className="text-xs font-medium">Full Name *</Label>
            <Input id="fullName" placeholder="Enter full name" value={formData.fullName} onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))} required className="h-12 text-base rounded-xl" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs font-medium">Phone Number *</Label>
            <Input id="phone" placeholder="0700000000" value={formData.phone} onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))} required className="h-12 text-base rounded-xl" inputMode="tel" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium">Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input id="email" type="email" placeholder="user@example.com" value={formData.email} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} className="h-12 text-base rounded-xl" inputMode="email" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nationalId" className="text-xs font-medium">National ID / Passport <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input id="nationalId" placeholder="e.g. CM12345678" value={supporterData.nationalId} onChange={(e) => setSupporterData(prev => ({ ...prev, nationalId: e.target.value }))} className="h-12 text-base rounded-xl" autoComplete="off" maxLength={50} />
          </div>
        </div>
      )}

      {/* Section 2: Address */}
      <SectionHeader id="address" title="Address Information" emoji="📍" />
      {expandedSection === 'address' && (
        <div className="space-y-3 px-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Country</Label>
            <Input value={supporterData.country} onChange={(e) => setSupporterData(prev => ({ ...prev, country: e.target.value }))} className="h-12 text-base rounded-xl" placeholder="Uganda" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">District / City</Label>
            <Input value={supporterData.districtCity} onChange={(e) => setSupporterData(prev => ({ ...prev, districtCity: e.target.value }))} className="h-12 text-base rounded-xl" placeholder="e.g. Kampala" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Physical Address</Label>
            <Input value={supporterData.physicalAddress} onChange={(e) => setSupporterData(prev => ({ ...prev, physicalAddress: e.target.value }))} className="h-12 text-base rounded-xl" placeholder="e.g. Plot 12, Ntinda Road" />
          </div>
        </div>
      )}

      {/* Section 3: Next of Kin */}
      <SectionHeader id="nextOfKin" title="Next of Kin" emoji="👨‍👩‍👧" />
      {expandedSection === 'nextOfKin' && (
        <div className="space-y-3 px-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Next of Kin Name</Label>
            <Input value={supporterData.nextOfKinName} onChange={(e) => setSupporterData(prev => ({ ...prev, nextOfKinName: e.target.value }))} className="h-12 text-base rounded-xl" placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Relationship</Label>
            <Select value={supporterData.nextOfKinRelationship} onValueChange={(v) => setSupporterData(prev => ({ ...prev, nextOfKinRelationship: v }))}>
              <SelectTrigger className="h-12 text-base rounded-xl"><SelectValue placeholder="Select relationship" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="spouse">Spouse</SelectItem>
                <SelectItem value="parent">Parent</SelectItem>
                <SelectItem value="sibling">Sibling</SelectItem>
                <SelectItem value="child">Child</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Next of Kin Phone</Label>
            <Input value={supporterData.nextOfKinPhone} onChange={(e) => setSupporterData(prev => ({ ...prev, nextOfKinPhone: e.target.value }))} className="h-12 text-base rounded-xl" placeholder="0700000000" inputMode="tel" />
          </div>
        </div>
      )}

      {/* Section 4: Investment Details */}
      <SectionHeader id="investment" title="Investment Details" emoji="💰" />
      {expandedSection === 'investment' && (
        <div className="space-y-3 px-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Investment Amount (UGX) *</Label>
            <Input type="number" value={supporterData.investmentAmount} onChange={(e) => setSupporterData(prev => ({ ...prev, investmentAmount: e.target.value }))} className="h-12 text-base rounded-xl" placeholder="Min 50,000" min={50000} inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Investment Duration *</Label>
            <Select value={supporterData.durationMonths} onValueChange={(v) => setSupporterData(prev => ({ ...prev, durationMonths: v }))}>
              <SelectTrigger className="h-12 text-base rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 months</SelectItem>
                <SelectItem value="6">6 months</SelectItem>
                <SelectItem value="12">12 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Monthly ROI (%)</Label>
            <Input type="number" value={supporterData.roiPercentage} onChange={(e) => setSupporterData(prev => ({ ...prev, roiPercentage: e.target.value }))} className="h-12 text-base rounded-xl" placeholder="15" min={1} max={100} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">ROI Payment Mode *</Label>
            <Select value={supporterData.roiMode} onValueChange={(v) => setSupporterData(prev => ({ ...prev, roiMode: v }))}>
              <SelectTrigger className="h-12 text-base rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly_payout">Monthly Payout — ROI sent every month</SelectItem>
                <SelectItem value="monthly_compounding">Monthly Compounding — ROI added to principal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {Number(supporterData.investmentAmount) >= 50000 && (
            <div className="p-3 rounded-xl bg-success/10 border border-success/20 space-y-1">
              <p className="text-xs font-medium text-success">Monthly Return Preview</p>
              <p className="text-sm font-bold text-foreground">
                {formatUGX(Math.round(Number(supporterData.investmentAmount) * (Number(supporterData.roiPercentage) / 100)))} / month
              </p>
            </div>
          )}
        </div>
      )}

      {/* Section 5: ROI Payment Method */}
      <SectionHeader id="payment" title="ROI Payment Method" emoji="💳" />
      {expandedSection === 'payment' && (
        <div className="space-y-3 px-1">
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setSupporterData(prev => ({ ...prev, paymentMethod: 'mobile_money' }))}
              className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all ${supporterData.paymentMethod === 'mobile_money' ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/30'}`}>
              <Smartphone className="h-6 w-6 mb-1.5 text-primary" />
              <span className="text-xs font-semibold">Mobile Money</span>
            </button>
            <button type="button" onClick={() => setSupporterData(prev => ({ ...prev, paymentMethod: 'bank' }))}
              className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all ${supporterData.paymentMethod === 'bank' ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/30'}`}>
              <Landmark className="h-6 w-6 mb-1.5 text-primary" />
              <span className="text-xs font-semibold">Bank Account</span>
            </button>
          </div>
          {supporterData.paymentMethod === 'mobile_money' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Mobile Network</Label>
                <Select value={supporterData.mobileNetwork} onValueChange={(v) => setSupporterData(prev => ({ ...prev, mobileNetwork: v }))}>
                  <SelectTrigger className="h-12 text-base rounded-xl"><SelectValue placeholder="Select network" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mtn">MTN</SelectItem>
                    <SelectItem value="airtel">Airtel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Mobile Money Number</Label>
                <Input value={supporterData.mobileMoneyNumber} onChange={(e) => setSupporterData(prev => ({ ...prev, mobileMoneyNumber: e.target.value }))} className="h-12 text-base rounded-xl" placeholder="0770000000" inputMode="tel" />
              </div>
            </div>
          )}
          {supporterData.paymentMethod === 'bank' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Bank Name</Label>
                <Input value={supporterData.bankName} onChange={(e) => setSupporterData(prev => ({ ...prev, bankName: e.target.value }))} className="h-12 text-base rounded-xl" placeholder="e.g. Stanbic Bank" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Account Name</Label>
                <Input value={supporterData.accountName} onChange={(e) => setSupporterData(prev => ({ ...prev, accountName: e.target.value }))} className="h-12 text-base rounded-xl" placeholder="Account holder name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Account Number</Label>
                <Input value={supporterData.accountNumber} onChange={(e) => setSupporterData(prev => ({ ...prev, accountNumber: e.target.value }))} className="h-12 text-base rounded-xl" placeholder="Account number" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 6: Security */}
      <SectionHeader id="security" title="Security & Access" emoji="🔐" />
      {expandedSection === 'security' && (
        <div className="space-y-3 px-1">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">4-Digit Portfolio PIN *</Label>
              <Button type="button" variant="ghost" size="sm" onClick={generatePin} className="h-7 text-xs gap-1">
                <Sparkles className="h-3 w-3" /> Generate
              </Button>
            </div>
            <Input type="text" maxLength={4} value={supporterData.portfolioPin} onChange={(e) => setSupporterData(prev => ({ ...prev, portfolioPin: e.target.value.replace(/\D/g, '').slice(0, 4) }))} className="h-12 text-base rounded-xl text-center font-mono tracking-[0.5em] text-2xl" placeholder="• • • •" inputMode="numeric" />
            <p className="text-xs text-muted-foreground">Investor uses this PIN to access their portfolio</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-medium">Temporary Password *</Label>
              <Button type="button" variant="ghost" size="sm" onClick={generatePassword} className="h-7 text-xs gap-1">
                <Sparkles className="h-3 w-3" /> Generate
              </Button>
            </div>
            <div className="relative">
              <Input id="password" type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))} required minLength={4} className="h-12 text-base pr-12 rounded-xl" autoComplete="off" />
              <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const standardFormFields = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
        <Input id="fullName" placeholder="Enter user's full name" value={formData.fullName} onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))} required className="h-12 text-base rounded-xl" autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium">Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input id="email" type="email" placeholder="user@example.com" value={formData.email} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} className="h-12 text-base rounded-xl" autoComplete="off" inputMode="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address" className="text-sm font-medium">Address</Label>
        <Input id="address" placeholder="e.g. Kampala, Ntinda" value={formData.address} onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))} className="h-12 text-base rounded-xl" autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
        <Input id="phone" placeholder="0700000000" value={formData.phone} onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))} required className="h-12 text-base rounded-xl" autoComplete="off" inputMode="tel" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-sm font-medium">Temporary Password</Label>
          <Button type="button" variant="ghost" size="sm" onClick={generatePassword} className="h-8 text-xs gap-1">
            <Sparkles className="h-3 w-3" /> Generate New
          </Button>
        </div>
        <div className="relative">
          <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Password" value={formData.password} onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))} required minLength={6} className="h-12 text-base pr-12 rounded-xl" autoComplete="off" />
          <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10" onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">This password will be shared with the user</p>
      </div>
    </div>
  );

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Role Selection */}
      {!lockRole && (
        <div className="space-y-3">
          <Label className="text-base font-medium">Who are you registering?</Label>
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(roleConfig) as UserRole[]).map((role) => {
              const config = roleConfig[role];
              const Icon = config.icon;
              const isSelected = selectedRole === role;
              return (
                <button key={role} type="button" onClick={() => setSelectedRole(role)}
                  className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 transition-all active:scale-95 ${isSelected ? `${config.bgColor} border-current` : 'bg-muted/30 border-transparent hover:bg-muted/50'}`}>
                  <span className="text-3xl mb-2">{config.emoji}</span>
                  <Icon className={`h-6 w-6 mb-1 ${isSelected ? config.color : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-semibold ${isSelected ? config.color : 'text-foreground'}`}>{config.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground text-center px-2">{roleConfig[selectedRole].description}</p>
        </div>
      )}

      {isSupporterRole ? supporterFormSections : standardFormFields}

      <Button type="submit" className="w-full h-14 text-sm sm:text-base font-semibold rounded-xl" disabled={isLoading}>
        {isLoading ? (
          <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> <span className="truncate">Creating Account...</span></>
        ) : (
          <><RoleIcon className={`h-5 w-5 mr-2 shrink-0 ${roleConfig[selectedRole].color}`} />
            <span className="truncate">{isSupporterRole ? 'Register Supporter Investment' : `Register ${roleConfig[selectedRole].label}`}</span></>
        )}
      </Button>
    </form>
  );

  const successContent = (
    <div className="space-y-5">
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{createdInvite ? roleConfig[createdInvite.role].emoji : ''}</span>
            <div>
              <p className="font-bold text-xl">{createdInvite?.fullName}</p>
              <p className="text-sm text-muted-foreground">
                {createdInvite ? roleConfig[createdInvite.role].label : ''} Account
                {createdInvite?.portfolioCode && ` • ${createdInvite.portfolioCode}`}
              </p>
            </div>
          </div>
          {createdInvite?.investmentAmount && (
            <div className="bg-background rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Investment</span>
                <span className="font-bold">{formatUGX(createdInvite.investmentAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-semibold">{createdInvite.durationMonths} months</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">ROI</span>
                <span className="font-semibold text-success">{createdInvite.roiPercentage}% {createdInvite.roiMode === 'monthly_compounding' ? '(Compounding)' : '(Payout)'}</span>
              </div>
            </div>
          )}
          <div className="bg-background rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-1">Temporary Password</p>
            <p className="font-mono font-bold text-xl tracking-wider">{createdInvite?.password}</p>
          </div>
          {createdInvite?.portfolioCode && (
            <div className="bg-background rounded-xl p-4">
              <p className="text-sm text-muted-foreground mb-1">Portfolio PIN</p>
              <p className="font-mono font-bold text-xl tracking-wider">{supporterData.portfolioPin}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {createdInvite?.portfolioToken && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Portfolio Link</Label>
          <div className="flex gap-2">
            <Input value={getPortfolioLink()} readOnly className="h-12 text-sm rounded-xl" />
            <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(getPortfolioLink()); toast({ title: 'Portfolio link copied!' }); }} className="h-12 w-12 shrink-0 rounded-xl">
              <Copy className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-medium">Activation Link</Label>
        <div className="flex gap-2">
          <Input value={getShareLink()} readOnly className="h-12 text-sm rounded-xl" />
          <Button variant="outline" size="icon" onClick={handleCopyLink} className="h-12 w-12 shrink-0 rounded-xl">
            {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <Button onClick={handleShareWhatsApp} className="w-full h-14 text-base font-semibold bg-green-600 hover:bg-green-700 rounded-xl">
        <Share2 className="h-5 w-5 mr-2" /> Share on WhatsApp
      </Button>

      <Button variant="outline" onClick={handleClose} className="w-full h-12 text-base rounded-xl">
        Register Another User
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl overflow-y-auto pb-safe">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <UserPlus className="h-6 w-6 text-primary" />
              {createdInvite ? 'Share Activation Link' : isSupporterRole ? 'Register Tenant Supporter Investment' : 'Register New User'}
            </SheetTitle>
            <SheetDescription>
              {createdInvite
                ? `Share this link with the ${roleConfig[createdInvite.role].label.toLowerCase()}`
                : isSupporterRole ? 'Create an investor portfolio account' : 'Create a new account'}
            </SheetDescription>
          </SheetHeader>
          {!createdInvite ? formContent : successContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            {createdInvite ? 'Share Activation Link' : isSupporterRole ? 'Register Tenant Supporter Investment' : 'Register New User'}
          </DialogTitle>
          <DialogDescription>
            {createdInvite
              ? `Share this link with the ${roleConfig[createdInvite.role].label.toLowerCase()} to activate their account`
              : isSupporterRole ? 'Create an investor portfolio account and share the activation link' : 'Create a new account and share the activation link'}
          </DialogDescription>
        </DialogHeader>
        {!createdInvite ? formContent : successContent}
      </DialogContent>
    </Dialog>
  );
}

function formatUGX(amount: number): string {
  return `UGX ${amount.toLocaleString()}`;
}

export default CreateUserInviteDialog;

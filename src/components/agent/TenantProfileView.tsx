import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { generateWelileAiId, getRiskTierLabel } from '@/lib/welileAiId';
import { formatUGX } from '@/lib/rentCalculations';
import { useAgentBalances } from '@/hooks/useAgentBalances';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, ArrowLeft, Phone, Mail, MapPin, Home, User, Shield, Calendar,
  CreditCard, TrendingUp, Copy, CheckCircle2, Wallet, Banknote, History,
  UserCheck, Star, AlertTriangle, ChevronDown, ChevronUp, Navigation, Share2, Smartphone,
  MessageCircle, Pencil, UsersRound, Zap, Bot,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useGeoLocation } from '@/hooks/useGeoLocation';
import { createShortLink } from '@/lib/createShortLink';
import { AgentTenantCollectDialog } from './AgentTenantCollectDialog';
import { shareTenantProfileWhatsApp, type TenantProfilePdfData } from '@/lib/tenantProfilePdf';
import { UserAvatar } from '@/components/UserAvatar';
import { RegisterSubAgentDialog } from './RegisterSubAgentDialog';

interface TenantProfileViewProps {
  tenantId: string;
  onBack: () => void;
}

interface TenantProfile {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  created_at: string;
  monthly_rent: number | null;
  verified: boolean;
  national_id: string | null;
  avatar_url: string | null;
}

interface RentRequestRow {
  id: string;
  rent_amount: number;
  total_repayment: number;
  amount_repaid: number;
  status: string | null;
  created_at: string;
  disbursed_at: string | null;
  duration_days: number;
  daily_repayment: number;
  landlord?: { name: string; property_address: string; house_category?: string } | null;
}

interface RepaymentRow {
  id: string;
  amount: number;
  created_at: string;
  rent_request_id: string;
}

interface WalletData {
  balance: number;
  total_in: number;
  total_out: number;
}

const PAGE_SIZE = 5;

export function TenantProfileView({ tenantId, onBack }: TenantProfileViewProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { floatBalance: agentFloatBalance, refetch: refetchFloat } = useAgentBalances();
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [requests, setRequests] = useState<RentRequestRow[]>([]);
  const [repayments, setRepayments] = useState<RepaymentRow[]>([]);
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  
  const [partnershipAmount, setPartnershipAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showAllRepayments, setShowAllRepayments] = useState(false);
  const [showAllRequests, setShowAllRequests] = useState(false);

  // Float payment dialog
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);

  // GPS capture
  const { location: gpsLocation, loading: gpsLoading, error: gpsError, captureLocation } = useGeoLocation();

  // Dashboard link sharing
  const [sharingLink, setSharingLink] = useState(false);
  const [sharingProfile, setSharingProfile] = useState(false);

  // User roles
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [addingRole, setAddingRole] = useState(false);

  // Sub-agent dialog
  const [subAgentDialogOpen, setSubAgentDialogOpen] = useState(false);

  // Auto-collect
  const [autoCollecting, setAutoCollecting] = useState(false);

  const aiId = generateWelileAiId(tenantId);

  useEffect(() => {
    loadFullProfile();
  }, [tenantId]);

  const loadFullProfile = async () => {
    setLoading(true);
    try {
      const [profileRes, rentRes, repaymentRes, walletRes, portfolioRes, ledgerRes, rolesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, phone, email, created_at, monthly_rent, verified, national_id, avatar_url')
          .eq('id', tenantId)
          .single(),
        supabase
          .from('rent_requests')
          .select('id, rent_amount, total_repayment, amount_repaid, status, created_at, disbursed_at, duration_days, daily_repayment, landlord:landlords(name, property_address, house_category)')
          .eq('tenant_id', tenantId)
          .in('status', ['pending', 'approved', 'funded', 'disbursed', 'repaying', 'completed'])
          .order('created_at', { ascending: false }),
        supabase
          .from('repayments')
          .select('id, amount, created_at, rent_request_id')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('wallets')
          .select('balance')
          .eq('user_id', tenantId)
          .single(),
        supabase
          .from('investor_portfolios')
          .select('investment_amount')
          .eq('investor_id', tenantId)
          .in('status', ['active', 'pending', 'pending_approval']),
        supabase
          .from('general_ledger')
          .select('amount, direction')
          .eq('user_id', tenantId)
          .eq('ledger_scope', 'wallet')
          .limit(200),
        supabase
          .from('user_roles')
          .select('role, enabled')
          .eq('user_id', tenantId),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data as unknown as TenantProfile);
      }

      setRequests((rentRes.data as unknown as RentRequestRow[]) || []);
      setRepayments((repaymentRes.data as RepaymentRow[]) || []);

      const ledgerEntries = (ledgerRes.data || []) as any[];
      const totalIn = ledgerEntries.filter(e => e.direction === 'cash_in').reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const totalOut = ledgerEntries.filter(e => e.direction === 'cash_out').reduce((s: number, e: any) => s + (e.amount || 0), 0);
      setWalletData({
        balance: walletRes.data?.balance ?? 0,
        total_in: totalIn,
        total_out: totalOut,
      });

      const pAmount = (portfolioRes.data || []).reduce((s: number, p: any) => s + (p.investment_amount || 0), 0);
      setPartnershipAmount(pAmount);

      // Set user roles
      const enabledRoles = ((rolesRes.data || []) as any[])
        .filter(r => r.enabled === null || r.enabled === true)
        .map(r => r.role as string);
      setUserRoles(enabledRoles);
    } catch (err) {
      console.error('Failed to load tenant profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const totalFunded = requests.reduce((s, r) => s + (r.total_repayment || 0), 0);
    const totalRepaid = requests.reduce((s, r) => s + (r.amount_repaid || 0), 0);
    const completedCount = requests.filter(r => r.status === 'completed').length;
    const activeRequest = requests.find(r => ['funded', 'disbursed', 'repaying'].includes(r.status || ''));
    const outstanding = activeRequest ? (activeRequest.total_repayment - activeRequest.amount_repaid) : 0;
    const latest = requests[0];

    return {
      totalRequests: requests.length,
      totalFunded,
      totalRepaid,
      totalOwing: Math.max(0, totalFunded - totalRepaid),
      completionRate: requests.length > 0 ? Math.round((completedCount / requests.length) * 100) : 0,
      activeRequest,
      currentOutstanding: Math.max(0, outstanding),
      latestLandlord: latest?.landlord?.name || null,
      latestAddress: latest?.landlord?.property_address || null,
      latestHouseType: latest?.landlord?.house_category || null,
      latestStatus: latest?.status || null,
    };
  }, [requests]);

  const earningRating = useMemo(() => {
    if (summary.totalRequests === 0) return { stars: 0, label: 'New User' };
    const rate = summary.completionRate;
    if (rate >= 90) return { stars: 5, label: 'Excellent' };
    if (rate >= 75) return { stars: 4, label: 'Good' };
    if (rate >= 50) return { stars: 3, label: 'Average' };
    if (rate >= 25) return { stars: 2, label: 'Below Average' };
    return { stars: 1, label: 'Needs Improvement' };
  }, [summary]);

  const riskLevel = summary.completionRate >= 80 ? 'good' : summary.completionRate >= 50 ? 'standard' : summary.totalRequests === 0 ? 'new' : 'caution';
  const riskTier = getRiskTierLabel(riskLevel);

  const copyAiId = () => {
    navigator.clipboard.writeText(aiId);
    setCopied(true);
    toast({ title: 'AI ID copied' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCaptureGPS = async () => {
    const loc = await captureLocation();
    if (loc) {
      toast({ title: '📍 GPS Captured', description: `Lat: ${loc.latitude.toFixed(5)}, Lng: ${loc.longitude.toFixed(5)}` });
    }
  };

  const handleSendDashboardLink = async () => {
    if (!user || !profile) return;
    setSharingLink(true);
    try {
      const shortUrl = await createShortLink(user.id, '/auth', { phone: profile.phone, ref: user.id });
      
      if (navigator.share) {
        await navigator.share({
          title: 'Welile Dashboard',
          text: `Hi ${profile.full_name}, access your Welile dashboard here:`,
          url: shortUrl,
        });
      } else {
        await navigator.clipboard.writeText(shortUrl);
        toast({ title: '🔗 Link copied', description: 'Share it via WhatsApp or SMS' });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        toast({ title: 'Failed to share link', variant: 'destructive' });
      }
    } finally {
      setSharingLink(false);
    }
  };

  const handleShareProfile = async () => {
    if (!profile) return;
    setSharingProfile(true);
    try {
      const pdfData: TenantProfilePdfData = {
        aiId,
        fullName: profile.full_name,
        phone: profile.phone,
        email: profile.email,
        nationalId: profile.national_id,
        verified: profile.verified,
        memberSince: profile.created_at,
        monthlyRent: profile.monthly_rent,
        riskLabel: riskTier.label,
        completionRate: summary.completionRate,
        earningLabel: earningRating.label,
        earningStars: earningRating.stars,
        totalRequests: summary.totalRequests,
        totalRepaid: summary.totalRepaid,
        totalOwing: summary.totalOwing,
        currentOutstanding: summary.currentOutstanding,
        walletBalance: walletData?.balance ?? 0,
        landlordName: summary.latestLandlord,
        propertyAddress: summary.latestAddress,
        houseType: summary.latestHouseType,
        rentPlans: requests.map(r => ({
          date: r.created_at,
          rentAmount: r.rent_amount,
          totalRepayment: r.total_repayment,
          amountRepaid: r.amount_repaid,
          status: r.status || 'unknown',
        })),
        latitude: gpsLocation?.latitude,
        longitude: gpsLocation?.longitude,
      };
      await shareTenantProfileWhatsApp(pdfData);
      toast({ title: '📄 Profile shared' });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        toast({ title: 'Failed to share profile', variant: 'destructive' });
      }
    } finally {
      setSharingProfile(false);
    }
  };

  const handleAddRole = async (role: string) => {
    if (!profile) return;
    setAddingRole(true);
    try {
      // Check if role already exists (even disabled)
      const typedRole = role as 'agent' | 'supporter' | 'landlord' | 'tenant';
      const { data: existing } = await supabase
        .from('user_roles')
        .select('id, enabled')
        .eq('user_id', tenantId)
        .eq('role', typedRole)
        .maybeSingle();

      if (existing) {
        if (existing.enabled === false) {
          await supabase.from('user_roles').update({ enabled: true }).eq('id', existing.id);
          toast({ title: `✅ ${role} role re-enabled for ${profile.full_name}` });
        } else {
          toast({ title: `Already has ${role} role`, variant: 'default' });
        }
      } else {
        const { error } = await supabase.from('user_roles').insert([{
          user_id: tenantId,
          role: typedRole,
          enabled: true,
        }]);
        if (error) throw error;
        toast({ title: `✅ ${role} role added to ${profile.full_name}` });
      }
      // Refresh roles
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role, enabled')
        .eq('user_id', tenantId);
      const enabled = ((rolesData || []) as any[])
        .filter(r => r.enabled === null || r.enabled === true)
        .map(r => r.role as string);
      setUserRoles(enabled);
    } catch (err: any) {
      toast({ title: 'Failed to add role', description: err.message, variant: 'destructive' });
    } finally {
      setAddingRole(false);
    }
  };

  const handleAutoCollectFromWallet = async () => {
    if (!profile || !summary.activeRequest || !walletData) return;
    const collectAmount = Math.min(walletData.balance, summary.currentOutstanding);
    if (collectAmount <= 0) {
      toast({ title: 'No funds available', description: 'Tenant wallet is empty', variant: 'destructive' });
      return;
    }
    setAutoCollecting(true);
    try {
      const { error } = await supabase.functions.invoke('tenant-pay-rent', {
        body: {
          tenant_id: tenantId,
          rent_request_id: summary.activeRequest.id,
          amount: collectAmount,
        },
      });
      if (error) throw error;
      toast({ title: `✅ Auto-collected ${formatUGX(collectAmount)}`, description: 'From tenant wallet' });
      loadFullProfile();
    } catch (err: any) {
      toast({ title: 'Auto-collect failed', description: err.message, variant: 'destructive' });
    } finally {
      setAutoCollecting(false);
    }
  };

  const progressPct = summary.totalFunded > 0 ? Math.min(100, Math.round((summary.totalRepaid / summary.totalFunded) * 100)) : 0;

  const visibleRepayments = showAllRepayments ? repayments : repayments.slice(0, PAGE_SIZE);
  const visibleRequests = showAllRequests ? requests : requests.slice(0, PAGE_SIZE);

  const availableRolesToAdd = ['agent', 'supporter', 'landlord'].filter(r => !userRoles.includes(r));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4">
        <Button variant="ghost" size="lg" onClick={onBack} className="mb-4 gap-2 text-base">
          <ArrowLeft className="h-5 w-5" /> Back
        </Button>
        <p className="text-sm text-muted-foreground text-center">Profile not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header with avatar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="default" onClick={onBack} className="h-11 px-3 rounded-xl shrink-0 gap-1.5 text-base font-semibold">
          <ArrowLeft className="h-5 w-5" />
          Back
        </Button>
        <UserAvatar avatarUrl={profile.avatar_url} fullName={profile.full_name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-base truncate">{profile.full_name}</p>
          <p className="text-sm text-muted-foreground">Tenant Profile</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={handleShareProfile}
          disabled={sharingProfile}
          className="h-11 w-11 rounded-xl shrink-0"
        >
          {sharingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        </Button>
        {profile.verified && (
          <Badge className="bg-success/15 text-success border-0 text-xs">Verified ✓</Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* AI ID Card */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-4 border border-primary/20">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Welile AI ID</p>
          <div className="flex items-center gap-3">
            <p className="text-2xl font-black font-mono tracking-wider text-primary">{aiId}</p>
            <button onClick={copyAiId} className="p-2 rounded-lg bg-primary/10 active:scale-90 transition-transform">
              {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-primary" />}
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={`text-sm font-semibold ${riskTier.color}`}>{riskTier.label}</span>
            {summary.totalRequests > 0 && (
              <span className="text-xs text-muted-foreground ml-1">• {summary.completionRate}% completion rate</span>
            )}
          </div>
        </div>

        {/* Roles & Verification — with Add Role */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <UserCheck className="h-4 w-4" /> Roles & Verification
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {userRoles.map(role => (
              <Badge key={role} variant="outline" className="capitalize text-xs">{role}</Badge>
            ))}
            {userRoles.length === 0 && <Badge variant="outline" className="capitalize text-xs">Tenant</Badge>}
            {profile.verified && <Badge className="bg-success/15 text-success border-0 text-xs">✓ Verified</Badge>}
            {profile.national_id && <Badge className="bg-primary/10 text-primary border-0 text-xs">ID on file</Badge>}
            {!profile.verified && <Badge className="bg-warning/15 text-warning border-0 text-xs">⏳ Unverified</Badge>}
          </div>

          {/* Add role buttons */}
          {availableRolesToAdd.length > 0 && (
            <div className="pt-2 border-t border-border/40">
              <p className="text-xs text-muted-foreground mb-2">Add role to this user:</p>
              <div className="flex flex-wrap gap-2">
                {availableRolesToAdd.map(role => (
                  <Button
                    key={role}
                    variant="outline"
                    size="sm"
                    className="capitalize gap-1.5 text-sm"
                    onClick={() => handleAddRole(role)}
                    disabled={addingRole}
                  >
                    {addingRole ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
                    + {role}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            Joined {format(new Date(profile.created_at), 'dd MMM yyyy')}
          </div>
        </div>

        {/* ── Pay from Operations Float — PROMINENT ── */}
        {summary.activeRequest && summary.currentOutstanding > 0 && (
          <div className="rounded-2xl border-2 border-success/40 bg-gradient-to-br from-success/10 to-success/5 p-4 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-success flex items-center gap-1.5">
              <Wallet className="h-4 w-4" /> Pay from Operations Float
            </h3>
            <p className="text-xs text-muted-foreground">
              Use your operations float to pay this tenant's rent directly. The amount will be deducted from your float balance.
            </p>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-success/10 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Outstanding</p>
                <p className="text-lg font-black font-mono text-destructive">{formatUGX(summary.currentOutstanding)}</p>
              </div>
              <div className="bg-success/10 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Your Float</p>
                <p className="text-lg font-black font-mono text-success">{formatUGX(agentFloatBalance)}</p>
              </div>
            </div>
            {agentFloatBalance < 500 && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl p-3">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-xs text-destructive font-medium">Insufficient float. Deposit to your operations float first or ask CFO to top up.</p>
              </div>
            )}
            <Button
              onClick={() => setCollectDialogOpen(true)}
              className="w-full gap-2 text-base h-14 font-bold rounded-xl shadow-lg"
              variant="success"
              size="xl"
              disabled={agentFloatBalance < 500}
            >
              <Banknote className="h-6 w-6" />
              Pay {formatUGX(Math.min(summary.currentOutstanding, agentFloatBalance))} from Float
            </Button>
            <p className="text-[10px] text-center text-muted-foreground">
              💡 You earn <span className="font-bold text-success">10% commission</span> on every float payment
            </p>
          </div>
        )}

        {/* Quick Actions — Make Sub-Agent, Send Dashboard, Auto-Collect */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Zap className="h-4 w-4" /> Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {/* Make Sub-Agent */}
            <Button
              variant="outline"
              size="lg"
              className="gap-2 text-sm h-auto py-3 flex-col items-center"
              onClick={() => setSubAgentDialogOpen(true)}
            >
              <UsersRound className="h-5 w-5 text-warning" />
              Make Sub-Agent
            </Button>

            {/* Send Dashboard Link */}
            <Button
              variant="outline"
              size="lg"
              className="gap-2 text-sm h-auto py-3 flex-col items-center"
              onClick={handleSendDashboardLink}
              disabled={sharingLink}
            >
              {sharingLink ? <Loader2 className="h-5 w-5 animate-spin" /> : <Smartphone className="h-5 w-5 text-primary" />}
              Dashboard Link
            </Button>

            {/* Auto-Collect from Tenant Wallet */}
            {summary.activeRequest && walletData && walletData.balance > 0 && (
              <Button
                variant="outline"
                size="lg"
                className="gap-2 text-sm h-auto py-3 flex-col items-center col-span-2 border-success/30 bg-success/5"
                onClick={handleAutoCollectFromWallet}
                disabled={autoCollecting}
              >
                {autoCollecting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bot className="h-5 w-5 text-success" />}
                <span>Auto-Collect from Wallet</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {formatUGX(Math.min(walletData.balance, summary.currentOutstanding))}
                </span>
              </Button>
            )}
          </div>
        </div>

        {/* Earning Rating */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Star className="h-4 w-4" /> Earning Rating
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} className={`h-5 w-5 ${i <= earningRating.stars ? 'text-warning fill-warning' : 'text-muted-foreground/30'}`} />
              ))}
            </div>
            <span className="text-base font-semibold">{earningRating.label}</span>
          </div>
          {partnershipAmount > 0 && (
            <p className="text-sm text-muted-foreground">
              Partnership investment: <span className="font-bold text-primary font-mono">{formatUGX(partnershipAmount)}</span>
            </p>
          )}
        </div>

        {/* Contact Details */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Contact Details</h3>
          <div className="space-y-2.5">
            {/* Phone row with WhatsApp */}
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0"><Phone className="h-4 w-4 text-muted-foreground" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  Phone
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-success bg-success/10 rounded-full px-1.5 py-0.5">
                    <MessageCircle className="h-2.5 w-2.5" /> WhatsApp
                  </span>
                </p>
                <a href={`tel:${profile.phone}`} className="text-base font-semibold text-primary">{profile.phone}</a>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={`https://wa.me/${profile.phone.replace(/^0/, '256').replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-11 w-11 rounded-xl bg-success/15 flex items-center justify-center active:scale-90 transition-transform"
                  style={{ touchAction: 'manipulation' }}
                >
                  <MessageCircle className="h-5 w-5 text-success" />
                </a>
                <button
                  onClick={() => {
                    const msg = encodeURIComponent(
                      `Hi ${profile.full_name}, this is your Welile agent. Please update your phone number in the Welile app. Go to Settings > Profile to make changes. Thank you!`
                    );
                    window.open(`https://wa.me/${profile.phone.replace(/^0/, '256').replace(/[^0-9]/g, '')}?text=${msg}`, '_blank');
                  }}
                  className="h-11 w-11 rounded-xl bg-warning/15 flex items-center justify-center active:scale-90 transition-transform"
                  style={{ touchAction: 'manipulation' }}
                  title="Request phone edit"
                >
                  <Pencil className="h-4 w-4 text-warning" />
                </button>
              </div>
            </div>

            {/* Email row with edit request */}
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0"><Mail className="h-4 w-4 text-muted-foreground" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-base font-semibold truncate">{profile.email || 'Not set'}</p>
              </div>
              <button
                onClick={() => {
                  const msg = encodeURIComponent(
                    `Hi ${profile.full_name}, this is your Welile agent. Please update your email address in the Welile app. Go to Settings > Profile to make changes. Thank you!`
                  );
                  window.open(`https://wa.me/${profile.phone.replace(/^0/, '256').replace(/[^0-9]/g, '')}?text=${msg}`, '_blank');
                }}
                className="h-11 w-11 rounded-xl bg-warning/15 flex items-center justify-center active:scale-90 transition-transform shrink-0"
                style={{ touchAction: 'manipulation' }}
                title="Request email edit"
              >
                <Pencil className="h-4 w-4 text-warning" />
              </button>
            </div>

            {profile.national_id && (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0"><CreditCard className="h-4 w-4 text-muted-foreground" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">National ID</p>
                  <p className="text-base font-semibold font-mono">{profile.national_id}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0"><Calendar className="h-4 w-4 text-muted-foreground" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Member Since</p>
                <p className="text-base font-semibold">{format(new Date(profile.created_at), 'dd MMM yyyy')}</p>
              </div>
            </div>
          </div>

          {/* GPS Capture */}
          <div className="pt-2 border-t border-border/40 space-y-2">
            <Button
              variant="outline"
              size="lg"
              className="w-full gap-2 text-base"
              onClick={handleCaptureGPS}
              disabled={gpsLoading}
            >
              {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
              Capture GPS Location
            </Button>
            {gpsLocation && (
              <div className="bg-muted/30 rounded-xl p-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-success shrink-0" />
                <div className="text-sm">
                  <span className="font-mono font-semibold">{gpsLocation.latitude.toFixed(5)}</span>
                  <span className="text-muted-foreground mx-1">,</span>
                  <span className="font-mono font-semibold">{gpsLocation.longitude.toFixed(5)}</span>
                  {gpsLocation.accuracy && (
                    <span className="text-xs text-muted-foreground ml-2">±{Math.round(gpsLocation.accuracy)}m</span>
                  )}
                </div>
              </div>
            )}
            {gpsError && (
              <p className="text-xs text-destructive">{gpsError}</p>
            )}
          </div>
        </div>

        {/* Wallet Usage Behavior */}
        {walletData && (
          <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Wallet className="h-4 w-4" /> Wallet Usage
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="text-base font-bold font-mono text-primary">{formatUGX(walletData.balance)}</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">Total In</p>
                <p className="text-base font-bold font-mono text-success">{formatUGX(walletData.total_in)}</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">Total Out</p>
                <p className="text-base font-bold font-mono text-destructive">{formatUGX(walletData.total_out)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Current Property */}
        {summary.latestLandlord && (
          <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Current Property</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/30 rounded-xl p-3 flex items-start gap-2">
                <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Landlord</p>
                  <p className="text-sm font-bold truncate">{summary.latestLandlord}</p>
                </div>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 flex items-start gap-2">
                <Home className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">House Type</p>
                  <p className="text-sm font-bold truncate">{summary.latestHouseType || 'N/A'}</p>
                </div>
              </div>
              {summary.latestAddress && (
                <div className="bg-muted/30 rounded-xl p-3 flex items-start gap-2 col-span-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Address</p>
                    <p className="text-sm font-bold">{summary.latestAddress}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Outstanding Balance + Pay from Float Button */}
        {summary.activeRequest && (
          <div className="rounded-2xl border-2 border-destructive/30 bg-destructive/[0.04] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> Outstanding Balance
              </h3>
              <Badge variant="destructive" className="text-sm font-mono">
                {formatUGX(summary.currentOutstanding)}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <p className="text-muted-foreground">Rent Amount</p>
                <p className="font-bold font-mono text-sm">{formatUGX(summary.activeRequest.rent_amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Due</p>
                <p className="font-bold font-mono text-sm">{formatUGX(summary.activeRequest.total_repayment)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Repaid</p>
                <p className="font-bold font-mono text-sm text-success">{formatUGX(summary.activeRequest.amount_repaid)}</p>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Repayment progress</span>
                <span className="font-bold">
                  {Math.round((summary.activeRequest.amount_repaid / summary.activeRequest.total_repayment) * 100)}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-destructive transition-all"
                  style={{ width: `${Math.min(100, (summary.activeRequest.amount_repaid / summary.activeRequest.total_repayment) * 100)}%` }}
                />
              </div>
            </div>

            <Button
              onClick={() => setCollectDialogOpen(true)}
              disabled={summary.currentOutstanding <= 0 || agentFloatBalance < 500}
              className="w-full gap-2 text-base"
              variant="success"
              size="xl"
            >
              <Banknote className="h-5 w-5" />
              Pay from Operations Float — {formatUGX(Math.min(summary.currentOutstanding, agentFloatBalance))}
            </Button>
          </div>
        )}

        {/* Repayment Behavior Summary */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4" /> Rent Payment Behavior
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Rent Plans</p>
              <p className="text-xl font-black font-mono">{summary.totalRequests}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Completion Rate</p>
              <p className={`text-xl font-black font-mono ${summary.completionRate >= 80 ? 'text-success' : summary.completionRate >= 50 ? 'text-primary' : 'text-destructive'}`}>
                {summary.completionRate}%
              </p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Repaid</p>
              <p className="text-base font-bold text-success font-mono">{formatUGX(summary.totalRepaid)}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Owing</p>
              <p className={`text-base font-bold font-mono ${summary.totalOwing > 0 ? 'text-destructive' : 'text-success'}`}>
                {summary.totalOwing > 0 ? formatUGX(summary.totalOwing) : 'Clear ✓'}
              </p>
            </div>
          </div>

          {summary.totalFunded > 0 && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Overall repayment</span>
                <span className="font-bold">{progressPct}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${progressPct >= 100 ? 'bg-success' : progressPct >= 50 ? 'bg-primary' : 'bg-destructive'}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Rent Request History */}
        {requests.length > 0 && (
          <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Home className="h-4 w-4" /> Rent Plan History ({requests.length})
            </h3>
            <div className="space-y-2">
              {visibleRequests.map(req => {
                const owing = Math.max(0, req.total_repayment - req.amount_repaid);
                const pct = req.total_repayment > 0 ? Math.round((req.amount_repaid / req.total_repayment) * 100) : 0;
                return (
                  <div key={req.id} className="bg-muted/30 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{format(new Date(req.created_at), 'dd MMM yyyy')}</span>
                      <Badge variant="outline" className="text-xs capitalize">{req.status}</Badge>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Rent: <span className="font-bold text-foreground font-mono">{formatUGX(req.rent_amount)}</span></span>
                      <span>Owing: <span className={`font-bold font-mono ${owing > 0 ? 'text-destructive' : 'text-success'}`}>{owing > 0 ? formatUGX(owing) : 'Cleared'}</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 100 ? 'bg-success' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                    </div>
                    {req.landlord?.name && (
                      <p className="text-xs text-muted-foreground">📍 {req.landlord.name} — {req.landlord.property_address || 'N/A'}</p>
                    )}
                  </div>
                );
              })}
            </div>
            {requests.length > PAGE_SIZE && (
              <Button variant="ghost" size="sm" className="w-full text-sm gap-1" onClick={() => setShowAllRequests(!showAllRequests)}>
                {showAllRequests ? <><ChevronUp className="h-3 w-3" /> Show Less</> : <><ChevronDown className="h-3 w-3" /> Show All ({requests.length})</>}
              </Button>
            )}
          </div>
        )}

        {/* Repayment History */}
        {repayments.length > 0 && (
          <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <History className="h-4 w-4" /> Repayment History ({repayments.length})
            </h3>
            <div className="space-y-1.5">
              {visibleRepayments.map(r => (
                <div key={r.id} className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold font-mono text-success">{formatUGX(r.amount)}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(r.created_at), 'dd MMM yyyy, HH:mm')}</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-success/60" />
                </div>
              ))}
            </div>
            {repayments.length > PAGE_SIZE && (
              <Button variant="ghost" size="sm" className="w-full text-sm gap-1" onClick={() => setShowAllRepayments(!showAllRepayments)}>
                {showAllRepayments ? <><ChevronUp className="h-3 w-3" /> Show Less</> : <><ChevronDown className="h-3 w-3" /> Show All ({repayments.length})</>}
              </Button>
            )}
          </div>
        )}

        {/* Monthly Rent */}
        {profile.monthly_rent && profile.monthly_rent > 0 && (
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <p className="text-xs text-muted-foreground">Monthly Rent</p>
            <p className="text-xl font-black font-mono text-primary">{formatUGX(profile.monthly_rent)}</p>
          </div>
        )}
      </div>

      {/* Float payment dialog */}
      {summary.activeRequest && profile && (
        <AgentTenantCollectDialog
          open={collectDialogOpen}
          onOpenChange={setCollectDialogOpen}
          tenant={{ id: profile.id, full_name: profile.full_name, phone: profile.phone }}
          rentRequestId={summary.activeRequest.id}
          outstandingBalance={summary.currentOutstanding}
          onSuccess={() => {
            setCollectDialogOpen(false);
            loadFullProfile();
            refetchFloat();
          }}
        />
      )}

      {/* Sub-Agent Registration Dialog — pre-filled with tenant info */}
      <RegisterSubAgentDialog
        open={subAgentDialogOpen}
        onOpenChange={setSubAgentDialogOpen}
        onSuccess={loadFullProfile}
      />
    </div>
  );
}

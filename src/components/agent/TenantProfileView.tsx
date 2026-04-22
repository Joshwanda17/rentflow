import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { generateWelileAiId, getRiskTierLabel } from '@/lib/welileAiId';
import { formatUGX } from '@/lib/rentCalculations';
import { useAgentLandlordFloat } from '@/hooks/useAgentLandlordFloat';
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
import { ReverseAllocationDialog } from './ReverseAllocationDialog';
import { Undo2 } from 'lucide-react';
import { shareTenantProfileWhatsApp, type TenantProfilePdfData } from '@/lib/tenantProfilePdf';
import { UserAvatar } from '@/components/UserAvatar';
import { RegisterSubAgentDialog } from './RegisterSubAgentDialog';
import { EditTenantDialog } from './EditTenantDialog';
import { TenantQuickActionsSheet } from './TenantQuickActionsSheet';
import { RentAccessLimitCard } from './RentAccessLimitCard';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Sparkles, ChevronRight } from 'lucide-react';

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

/* ---------- Small presentational helpers (local, no new files) ---------- */

function SectionCard({
  icon: Icon,
  title,
  badge,
  tone = 'neutral',
  children,
}: {
  icon: any;
  title: string;
  badge?: React.ReactNode;
  tone?: 'neutral' | 'primary' | 'destructive' | 'success';
  children: React.ReactNode;
}) {
  const toneRing =
    tone === 'primary' ? 'border-primary/30'
    : tone === 'destructive' ? 'border-destructive/30'
    : tone === 'success' ? 'border-success/30'
    : 'border-border/60';
  const toneIcon =
    tone === 'primary' ? 'text-primary'
    : tone === 'destructive' ? 'text-destructive'
    : tone === 'success' ? 'text-success'
    : 'text-muted-foreground';
  return (
    <section className={`rounded-2xl border ${toneRing} bg-card p-4 sm:p-5 space-y-4`}>
      <header className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Icon className={`h-5 w-5 ${toneIcon}`} aria-hidden="true" />
          {title}
        </h3>
        {badge}
      </header>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'success' | 'destructive' | 'primary' | 'warning';
}) {
  const valueTone =
    tone === 'success' ? 'text-success'
    : tone === 'destructive' ? 'text-destructive'
    : tone === 'primary' ? 'text-primary'
    : tone === 'warning' ? 'text-warning'
    : 'text-foreground';
  return (
    <div className="bg-muted/40 rounded-xl p-3 text-center">
      <p className="text-[11px] sm:text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
      <p className={`text-base sm:text-lg font-bold font-mono mt-1 ${valueTone}`}>{value}</p>
    </div>
  );
}

/* ---------- Main component ---------- */

export function TenantProfileView({ tenantId, onBack }: TenantProfileViewProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { floatBalance: agentFloatBalance, isLoading: floatLoading, error: floatError, refetch: refetchFloat } = useAgentLandlordFloat(user?.id);
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [requests, setRequests] = useState<RentRequestRow[]>([]);
  const [repayments, setRepayments] = useState<RepaymentRow[]>([]);
  const [walletData, setWalletData] = useState<WalletData | null>(null);

  const [partnershipAmount, setPartnershipAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showAllRepayments, setShowAllRepayments] = useState(false);
  const [showAllRequests, setShowAllRequests] = useState(false);

  const [collectDialogOpen, setCollectDialogOpen] = useState(false);

  const { location: gpsLocation, loading: gpsLoading, error: gpsError, captureLocation } = useGeoLocation();

  const [sharingLink, setSharingLink] = useState(false);
  const [sharingProfile, setSharingProfile] = useState(false);

  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [addingRole, setAddingRole] = useState(false);

  const [subAgentDialogOpen, setSubAgentDialogOpen] = useState(false);

  const [autoCollecting, setAutoCollecting] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const [lastAllocation, setLastAllocation] = useState<{ id: string; amount: number; created_at: string } | null>(null);
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [rentLimitOpen, setRentLimitOpen] = useState(false);

  const loadLastAllocation = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('agent_collections')
      .select('id, amount, created_at, notes')
      .eq('agent_id', user.id)
      .eq('tenant_id', tenantId)
      .ilike('notes', '%float allocation%')
      .order('created_at', { ascending: false })
      .limit(5);
    const reversible = (data || []).find((r: any) => !(r.notes || '').toLowerCase().includes('[reversed'));
    setLastAllocation(reversible ? { id: reversible.id, amount: Number(reversible.amount), created_at: reversible.created_at } : null);
  };

  const aiId = generateWelileAiId(tenantId);
  const navigate = useNavigate();

  useEffect(() => {
    loadFullProfile();
    refetchFloat();
    loadLastAllocation();
  }, [tenantId, user?.id]);

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
    const activeRequest = requests.find(r => ['approved', 'funded', 'disbursed', 'repaying'].includes(r.status || ''));
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

  /**
   * Auto-detect monthly rent when the profile field is empty.
   * Strategy: use the most recent rent_request.rent_amount as a strong signal —
   * it's the same number the agent already entered when issuing rent.
   * Falls back to the median across all requests if the latest one looks off.
   */
  const detectedMonthlyRent = useMemo<number | null>(() => {
    const amounts = requests
      .map(r => Number(r.rent_amount) || 0)
      .filter(a => a >= 10000);
    if (amounts.length === 0) return null;
    // Most recent first (requests are loaded ordered by created_at desc)
    return amounts[0] || null;
  }, [requests]);

  const effectiveMonthlyRent =
    profile?.monthly_rent && profile.monthly_rent > 0 ? profile.monthly_rent : detectedMonthlyRent;

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
  const activePct = summary.activeRequest && summary.activeRequest.total_repayment > 0
    ? Math.min(100, Math.round((summary.activeRequest.amount_repaid / summary.activeRequest.total_repayment) * 100))
    : 0;

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
        <p className="text-base text-muted-foreground text-center">Profile not found</p>
      </div>
    );
  }

  const phoneIntl = profile.phone.replace(/^0/, '256').replace(/[^0-9]/g, '');

  return (
    <div className="flex flex-col h-full bg-muted/20">
      {/* ── Sticky compact header (back + name + share/edit) ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/50 px-3 sm:px-4 py-2.5 flex items-center gap-2">
        <Button
          variant="ghost"
          onClick={onBack}
          className="h-11 px-3 rounded-xl shrink-0 gap-1.5 text-base font-semibold"
          aria-label="Back to tenants list"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden xs:inline sm:inline">Back</span>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-base sm:text-lg leading-tight truncate">{profile.full_name}</p>
          <p className="text-xs text-muted-foreground">Tenant Profile</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setEditDialogOpen(true)}
          className="h-11 w-11 rounded-xl shrink-0"
          aria-label="Edit tenant details"
          title="Edit tenant details"
        >
          <Pencil className="h-5 w-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleShareProfile}
          disabled={sharingProfile}
          className="h-11 w-11 rounded-xl shrink-0"
          aria-label="Share profile"
          title="Share profile"
        >
          {sharingProfile ? <Loader2 className="h-5 w-5 animate-spin" /> : <Share2 className="h-5 w-5" />}
        </Button>
      </div>

      <EditTenantDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        tenant={{
          id: profile.id,
          full_name: profile.full_name,
          phone: profile.phone,
          email: profile.email,
          national_id: profile.national_id,
        }}
        onSaved={(updated) => {
          setProfile(prev => prev ? { ...prev, ...updated } : prev);
        }}
      />

      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">

        {/* ── Hero: identity + AI ID + risk ── */}
        <section className="rounded-2xl bg-gradient-to-br from-primary/10 via-card to-card border border-primary/20 p-4 sm:p-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <UserAvatar avatarUrl={profile.avatar_url} fullName={profile.full_name} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold leading-tight truncate">{profile.full_name}</h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {profile.verified ? (
                  <Badge className="bg-success/15 text-success border-0 text-xs">✓ Verified</Badge>
                ) : (
                  <Badge className="bg-warning/15 text-warning border-0 text-xs">⏳ Unverified</Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  <Shield className={`h-3 w-3 mr-1 ${riskTier.color}`} />
                  <span className={riskTier.color}>{riskTier.label}</span>
                </Badge>
                {summary.totalRequests > 0 && (
                  <Badge variant="outline" className="text-xs">{summary.completionRate}% completion</Badge>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate(`/profile/${aiId}`)}
            className="mt-4 w-full text-left rounded-xl bg-background/70 border border-primary/20 hover:border-primary/40 active:scale-[0.99] transition-all p-3 sm:p-4 flex items-center justify-between gap-3"
            aria-label={`Open Welile AI ID ${aiId}`}
          >
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Welile AI ID</p>
              <p className="text-xl sm:text-2xl font-black font-mono tracking-wider text-primary truncate">{aiId}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); copyAiId(); }}
                className="h-11 w-11 rounded-xl bg-primary/10 hover:bg-primary/15 flex items-center justify-center active:scale-90 transition-transform"
                aria-label="Copy AI ID"
                title="Copy AI ID"
              >
                {copied ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Copy className="h-5 w-5 text-primary" />}
              </button>
              <span className="text-xs text-primary font-semibold pr-1 hidden sm:inline">View →</span>
            </div>
          </button>
        </section>

        {/* ── Rent Access Limit CTA (prominent, minimalist) ── */}
        <button
          type="button"
          onClick={() => setRentLimitOpen(true)}
          className="group relative w-full overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-background p-4 sm:p-5 text-left active:scale-[0.99] transition-all hover:border-primary/50 shadow-sm"
          aria-label="View tenant's Rent Access Limit"
        >
          <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-primary/15 blur-2xl pointer-events-none" />
          <div className="relative flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 rounded-xl bg-primary/15 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary/80">
                Powered by Welile
              </p>
              <p className="text-base sm:text-lg font-bold leading-tight text-foreground">
                Your Rent Access Limit
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Tap to see how much rent {profile.full_name.split(' ')[0]} can access today
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>

        {/* ── Rent Collection (consolidated; replaces both old collection cards) ── */}
        {summary.activeRequest && summary.currentOutstanding > 0 && (
          <SectionCard
            icon={Banknote}
            title="Rent Collection"
            tone="primary"
            badge={
              <Badge variant="destructive" className="text-sm font-mono">
                {formatUGX(summary.currentOutstanding)}
              </Badge>
            }
          >
            {/* Headline numbers */}
            <div className="grid grid-cols-2 gap-2.5">
              <Stat label="Outstanding" value={formatUGX(summary.currentOutstanding)} tone="destructive" />
              <Stat
                label="Your Ops Float"
                value={floatLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : formatUGX(agentFloatBalance)}
                tone="success"
              />
            </div>

            {/* Plan breakdown */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-muted/40 rounded-xl p-2.5">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Rent</p>
                <p className="text-sm font-bold font-mono mt-0.5">{formatUGX(summary.activeRequest.rent_amount)}</p>
              </div>
              <div className="bg-muted/40 rounded-xl p-2.5">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Total Due</p>
                <p className="text-sm font-bold font-mono mt-0.5">{formatUGX(summary.activeRequest.total_repayment)}</p>
              </div>
              <div className="bg-muted/40 rounded-xl p-2.5">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Repaid</p>
                <p className="text-sm font-bold font-mono text-success mt-0.5">{formatUGX(summary.activeRequest.amount_repaid)}</p>
              </div>
            </div>

            {/* Progress */}
            <div>
              <div className="flex justify-between text-xs sm:text-sm text-muted-foreground mb-1.5">
                <span>Repayment progress</span>
                <span className="font-bold text-foreground">{activePct}%</span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={activePct} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className={`h-full rounded-full transition-all ${activePct >= 100 ? 'bg-success' : activePct >= 50 ? 'bg-primary' : 'bg-destructive'}`}
                  style={{ width: `${activePct}%` }}
                />
              </div>
            </div>

            {/* Float warnings */}
            {!floatLoading && floatError && (
              <div className="flex items-center gap-2 bg-warning/10 border border-warning/30 rounded-xl p-3">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-warning font-semibold">Couldn't load your Operations Float.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchFloat()} className="shrink-0 text-xs h-9">
                  Retry
                </Button>
              </div>
            )}

            {!floatLoading && !floatError && agentFloatBalance < 500 && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-xl p-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                <p className="text-sm text-destructive font-semibold">Insufficient float. Top up your operations float to collect.</p>
              </div>
            )}

            {/* Pay from float */}
            <div className="rounded-xl border border-success/30 bg-success/5 p-3 sm:p-4 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <Wallet className="h-5 w-5 text-success mt-0.5 shrink-0" />
                <div>
                  <p className="text-base font-bold text-success">Pay from Your Float</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Deducts from <strong>your operations float</strong>. You earn <strong className="text-success">10% commission</strong> instantly.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setCollectDialogOpen(true)}
                className="w-full gap-2 text-base h-14 font-bold rounded-xl shadow-lg active:scale-[0.97] transition-transform"
                variant="success"
                size="xl"
                disabled={floatLoading || !!floatError || agentFloatBalance < 500}
              >
                {floatLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Banknote className="h-6 w-6" />}
                {floatLoading ? 'Loading float...' : `Pay ${formatUGX(Math.min(summary.currentOutstanding, agentFloatBalance))}`}
              </Button>
              {lastAllocation && (
                <Button
                  onClick={() => setReverseDialogOpen(true)}
                  variant="outline"
                  className="w-full gap-2 text-sm h-11 border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
                >
                  <Undo2 className="h-4 w-4" />
                  Reverse last — {formatUGX(lastAllocation.amount)}
                </Button>
              )}
            </div>

            {/* Auto-collect from tenant wallet */}
            {walletData && walletData.balance > 0 && (
              <div className="rounded-xl border border-border/50 bg-muted/30 p-3 sm:p-4 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <Bot className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-base font-bold">Auto-Collect from Tenant Wallet</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Pull <strong className="font-mono">{formatUGX(Math.min(walletData.balance, summary.currentOutstanding))}</strong> from tenant wallet
                      (<strong className="font-mono text-primary">{formatUGX(walletData.balance)}</strong> available). No cash needed.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleAutoCollectFromWallet}
                  disabled={autoCollecting}
                  variant="outline"
                  className="w-full gap-2 text-base h-12 rounded-xl border-primary/30 active:scale-[0.97] transition-transform"
                >
                  {autoCollecting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bot className="h-5 w-5 text-primary" />}
                  Auto-Collect {formatUGX(Math.min(walletData.balance, summary.currentOutstanding))}
                </Button>
              </div>
            )}
          </SectionCard>
        )}

        {/* ── Quick Actions ── */}
        <SectionCard icon={Zap} title="Quick Actions">
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant="outline"
              className="gap-2 text-sm h-auto py-3.5 flex-col items-center rounded-xl"
              onClick={() => setSubAgentDialogOpen(true)}
            >
              <UsersRound className="h-6 w-6 text-warning" />
              <span className="font-semibold">Make Sub-Agent</span>
            </Button>
            <Button
              variant="outline"
              className="gap-2 text-sm h-auto py-3.5 flex-col items-center rounded-xl"
              onClick={handleSendDashboardLink}
              disabled={sharingLink}
            >
              {sharingLink ? <Loader2 className="h-6 w-6 animate-spin" /> : <Smartphone className="h-6 w-6 text-primary" />}
              <span className="font-semibold">Dashboard Link</span>
            </Button>
          </div>
        </SectionCard>

        {/* ── Roles & Verification ── */}
        <SectionCard icon={UserCheck} title="Roles & Verification">
          <div className="flex flex-wrap gap-1.5">
            {userRoles.map(role => (
              <Badge key={role} variant="outline" className="capitalize text-sm py-1 px-2.5">{role}</Badge>
            ))}
            {userRoles.length === 0 && <Badge variant="outline" className="capitalize text-sm py-1 px-2.5">Tenant</Badge>}
            {profile.national_id && <Badge className="bg-primary/10 text-primary border-0 text-sm py-1 px-2.5">ID on file</Badge>}
          </div>

          {availableRolesToAdd.length > 0 && (
            <div className="pt-3 border-t border-border/40">
              <p className="text-sm text-muted-foreground mb-2.5 font-medium">Add another role:</p>
              <div className="flex flex-wrap gap-2">
                {availableRolesToAdd.map(role => (
                  <Button
                    key={role}
                    variant="outline"
                    size="sm"
                    className="capitalize gap-1.5 text-sm h-10"
                    onClick={() => handleAddRole(role)}
                    disabled={addingRole}
                  >
                    {addingRole ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                    + {role}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            Joined {format(new Date(profile.created_at), 'dd MMM yyyy')}
          </p>
        </SectionCard>

        {/* ── Earning Rating ── */}
        <SectionCard icon={Star} title="Earning Rating">
          <div className="flex items-center gap-3">
            <div className="flex gap-0.5" aria-label={`${earningRating.stars} of 5 stars`}>
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} className={`h-6 w-6 ${i <= earningRating.stars ? 'text-warning fill-warning' : 'text-muted-foreground/30'}`} />
              ))}
            </div>
            <span className="text-base sm:text-lg font-bold">{earningRating.label}</span>
          </div>
          {partnershipAmount > 0 && (
            <p className="text-sm sm:text-base text-muted-foreground">
              Partnership investment: <span className="font-bold text-primary font-mono">{formatUGX(partnershipAmount)}</span>
            </p>
          )}
        </SectionCard>

        {/* ── Contact Details ── */}
        <SectionCard icon={Phone} title="Contact Details">
          <div className="space-y-3">
            {/* Phone */}
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Phone className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                  Phone
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-success bg-success/10 rounded-full px-1.5 py-0.5">
                    <MessageCircle className="h-2.5 w-2.5" /> WhatsApp
                  </span>
                </p>
                <a href={`tel:${profile.phone}`} className="text-base sm:text-lg font-semibold text-primary break-all">{profile.phone}</a>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={`https://wa.me/${phoneIntl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-11 w-11 rounded-xl bg-success/15 flex items-center justify-center active:scale-90 transition-transform"
                  style={{ touchAction: 'manipulation' }}
                  aria-label="Open WhatsApp chat"
                >
                  <MessageCircle className="h-5 w-5 text-success" />
                </a>
                <button
                  onClick={() => {
                    const msg = encodeURIComponent(
                      `Hi ${profile.full_name}, this is your Welile agent. Please update your phone number in the Welile app. Go to Settings > Profile to make changes. Thank you!`
                    );
                    window.open(`https://wa.me/${phoneIntl}?text=${msg}`, '_blank');
                  }}
                  className="h-11 w-11 rounded-xl bg-warning/15 flex items-center justify-center active:scale-90 transition-transform"
                  style={{ touchAction: 'manipulation' }}
                  aria-label="Request phone edit"
                  title="Request phone edit"
                >
                  <Pencil className="h-5 w-5 text-warning" />
                </button>
              </div>
            </div>

            {/* Email */}
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Mail className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Email</p>
                <p className="text-base font-semibold truncate">{profile.email || 'Not set'}</p>
              </div>
              <button
                onClick={() => {
                  const msg = encodeURIComponent(
                    `Hi ${profile.full_name}, this is your Welile agent. Please update your email address in the Welile app. Go to Settings > Profile to make changes. Thank you!`
                  );
                  window.open(`https://wa.me/${phoneIntl}?text=${msg}`, '_blank');
                }}
                className="h-11 w-11 rounded-xl bg-warning/15 flex items-center justify-center active:scale-90 transition-transform shrink-0"
                style={{ touchAction: 'manipulation' }}
                aria-label="Request email edit"
                title="Request email edit"
              >
                <Pencil className="h-5 w-5 text-warning" />
              </button>
            </div>

            {profile.national_id && (
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">National ID</p>
                  <p className="text-base font-semibold font-mono break-all">{profile.national_id}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Calendar className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Member Since</p>
                <p className="text-base font-semibold">{format(new Date(profile.created_at), 'dd MMM yyyy')}</p>
              </div>
            </div>
          </div>

          {/* GPS */}
          <div className="pt-3 border-t border-border/40 space-y-2">
            <Button
              variant="outline"
              size="lg"
              className="w-full gap-2 text-base h-12 rounded-xl"
              onClick={handleCaptureGPS}
              disabled={gpsLoading}
            >
              {gpsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
              Capture GPS Location
            </Button>
            {gpsLocation && (
              <div className="bg-muted/40 rounded-xl p-3 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-success shrink-0" />
                <div className="text-sm sm:text-base">
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
              <p className="text-sm text-destructive">{gpsError}</p>
            )}
          </div>
        </SectionCard>

        {/* ── Wallet Usage ── */}
        {walletData && (
          <SectionCard icon={Wallet} title="Wallet Usage">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Balance" value={formatUGX(walletData.balance)} tone="primary" />
              <Stat label="Total In" value={formatUGX(walletData.total_in)} tone="success" />
              <Stat label="Total Out" value={formatUGX(walletData.total_out)} tone="destructive" />
            </div>
          </SectionCard>
        )}

        {/* ── Current Property ── */}
        {summary.latestLandlord && (
          <SectionCard icon={Home} title="Current Property">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-muted/40 rounded-xl p-3 flex items-start gap-2.5">
                <User className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Landlord</p>
                  <p className="text-base font-bold truncate">{summary.latestLandlord}</p>
                </div>
              </div>
              <div className="bg-muted/40 rounded-xl p-3 flex items-start gap-2.5">
                <Home className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">House Type</p>
                  <p className="text-base font-bold truncate">{summary.latestHouseType || 'N/A'}</p>
                </div>
              </div>
              {summary.latestAddress && (
                <div className="bg-muted/40 rounded-xl p-3 flex items-start gap-2.5 sm:col-span-2">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium">Address</p>
                    <p className="text-base font-bold">{summary.latestAddress}</p>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* ── Rent Payment Behavior ── */}
        <SectionCard icon={TrendingUp} title="Rent Payment Behavior">
          <div className="grid grid-cols-2 gap-2.5">
            <Stat label="Rent Plans" value={summary.totalRequests} />
            <Stat
              label="Completion"
              value={`${summary.completionRate}%`}
              tone={summary.completionRate >= 80 ? 'success' : summary.completionRate >= 50 ? 'primary' : 'destructive'}
            />
            <Stat label="Total Repaid" value={formatUGX(summary.totalRepaid)} tone="success" />
            <Stat
              label="Total Owing"
              value={summary.totalOwing > 0 ? formatUGX(summary.totalOwing) : 'Clear ✓'}
              tone={summary.totalOwing > 0 ? 'destructive' : 'success'}
            />
          </div>

          {summary.totalFunded > 0 && (
            <div>
              <div className="flex justify-between text-xs sm:text-sm text-muted-foreground mb-1.5">
                <span>Overall repayment</span>
                <span className="font-bold text-foreground">{progressPct}%</span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className={`h-full rounded-full transition-all ${progressPct >= 100 ? 'bg-success' : progressPct >= 50 ? 'bg-primary' : 'bg-destructive'}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </SectionCard>

        {/* ── Rent Plan History ── */}
        {requests.length > 0 && (
          <SectionCard
            icon={Home}
            title="Rent Plan History"
            badge={<Badge variant="outline" className="text-xs">{requests.length}</Badge>}
          >
            <div className="space-y-2">
              {visibleRequests.map(req => {
                const owing = Math.max(0, req.total_repayment - req.amount_repaid);
                const pct = req.total_repayment > 0 ? Math.round((req.amount_repaid / req.total_repayment) * 100) : 0;
                return (
                  <div key={req.id} className="bg-muted/40 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm sm:text-base font-semibold">{format(new Date(req.created_at), 'dd MMM yyyy')}</span>
                      <Badge variant="outline" className="text-xs capitalize">{req.status}</Badge>
                    </div>
                    <div className="flex justify-between text-xs sm:text-sm text-muted-foreground gap-2 flex-wrap">
                      <span>Rent: <span className="font-bold text-foreground font-mono">{formatUGX(req.rent_amount)}</span></span>
                      <span>Owing: <span className={`font-bold font-mono ${owing > 0 ? 'text-destructive' : 'text-success'}`}>{owing > 0 ? formatUGX(owing) : 'Cleared'}</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 100 ? 'bg-success' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                    </div>
                    {req.landlord?.name && (
                      <p className="text-xs sm:text-sm text-muted-foreground">📍 {req.landlord.name} — {req.landlord.property_address || 'N/A'}</p>
                    )}
                  </div>
                );
              })}
            </div>
            {requests.length > PAGE_SIZE && (
              <Button variant="ghost" className="w-full text-sm gap-1 h-11" onClick={() => setShowAllRequests(!showAllRequests)}>
                {showAllRequests ? <><ChevronUp className="h-4 w-4" /> Show Less</> : <><ChevronDown className="h-4 w-4" /> Show All ({requests.length})</>}
              </Button>
            )}
          </SectionCard>
        )}

        {/* ── Repayment History ── */}
        {repayments.length > 0 && (
          <SectionCard
            icon={History}
            title="Repayment History"
            badge={<Badge variant="outline" className="text-xs">{repayments.length}</Badge>}
          >
            <div className="space-y-1.5">
              {visibleRepayments.map(r => (
                <div key={r.id} className="flex items-center justify-between py-2.5 px-3 bg-muted/40 rounded-xl gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-semibold font-mono text-success">{formatUGX(r.amount)}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">{format(new Date(r.created_at), 'dd MMM yyyy, HH:mm')}</p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-success/70 shrink-0" />
                </div>
              ))}
            </div>
            {repayments.length > PAGE_SIZE && (
              <Button variant="ghost" className="w-full text-sm gap-1 h-11" onClick={() => setShowAllRepayments(!showAllRepayments)}>
                {showAllRepayments ? <><ChevronUp className="h-4 w-4" /> Show Less</> : <><ChevronDown className="h-4 w-4" /> Show All ({repayments.length})</>}
              </Button>
            )}
          </SectionCard>
        )}

        {/* ── Monthly Rent ── */}
        {profile.monthly_rent && profile.monthly_rent > 0 && (
          <SectionCard icon={Banknote} title="Monthly Rent">
            <p className="text-2xl sm:text-3xl font-black font-mono text-primary">{formatUGX(profile.monthly_rent)}</p>
          </SectionCard>
        )}

        {/* Spacer so sticky bottom toolbar doesn't cover the last card on mobile */}
        <div className="h-24 sm:h-4" />
      </div>

      {/* ── Mobile-only swipeable bottom-sheet quick actions ── */}
      <TenantQuickActionsSheet
        tenantName={profile.full_name}
        phone={profile.phone}
        phoneIntl={phoneIntl}
        onCollect={() => setCollectDialogOpen(true)}
        onShare={handleShareProfile}
        collectDisabled={
          !summary.activeRequest ||
          summary.currentOutstanding <= 0 ||
          floatLoading ||
          !!floatError ||
          agentFloatBalance < 500
        }
        shareLoading={sharingProfile}
      />

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
            loadLastAllocation();
          }}
        />
      )}

      <ReverseAllocationDialog
        open={reverseDialogOpen}
        onOpenChange={setReverseDialogOpen}
        collectionId={lastAllocation?.id || null}
        amount={lastAllocation?.amount || 0}
        tenantName={profile?.full_name}
        onReversed={() => {
          loadFullProfile();
          refetchFloat();
          loadLastAllocation();
        }}
      />

      <RegisterSubAgentDialog
        open={subAgentDialogOpen}
        onOpenChange={setSubAgentDialogOpen}
        onSuccess={loadFullProfile}
      />

      {/* Rent Access Limit — opens minimalist sheet with full card */}
      <Sheet open={rentLimitOpen} onOpenChange={setRentLimitOpen}>
        <SheetContent
          side="bottom"
          className="h-[88vh] rounded-t-3xl flex flex-col p-0 gap-0 overflow-hidden"
        >
          <SheetHeader className="px-4 sm:px-5 pt-5 pb-3 text-left">
            <SheetTitle className="text-lg font-bold">Rent Access Limit</SheetTitle>
            <SheetDescription className="text-xs">
              {profile.full_name}'s live limit — recalculated daily from repayments.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-3 sm:px-4 pb-6">
            <RentAccessLimitCard
              tenantId={profile.id}
              tenantName={profile.full_name}
              tenantPhone={profile.phone}
              monthlyRent={effectiveMonthlyRent}
              detectedFromHistory={
                (!profile.monthly_rent || profile.monthly_rent <= 0) && !!detectedMonthlyRent
              }
              suggestedRent={detectedMonthlyRent}
              onRentSaved={(rent) => {
                setProfile(prev => (prev ? { ...prev, monthly_rent: rent } : prev));
              }}
              repayments={repayments.map(r => ({ amount: r.amount, created_at: r.created_at }))}
              aiId={aiId}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

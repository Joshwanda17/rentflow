import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { generateWelileAiId, getRiskTierLabel } from '@/lib/welileAiId';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, ArrowLeft, Phone, Mail, MapPin, Home, User, Shield, Calendar,
  CreditCard, TrendingUp, Copy, CheckCircle2, Wallet, Banknote, History,
  UserCheck, Star, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  role: string | null;
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
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [requests, setRequests] = useState<RentRequestRow[]>([]);
  const [repayments, setRepayments] = useState<RepaymentRow[]>([]);
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [partnershipAmount, setPartnershipAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showAllRepayments, setShowAllRepayments] = useState(false);
  const [showAllRequests, setShowAllRequests] = useState(false);
  const [payingRent, setPayingRent] = useState(false);

  const aiId = generateWelileAiId(tenantId);

  useEffect(() => {
    loadFullProfile();
  }, [tenantId]);

  const loadFullProfile = async () => {
    setLoading(true);
    try {
      const [profileRes, rentRes, repaymentRes, walletRes, portfolioRes, ledgerRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, phone, email, created_at, monthly_rent, verified, national_id, role')
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
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data as TenantProfile);
        // Derive roles from profile role field
        const detectedRoles: string[] = [];
        if (profileRes.data.role) detectedRoles.push(profileRes.data.role);
        setRoles(detectedRoles);
      }

      setRequests((rentRes.data as unknown as RentRequestRow[]) || []);
      setRepayments((repaymentRes.data as RepaymentRow[]) || []);

      // Wallet summary
      const ledgerEntries = (ledgerRes.data || []) as any[];
      const totalIn = ledgerEntries.filter(e => e.direction === 'cash_in').reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const totalOut = ledgerEntries.filter(e => e.direction === 'cash_out').reduce((s: number, e: any) => s + (e.amount || 0), 0);
      setWalletData({
        balance: walletRes.data?.balance ?? 0,
        total_in: totalIn,
        total_out: totalOut,
      });

      // Partnership amount
      const pAmount = (portfolioRes.data || []).reduce((s: number, p: any) => s + (p.investment_amount || 0), 0);
      setPartnershipAmount(pAmount);
    } catch (err) {
      console.error('Failed to load tenant profile:', err);
    } finally {
      setLoading(false);
    }
  };

  // Computed summaries
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

  // Earning rating based on completion & repayment consistency
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

  const handlePayRent = async () => {
    if (!summary.activeRequest || !user) return;
    setPayingRent(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Session expired', description: 'Please log in again', variant: 'destructive' });
        return;
      }

      const { data, error } = await supabase.functions.invoke('tenant-pay-rent', {
        body: { amount: summary.currentOutstanding },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: '✅ Rent payment processed', description: `${formatUGX(data.amount_paid)} paid successfully` });
      loadFullProfile();
    } catch (err: any) {
      toast({ title: 'Payment failed', description: err.message || 'Try again', variant: 'destructive' });
    } finally {
      setPayingRent(false);
    }
  };

  const progressPct = summary.totalFunded > 0 ? Math.min(100, Math.round((summary.totalRepaid / summary.totalFunded) * 100)) : 0;

  const visibleRepayments = showAllRepayments ? repayments : repayments.slice(0, PAGE_SIZE);
  const visibleRequests = showAllRequests ? requests : requests.slice(0, PAGE_SIZE);

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
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <p className="text-sm text-muted-foreground text-center">Profile not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 rounded-xl shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm truncate">{profile.full_name}</p>
          <p className="text-xs text-muted-foreground">Tenant Profile</p>
        </div>
        {profile.verified && (
          <Badge className="bg-success/15 text-success border-0 text-[10px]">Verified ✓</Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* AI ID Card */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-4 border border-primary/20">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Welile AI ID</p>
          <div className="flex items-center gap-3">
            <p className="text-2xl font-black font-mono tracking-wider text-primary">{aiId}</p>
            <button onClick={copyAiId} className="p-2 rounded-lg bg-primary/10 active:scale-90 transition-transform">
              {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-primary" />}
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={`text-xs font-semibold ${riskTier.color}`}>{riskTier.label}</span>
            {summary.totalRequests > 0 && (
              <span className="text-[10px] text-muted-foreground ml-1">• {summary.completionRate}% completion rate</span>
            )}
          </div>
        </div>

        {/* Roles & Verification */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5" /> Roles & Verification
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {profile.role && (
              <Badge variant="outline" className="capitalize text-[10px]">{profile.role}</Badge>
            )}
            {profile.verified && <Badge className="bg-success/15 text-success border-0 text-[10px]">✓ Verified</Badge>}
            {profile.national_id && <Badge className="bg-primary/10 text-primary border-0 text-[10px]">ID on file</Badge>}
            {!profile.verified && <Badge className="bg-warning/15 text-warning border-0 text-[10px]">⏳ Unverified</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">
            Joined {format(new Date(profile.created_at), 'dd MMM yyyy')}
          </div>
        </div>

        {/* Earning Rating */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5" /> Earning Rating
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} className={`h-4 w-4 ${i <= earningRating.stars ? 'text-warning fill-warning' : 'text-muted-foreground/30'}`} />
              ))}
            </div>
            <span className="text-sm font-semibold">{earningRating.label}</span>
          </div>
          {partnershipAmount > 0 && (
            <p className="text-xs text-muted-foreground">
              Partnership investment: <span className="font-bold text-primary font-mono">{formatUGX(partnershipAmount)}</span>
            </p>
          )}
        </div>

        {/* Contact Details */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contact Details</h3>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0"><Phone className="h-3.5 w-3.5 text-muted-foreground" /></div>
              <div>
                <p className="text-[10px] text-muted-foreground">Phone</p>
                <a href={`tel:${profile.phone}`} className="text-sm font-semibold text-primary">{profile.phone}</a>
              </div>
            </div>
            {profile.email && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0"><Mail className="h-3.5 w-3.5 text-muted-foreground" /></div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Email</p>
                  <p className="text-sm font-semibold truncate">{profile.email}</p>
                </div>
              </div>
            )}
            {profile.national_id && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0"><CreditCard className="h-3.5 w-3.5 text-muted-foreground" /></div>
                <div>
                  <p className="text-[10px] text-muted-foreground">National ID</p>
                  <p className="text-sm font-semibold font-mono">{profile.national_id}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /></div>
              <div>
                <p className="text-[10px] text-muted-foreground">Member Since</p>
                <p className="text-sm font-semibold">{format(new Date(profile.created_at), 'dd MMM yyyy')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Wallet Usage Behavior */}
        {walletData && (
          <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> Wallet Usage
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground">Balance</p>
                <p className="text-sm font-bold font-mono text-primary">{formatUGX(walletData.balance)}</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground">Total In</p>
                <p className="text-sm font-bold font-mono text-success">{formatUGX(walletData.total_in)}</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground">Total Out</p>
                <p className="text-sm font-bold font-mono text-destructive">{formatUGX(walletData.total_out)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Current Property */}
        {summary.latestLandlord && (
          <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Current Property</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/30 rounded-xl p-3 flex items-start gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground">Landlord</p>
                  <p className="text-xs font-bold truncate">{summary.latestLandlord}</p>
                </div>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 flex items-start gap-2">
                <Home className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground">House Type</p>
                  <p className="text-xs font-bold truncate">{summary.latestHouseType || 'N/A'}</p>
                </div>
              </div>
              {summary.latestAddress && (
                <div className="bg-muted/30 rounded-xl p-3 flex items-start gap-2 col-span-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">Address</p>
                    <p className="text-xs font-bold">{summary.latestAddress}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Outstanding Balance + Pay Rent Button */}
        {summary.activeRequest && (
          <div className="rounded-2xl border-2 border-destructive/30 bg-destructive/[0.04] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Outstanding Balance
              </h3>
              <Badge variant="destructive" className="text-xs font-mono">
                {formatUGX(summary.currentOutstanding)}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div>
                <p className="text-muted-foreground">Rent Amount</p>
                <p className="font-bold font-mono text-xs">{formatUGX(summary.activeRequest.rent_amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Due</p>
                <p className="font-bold font-mono text-xs">{formatUGX(summary.activeRequest.total_repayment)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Repaid</p>
                <p className="font-bold font-mono text-xs text-success">{formatUGX(summary.activeRequest.amount_repaid)}</p>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
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
              onClick={handlePayRent}
              disabled={payingRent || summary.currentOutstanding <= 0}
              className="w-full gap-2"
              size="lg"
            >
              {payingRent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
              Pay Rent — {formatUGX(summary.currentOutstanding)}
            </Button>
          </div>
        )}

        {/* Repayment Behavior Summary */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Rent Payment Behavior
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Rent Plans</p>
              <p className="text-lg font-black font-mono">{summary.totalRequests}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Completion Rate</p>
              <p className={`text-lg font-black font-mono ${summary.completionRate >= 80 ? 'text-success' : summary.completionRate >= 50 ? 'text-primary' : 'text-destructive'}`}>
                {summary.completionRate}%
              </p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Total Repaid</p>
              <p className="text-sm font-bold text-success font-mono">{formatUGX(summary.totalRepaid)}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Total Owing</p>
              <p className={`text-sm font-bold font-mono ${summary.totalOwing > 0 ? 'text-destructive' : 'text-success'}`}>
                {summary.totalOwing > 0 ? formatUGX(summary.totalOwing) : 'Clear ✓'}
              </p>
            </div>
          </div>

          {summary.totalFunded > 0 && (
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
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
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Home className="h-3.5 w-3.5" /> Rent Plan History ({requests.length})
            </h3>
            <div className="space-y-2">
              {visibleRequests.map(req => {
                const owing = Math.max(0, req.total_repayment - req.amount_repaid);
                const pct = req.total_repayment > 0 ? Math.round((req.amount_repaid / req.total_repayment) * 100) : 0;
                return (
                  <div key={req.id} className="bg-muted/30 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{format(new Date(req.created_at), 'dd MMM yyyy')}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{req.status}</Badge>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Rent: <span className="font-bold text-foreground font-mono">{formatUGX(req.rent_amount)}</span></span>
                      <span>Owing: <span className={`font-bold font-mono ${owing > 0 ? 'text-destructive' : 'text-success'}`}>{owing > 0 ? formatUGX(owing) : 'Cleared'}</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 100 ? 'bg-success' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                    </div>
                    {req.landlord?.name && (
                      <p className="text-[10px] text-muted-foreground">📍 {req.landlord.name} — {req.landlord.property_address || 'N/A'}</p>
                    )}
                  </div>
                );
              })}
            </div>
            {requests.length > PAGE_SIZE && (
              <Button variant="ghost" size="sm" className="w-full text-xs gap-1" onClick={() => setShowAllRequests(!showAllRequests)}>
                {showAllRequests ? <><ChevronUp className="h-3 w-3" /> Show Less</> : <><ChevronDown className="h-3 w-3" /> Show All ({requests.length})</>}
              </Button>
            )}
          </div>
        )}

        {/* Repayment History */}
        {repayments.length > 0 && (
          <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Repayment History ({repayments.length})
            </h3>
            <div className="space-y-1.5">
              {visibleRepayments.map(r => (
                <div key={r.id} className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-xl">
                  <div>
                    <p className="text-xs font-semibold font-mono text-success">{formatUGX(r.amount)}</p>
                    <p className="text-[10px] text-muted-foreground">{format(new Date(r.created_at), 'dd MMM yyyy, HH:mm')}</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-success/60" />
                </div>
              ))}
            </div>
            {repayments.length > PAGE_SIZE && (
              <Button variant="ghost" size="sm" className="w-full text-xs gap-1" onClick={() => setShowAllRepayments(!showAllRepayments)}>
                {showAllRepayments ? <><ChevronUp className="h-3 w-3" /> Show Less</> : <><ChevronDown className="h-3 w-3" /> Show All ({repayments.length})</>}
              </Button>
            )}
          </div>
        )}

        {/* Monthly Rent */}
        {profile.monthly_rent && profile.monthly_rent > 0 && (
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <p className="text-[10px] text-muted-foreground">Monthly Rent</p>
            <p className="text-xl font-black font-mono text-primary">{formatUGX(profile.monthly_rent)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

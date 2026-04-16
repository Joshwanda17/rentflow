import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { generateWelileAiId, getRiskTierLabel } from '@/lib/welileAiId';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Phone, Mail, MapPin, Home, User, Shield, Calendar, CreditCard, TrendingUp, Copy, CheckCircle2 } from 'lucide-react';
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
}

interface RentSummary {
  totalRequests: number;
  totalFunded: number;
  totalRepaid: number;
  totalOwing: number;
  onTimeRate: number;
  latestLandlord: string | null;
  latestAddress: string | null;
  latestHouseType: string | null;
  latestStatus: string | null;
}

export function TenantProfileView({ tenantId, onBack }: TenantProfileViewProps) {
  const { toast } = useToast();
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [summary, setSummary] = useState<RentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const aiId = generateWelileAiId(tenantId);

  useEffect(() => {
    loadProfile();
  }, [tenantId]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const [profileRes, rentRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, phone, email, created_at, monthly_rent, verified, national_id, location')
          .eq('id', tenantId)
          .single(),
        supabase
          .from('rent_requests')
          .select('id, rent_amount, total_repayment, amount_repaid, status, landlord:landlords(name, property_address, house_category)')
          .eq('tenant_id', tenantId)
          .in('status', ['pending', 'approved', 'funded', 'disbursed', 'repaying', 'completed'])
          .order('created_at', { ascending: false })
      ]);

      if (profileRes.data) setProfile(profileRes.data as TenantProfile);

      const requests = (rentRes.data || []) as any[];
      const totalFunded = requests.reduce((s, r) => s + (r.total_repayment || 0), 0);
      const totalRepaid = requests.reduce((s, r) => s + (r.amount_repaid || 0), 0);
      const completedCount = requests.filter(r => r.status === 'completed').length;
      const latest = requests[0];

      setSummary({
        totalRequests: requests.length,
        totalFunded,
        totalRepaid,
        totalOwing: Math.max(0, totalFunded - totalRepaid),
        onTimeRate: requests.length > 0 ? Math.round((completedCount / requests.length) * 100) : 0,
        latestLandlord: latest?.landlord?.name || null,
        latestAddress: latest?.landlord?.property_address || null,
        latestHouseType: latest?.landlord?.house_category || null,
        latestStatus: latest?.status || null,
      });
    } catch (err) {
      console.error('Failed to load tenant profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyAiId = () => {
    navigator.clipboard.writeText(aiId);
    setCopied(true);
    toast({ title: 'AI ID copied' });
    setTimeout(() => setCopied(false), 2000);
  };

  const riskLevel = summary
    ? summary.onTimeRate >= 80 ? 'good' : summary.onTimeRate >= 50 ? 'standard' : summary.totalRequests === 0 ? 'new' : 'caution'
    : 'new';
  const riskTier = getRiskTierLabel(riskLevel);

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

  const progressPct = summary && summary.totalFunded > 0
    ? Math.min(100, Math.round((summary.totalRepaid / summary.totalFunded) * 100))
    : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Sticky back button */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 rounded-xl shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">{profile.full_name}</p>
          <p className="text-xs text-muted-foreground">Tenant Profile</p>
        </div>
        {profile.verified && (
          <Badge className="ml-auto bg-success/15 text-success border-0 text-[10px]">Verified ✓</Badge>
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
            {summary && summary.totalRequests > 0 && (
              <span className="text-[10px] text-muted-foreground ml-1">
                • {summary.onTimeRate}% completion rate
              </span>
            )}
          </div>
        </div>

        {/* Contact Info */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contact Details</h3>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Phone</p>
                <a href={`tel:${profile.phone}`} className="text-sm font-semibold text-primary">{profile.phone}</a>
              </div>
            </div>
            {profile.email && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Email</p>
                  <p className="text-sm font-semibold truncate">{profile.email}</p>
                </div>
              </div>
            )}
            {profile.national_id && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">National ID</p>
                  <p className="text-sm font-semibold font-mono">{profile.national_id}</p>
                </div>
              </div>
            )}
            {profile.location && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Location</p>
                  <p className="text-sm font-semibold">{profile.location}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Member Since</p>
                <p className="text-sm font-semibold">{format(new Date(profile.created_at), 'dd MMM yyyy')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Property Info */}
        {summary && summary.latestLandlord && (
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

        {/* Financial Summary */}
        {summary && (
          <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Repayment Behavior</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground">Rent Plans</p>
                <p className="text-lg font-black font-mono">{summary.totalRequests}</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground">Completion Rate</p>
                <p className={`text-lg font-black font-mono ${summary.onTimeRate >= 80 ? 'text-success' : summary.onTimeRate >= 50 ? 'text-primary' : 'text-destructive'}`}>
                  {summary.onTimeRate}%
                </p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground">Total Repaid</p>
                <p className="text-sm font-bold text-success font-mono">{formatUGX(summary.totalRepaid)}</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground">Outstanding</p>
                <p className={`text-sm font-bold font-mono ${summary.totalOwing > 0 ? 'text-destructive' : 'text-success'}`}>
                  {summary.totalOwing > 0 ? formatUGX(summary.totalOwing) : 'Clear ✓'}
                </p>
              </div>
            </div>

            {/* Progress */}
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

            {summary.latestStatus && (
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Latest plan status:</span>
                <Badge variant="outline" className="text-[10px] capitalize">{summary.latestStatus}</Badge>
              </div>
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

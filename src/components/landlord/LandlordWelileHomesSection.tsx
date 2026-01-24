import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Home, 
  Users, 
  TrendingUp, 
  Sparkles,
  ChevronRight,
  Loader2,
  Heart,
  UserPlus
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EnrollTenantWelileHomesDialog } from './EnrollTenantWelileHomesDialog';

interface TenantWithSavings {
  tenant_id: string;
  tenant_name: string;
  subscription_id: string;
  monthly_rent: number;
  total_savings: number;
  months_enrolled: number;
  subscription_status: string;
  landlord_registered: boolean;
}

const MONTHLY_GROWTH_RATE = 0.05;
const LANDLORD_FEE_RATE = 0.10;

// Calculate projected savings at 5 years
function calculate5YearProjection(monthlyRent: number): number {
  let balance = 0;
  const monthlyContribution = monthlyRent * LANDLORD_FEE_RATE;
  for (let i = 0; i < 60; i++) {
    balance = (balance * (1 + MONTHLY_GROWTH_RATE)) + monthlyContribution;
  }
  return Math.round(balance);
}

export function LandlordWelileHomesSection({ userId }: { userId: string }) {
  const navigate = useNavigate();

  // Fetch tenants linked to this landlord with Welile Homes subscriptions
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['landlord-welile-homes-tenants', userId],
    queryFn: async () => {
      // First, get all tenants linked to this landlord via rent_requests
      const { data: rentRequests, error: rrError } = await supabase
        .from('rent_requests')
        .select('tenant_id')
        .eq('landlord_id', userId);

      if (rrError) throw rrError;
      if (!rentRequests || rentRequests.length === 0) return [];

      // Get unique tenant IDs
      const tenantIds = [...new Set(rentRequests.map((rr) => rr.tenant_id))];

      // Fetch Welile Homes subscriptions for these tenants
      const { data: subscriptions, error: subError } = await supabase
        .from('welile_homes_subscriptions')
        .select('*')
        .in('tenant_id', tenantIds);

      if (subError) throw subError;
      if (!subscriptions || subscriptions.length === 0) return [];

      // Fetch tenant profiles
      const subscribedTenantIds = subscriptions.map((s) => s.tenant_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', subscribedTenantIds);

      return subscriptions.map((sub) => ({
        tenant_id: sub.tenant_id,
        tenant_name: profiles?.find((p) => p.id === sub.tenant_id)?.full_name || 'Unknown',
        subscription_id: sub.id,
        monthly_rent: sub.monthly_rent,
        total_savings: sub.total_savings,
        months_enrolled: sub.months_enrolled,
        subscription_status: sub.subscription_status,
        landlord_registered: sub.landlord_registered,
      })) as TenantWithSavings[];
    },
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <Card className="border-purple-200">
        <CardContent className="p-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
        </CardContent>
      </Card>
    );
  }

  if (tenants.length === 0) {
    return (
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
        <CardContent className="p-5 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center mx-auto">
            <Home className="h-7 w-7 text-purple-600" />
          </div>
          <h3 className="font-bold text-lg">Welile Homes</h3>
          <p className="text-sm text-muted-foreground">
            Enroll your tenants in Welile Homes to help them build savings towards homeownership.
          </p>
          <EnrollTenantWelileHomesDialog 
            trigger={
              <Button className="gap-2 bg-purple-600 hover:bg-purple-700">
                <UserPlus className="h-4 w-4" />
                Enroll a Tenant
              </Button>
            }
          />
          <div className="p-3 bg-purple-50 rounded-lg text-left">
            <p className="text-xs text-purple-700">
              <strong>How it works:</strong> When tenants pay rent through Welile Wallet, 
              10% of your platform fee goes into their home savings fund, growing at 5% monthly.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate totals
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter((t) => t.subscription_status === 'active').length;
  const totalSavingsGenerated = tenants.reduce((sum, t) => sum + t.total_savings, 0);
  const totalContributed = tenants.reduce((sum, t) => sum + (t.monthly_rent * LANDLORD_FEE_RATE * t.months_enrolled), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card className="border-purple-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 p-4 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Home className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold">Welile Homes Impact</h3>
                <p className="text-sm text-purple-200">Your tenants' savings journey</p>
              </div>
            </div>
            <Badge className="bg-white/20 text-white border-0">
              {totalTenants} {totalTenants === 1 ? 'Tenant' : 'Tenants'}
            </Badge>
          </div>
          <EnrollTenantWelileHomesDialog 
            trigger={
              <Button size="sm" variant="secondary" className="gap-2 bg-white/20 hover:bg-white/30 text-white border-0">
                <UserPlus className="h-4 w-4" />
                Enroll Another Tenant
              </Button>
            }
          />
        </div>

        <CardContent className="p-4 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-medium text-emerald-600">Total Savings</span>
              </div>
              <p className="text-lg font-bold text-emerald-700">{formatUGX(totalSavingsGenerated)}</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
              <div className="flex items-center gap-2 mb-1">
                <Heart className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-medium text-purple-600">You've Helped</span>
              </div>
              <p className="text-lg font-bold text-purple-700">{activeTenants} {activeTenants === 1 ? 'Tenant' : 'Tenants'}</p>
            </div>
          </div>

          {/* Tenant List */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />
              Enrolled Tenants
            </h4>
            
            {tenants.slice(0, 3).map((tenant, index) => {
              const projection = calculate5YearProjection(tenant.monthly_rent);
              const progressPercent = Math.min((tenant.total_savings / projection) * 100, 100);

              return (
                <motion.div
                  key={tenant.subscription_id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{tenant.tenant_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {tenant.months_enrolled} months enrolled
                      </p>
                    </div>
                    <Badge 
                      variant={tenant.subscription_status === 'active' ? 'default' : 'secondary'}
                      className={tenant.subscription_status === 'active' ? 'bg-emerald-100 text-emerald-700' : ''}
                    >
                      {tenant.subscription_status}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Savings Progress</span>
                      <span className="font-medium">{formatUGX(tenant.total_savings)}</span>
                    </div>
                    <Progress value={progressPercent} className="h-1.5" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>5-Year Goal: {formatUGX(projection)}</span>
                      <span className="text-emerald-600">+5%/mo</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {tenants.length > 3 && (
              <Button
                variant="ghost"
                className="w-full text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                onClick={() => navigate('/landlord-welile-homes')}
              >
                View All {tenants.length} Tenants
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>

          {/* Impact Message */}
          <div className="p-3 bg-gradient-to-br from-purple-50 to-amber-50 rounded-lg border border-purple-100">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-purple-700">
                <strong>Your impact:</strong> By receiving rent through Welile, you're helping 
                {totalTenants > 1 ? ` ${totalTenants} tenants` : ' your tenant'} build towards 
                homeownership. Together, they've saved {formatUGX(totalSavingsGenerated)}!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

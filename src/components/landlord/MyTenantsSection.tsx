import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, MapPin, Banknote, Plus, UserCheck, MessageSquare, RefreshCw } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import StarRatingDisplay from '@/components/reviews/StarRatingDisplay';
import LandlordAddTenantDialog from './LandlordAddTenantDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import UserReviewsSection from '@/components/reviews/UserReviewsSection';

interface Tenant {
  id: string;
  tenant_id: string;
  property_address: string;
  monthly_rent: number | null;
  registered_by: string | null;
  tenant_profile?: {
    id: string;
    full_name: string;
    phone: string;
    avatar_url: string | null;
  };
  agent_profile?: {
    full_name: string;
    phone: string;
  };
  current_rating?: number;
  total_reviews?: number;
}

export default function MyTenantsSection() {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [reviewTenant, setReviewTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    if (user) {
      fetchTenants();
    }
  }, [user]);

  const fetchTenants = async () => {
    if (!user) return;
    setLoading(true);

    const { data: profile } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .single();

    if (!profile) {
      setLoading(false);
      return;
    }

    // Find landlord entries that match this user's phone
    const { data: landlordEntries, error } = await supabase
      .from('landlords')
      .select('id, tenant_id, property_address, monthly_rent, phone, registered_by')
      .eq('phone', profile.phone);

    if (error) {
      console.error('Error fetching tenants:', error);
      setLoading(false);
      return;
    }

    const tenantIds = (landlordEntries || []).map(l => l.tenant_id).filter(Boolean);
    const agentIds = (landlordEntries || []).map(l => l.registered_by).filter(Boolean) as string[];
    
    if (tenantIds.length === 0) {
      setTenants([]);
      setLoading(false);
      return;
    }

    // Fetch tenant profiles, agent profiles, and review summaries in parallel
    const allProfileIds = [...new Set([...tenantIds, ...agentIds])];
    
    // Only fetch profiles (auth-related), stub reviews to reduce DB calls
    const [profilesResult] = await Promise.all([
      supabase.from('profiles').select('id, full_name, phone, avatar_url').in('id', allProfileIds),
    ]);

    const profiles = profilesResult.data;
    const allReviews: any[] = []; // Stubbed - user_reviews query removed

    const tenantsWithProfiles: Tenant[] = (landlordEntries || []).map(entry => {
      const tenantProfile = profiles?.find(p => p.id === entry.tenant_id);
      const agentProfile = entry.registered_by ? profiles?.find(p => p.id === entry.registered_by) : undefined;
      const tenantReviews = allReviews.filter(r => r.reviewed_user_id === entry.tenant_id);
      const avgRating = tenantReviews.length > 0
        ? tenantReviews.reduce((sum, r) => sum + r.rating, 0) / tenantReviews.length
        : 0;
      
      return {
        id: entry.id,
        tenant_id: entry.tenant_id!,
        property_address: entry.property_address,
        monthly_rent: entry.monthly_rent,
        registered_by: entry.registered_by,
        tenant_profile: tenantProfile,
        agent_profile: agentProfile ? { full_name: agentProfile.full_name, phone: agentProfile.phone } : undefined,
        current_rating: avgRating,
        total_reviews: tenantReviews.length,
      };
    });

    setTenants(tenantsWithProfiles);
    setLoading(false);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <Card className="glass-card border-border/50 shadow-elevated">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="glass-card border-border/50 shadow-elevated overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        
        <CardHeader className="relative">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <motion.div
                className="p-2 rounded-lg bg-primary/10"
                whileHover={{ scale: 1.1, rotate: -5 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                <Users className="h-5 w-5 text-primary" />
              </motion.div>
              My Tenants
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={fetchTenants} className="h-8 w-8">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            View and rate your tenants
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 relative">
          <AnimatePresence mode="popLayout">
            {tenants.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-8"
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-4">
                  No tenants registered yet
                </p>
                <Button onClick={() => setShowRegisterDialog(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Register a Tenant
                </Button>
              </motion.div>
            ) : (
              <>
                {tenants.map((tenant, index) => (
                  <motion.div
                    key={tenant.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="p-4 rounded-xl bg-background/50 border border-border/50"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={tenant.tenant_profile?.avatar_url || undefined} />
                        <AvatarFallback>
                          {getInitials(tenant.tenant_profile?.full_name || 'T')}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{tenant.tenant_profile?.full_name || 'Unknown Tenant'}</p>
                        <p className="text-xs text-muted-foreground">{tenant.tenant_profile?.phone}</p>
                        
                        <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {tenant.property_address}
                          </span>
                          {tenant.monthly_rent && (
                            <span className="flex items-center gap-1">
                              <Banknote className="h-3 w-3" />
                              {formatUGX(tenant.monthly_rent)}/mo
                            </span>
                          )}
                        </div>

                        {/* Agent Attribution */}
                        {tenant.agent_profile && (
                          <div className="mt-2">
                            <Badge variant="outline" className="text-xs gap-1 bg-primary/5 border-primary/20 text-primary">
                              <UserCheck className="h-3 w-3" />
                              Registered by: {tenant.agent_profile.full_name} ({tenant.agent_profile.phone})
                            </Badge>
                          </div>
                        )}
                      </div>

                      {/* Rating & Review */}
                      <div className="shrink-0 text-right">
                        <StarRatingDisplay
                          rating={tenant.current_rating || 0}
                          totalReviews={tenant.total_reviews || 0}
                          size="sm"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1 h-7 text-xs gap-1 text-primary"
                          onClick={() => setReviewTenant(tenant)}
                        >
                          <MessageSquare className="h-3 w-3" />
                          Review
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-dashed"
                    onClick={() => setShowRegisterDialog(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Register Another Tenant
                  </Button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <LandlordAddTenantDialog
        open={showRegisterDialog}
        onOpenChange={setShowRegisterDialog}
        onSuccess={fetchTenants}
      />

      {/* Tenant Review Dialog */}
      <Dialog open={!!reviewTenant} onOpenChange={(open) => !open && setReviewTenant(null)}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              Review: {reviewTenant?.tenant_profile?.full_name || 'Tenant'}
            </DialogTitle>
          </DialogHeader>
          {reviewTenant && (
            <UserReviewsSection
              userId={reviewTenant.tenant_id}
              userName={reviewTenant.tenant_profile?.full_name || 'Tenant'}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

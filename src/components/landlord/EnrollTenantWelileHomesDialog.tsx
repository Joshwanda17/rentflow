import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  UserPlus, 
  Loader2, 
  Home, 
  Check, 
  Users,
  Sparkles 
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface TenantOption {
  tenant_id: string;
  full_name: string;
  phone: string | null;
  already_enrolled: boolean;
}

interface EnrollTenantWelileHomesDialogProps {
  trigger?: React.ReactNode;
}

export function EnrollTenantWelileHomesDialog({ trigger }: EnrollTenantWelileHomesDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantOption | null>(null);
  const [monthlyRent, setMonthlyRent] = useState('');

  // Fetch tenants linked to this landlord
  const { data: tenants = [], isLoading: loadingTenants } = useQuery({
    queryKey: ['landlord-tenants-for-enrollment', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get all tenants from rent_requests
      const { data: rentRequests } = await supabase
        .from('rent_requests')
        .select('tenant_id')
        .eq('landlord_id', user.id);

      if (!rentRequests || rentRequests.length === 0) return [];

      const tenantIds = [...new Set(rentRequests.map((rr) => rr.tenant_id))];

      // Get tenant profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', tenantIds);

      // Check which are already enrolled
      const { data: subscriptions } = await supabase
        .from('welile_homes_subscriptions')
        .select('tenant_id')
        .in('tenant_id', tenantIds);

      const enrolledIds = new Set(subscriptions?.map((s) => s.tenant_id) || []);

      return (profiles || []).map((p) => ({
        tenant_id: p.id,
        full_name: p.full_name || 'Unknown',
        phone: p.phone,
        already_enrolled: enrolledIds.has(p.id),
      })) as TenantOption[];
    },
    enabled: !!user?.id && open,
  });

  const enrollMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !selectedTenant) throw new Error('Missing data');

      const rent = parseFloat(monthlyRent);
      if (isNaN(rent) || rent <= 0) throw new Error('Invalid rent amount');

      const { error } = await supabase
        .from('welile_homes_subscriptions')
        .insert({
          tenant_id: selectedTenant.tenant_id,
          landlord_id: user.id,
          monthly_rent: rent,
          subscription_status: 'active',
          landlord_registered: true,
          total_savings: 0,
          months_enrolled: 0,
        });

      if (error) throw error;

      // Notification removed - table dropped

      // Try to send push notification
      try {
        await supabase.functions.invoke('send-push-notification', {
          body: {
            userId: selectedTenant.tenant_id,
            title: 'Welcome to Welile Homes! 🏠',
            body: 'You\'ve been enrolled in Welile Homes. Start building your future home savings!',
          },
        });
      } catch (e) {
        console.log('Push notification failed:', e);
      }
    },
    onSuccess: () => {
      toast.success(`${selectedTenant?.full_name} enrolled in Welile Homes!`);
      queryClient.invalidateQueries({ queryKey: ['landlord-welile-homes-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['landlord-tenants-for-enrollment'] });
      queryClient.invalidateQueries({ queryKey: ['welile-homes-landlord-leaderboard'] });
      setOpen(false);
      setSelectedTenant(null);
      setMonthlyRent('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to enroll tenant');
    },
  });

  const availableTenants = tenants.filter((t) => !t.already_enrolled);
  const enrolledTenants = tenants.filter((t) => t.already_enrolled);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2 bg-purple-600 hover:bg-purple-700">
            <UserPlus className="h-4 w-4" />
            Enroll Tenant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-purple-600" />
            Enroll Tenant in Welile Homes
          </DialogTitle>
          <DialogDescription>
            Help your tenants build towards homeownership by enrolling them in Welile Homes savings.
          </DialogDescription>
        </DialogHeader>

        {loadingTenants ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-6">
            <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No tenants found.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tenants will appear here once they've linked their rent payments to you.
            </p>
          </div>
        ) : selectedTenant ? (
          <div className="space-y-4">
            {/* Selected Tenant */}
            <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{selectedTenant.full_name}</p>
                  {selectedTenant.phone && (
                    <p className="text-xs text-muted-foreground">{selectedTenant.phone}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTenant(null)}
                  className="text-xs"
                >
                  Change
                </Button>
              </div>
            </div>

            {/* Monthly Rent Input */}
            <div className="space-y-2">
              <Label htmlFor="monthly-rent">Monthly Rent Amount (UGX)</Label>
              <Input
                id="monthly-rent"
                type="number"
                placeholder="e.g., 500000"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
              />
              {monthlyRent && parseFloat(monthlyRent) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Monthly savings contribution: <span className="text-emerald-600 font-medium">
                    {formatUGX(parseFloat(monthlyRent) * 0.10)}
                  </span> (10% of platform fee)
                </p>
              )}
            </div>

            {/* How it works */}
            <div className="p-3 bg-gradient-to-br from-purple-50 to-amber-50 rounded-lg text-xs text-purple-700">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium mb-1">What happens next:</p>
                  <ul className="space-y-1 text-purple-600">
                    <li>• Tenant gets notified about their enrollment</li>
                    <li>• 10% of your platform fee goes to their savings</li>
                    <li>• Savings grow at 5% compound interest monthly</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              onClick={() => enrollMutation.mutate()}
              disabled={enrollMutation.isPending || !monthlyRent || parseFloat(monthlyRent) <= 0}
              className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            >
              {enrollMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Enroll in Welile Homes
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Available Tenants */}
            {availableTenants.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Select a tenant to enroll:</p>
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {availableTenants.map((tenant) => (
                      <button
                        key={tenant.tenant_id}
                        onClick={() => setSelectedTenant(tenant)}
                        className="w-full p-3 rounded-lg border hover:border-purple-300 hover:bg-purple-50 transition-colors text-left"
                      >
                        <p className="font-medium text-sm">{tenant.full_name}</p>
                        {tenant.phone && (
                          <p className="text-xs text-muted-foreground">{tenant.phone}</p>
                        )}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Already Enrolled */}
            {enrolledTenants.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 text-muted-foreground">Already enrolled:</p>
                <div className="space-y-2">
                  {enrolledTenants.map((tenant) => (
                    <div
                      key={tenant.tenant_id}
                      className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium text-sm">{tenant.full_name}</p>
                        {tenant.phone && (
                          <p className="text-xs text-muted-foreground">{tenant.phone}</p>
                        )}
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-700 border-0">
                        <Check className="h-3 w-3 mr-1" />
                        Enrolled
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {availableTenants.length === 0 && enrolledTenants.length > 0 && (
              <p className="text-center text-sm text-muted-foreground py-2">
                All your tenants are already enrolled! 🎉
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

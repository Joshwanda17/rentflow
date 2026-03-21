import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RoleVerification {
  role: 'agent' | 'tenant' | 'landlord' | 'supporter';
  label: string;
  verified: boolean;
  reason: string;
  action?: string;
  actionRoute?: string;
}

export function useVerificationStatus(userId: string | undefined) {
  const [verifications, setVerifications] = useState<RoleVerification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    const fetch = async () => {
      try {
        const [
          rentReqAgent,
          activeRentSubs,
          landlordTenants,
          deployedCapital,
        ] = await Promise.all([
          // Agent: has posted ≥1 rent request
          supabase.from('rent_requests').select('id', { count: 'exact', head: true }).eq('agent_id', userId),
          // Tenant: has active rent subscription (running balance)
          supabase.from('rent_requests').select('id', { count: 'exact', head: true }).eq('tenant_id', userId).in('status', ['funded', 'active', 'partially_repaid']),
          // Landlord: has ≥1 tenant attached with active rent
          supabase.from('landlords').select('id', { count: 'exact', head: true }).eq('tenant_id', userId).eq('verified', true),
          // Supporter: ≥50K deployed
          supabase.from('investor_portfolios').select('investment_amount').eq('investor_id', userId).in('status', ['active', 'pending', 'pending_approval']),
        ]);

        // Also check if this user is a landlord with tenants
        const landlordCheck = await supabase
          .from('house_listings')
          .select('id', { count: 'exact', head: true })
          .eq('landlord_id', userId)
          .not('tenant_id', 'is', null);

        const deployedTotal = (deployedCapital.data || []).reduce((s, p) => s + (p.investment_amount || 0), 0);

        const results: RoleVerification[] = [
          {
            role: 'agent',
            label: 'Verified Agent',
            verified: (rentReqAgent.count ?? 0) >= 1,
            reason: (rentReqAgent.count ?? 0) >= 1 ? 'Posted rent requests for tenants' : 'Post 1 rent request for a tenant',
            action: 'Post Rent Request',
          },
          {
            role: 'tenant',
            label: 'Verified Tenant',
            verified: (activeRentSubs.count ?? 0) >= 1,
            reason: (activeRentSubs.count ?? 0) >= 1 ? 'Active rent balance running' : 'Get your rent funded by Welile',
            action: 'Request Rent',
          },
          {
            role: 'landlord',
            label: 'Verified Landlord',
            verified: (landlordCheck.count ?? 0) >= 1,
            reason: (landlordCheck.count ?? 0) >= 1 ? 'Tenants attached & rent flowing' : 'Have at least 1 tenant with active rent',
            action: 'Add Tenant',
          },
          {
            role: 'supporter',
            label: 'Verified Funder',
            verified: deployedTotal >= 50000,
            reason: deployedTotal >= 50000 ? `UGX ${deployedTotal.toLocaleString()} deployed` : `Deploy at least UGX 50,000 (${Math.round((deployedTotal / 50000) * 100)}% done)`,
            action: 'Add Investment',
          },
        ];

        setVerifications(results);
      } catch (e) {
        console.warn('[useVerificationStatus] Error:', e);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [userId]);

  const verifiedCount = verifications.filter(v => v.verified).length;

  return { verifications, loading, verifiedCount, totalRoles: verifications.length };
}

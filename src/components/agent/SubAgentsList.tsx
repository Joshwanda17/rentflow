import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, TrendingUp, Loader2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface SubAgent {
  id: string;
  sub_agent_id: string;
  created_at: string;
  profile?: {
    full_name: string;
    phone: string;
    avatar_url: string | null;
  };
  earnings?: number;
  tenants_count?: number;
}

export function SubAgentsList() {
  const { user } = useAuth();
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSubAgentEarnings, setTotalSubAgentEarnings] = useState(0);

  useEffect(() => {
    if (user) {
      fetchSubAgents();
    }
  }, [user]);

  const fetchSubAgents = async () => {
    if (!user) return;

    try {
      // Fetch subagents
      const { data: subAgentsData, error } = await supabase
        .from('agent_subagents')
        .select('*')
        .eq('parent_agent_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!subAgentsData || subAgentsData.length === 0) {
        setSubAgents([]);
        setLoading(false);
        return;
      }

      // Fetch profiles for subagents
      const subAgentIds = subAgentsData.map(sa => sa.sub_agent_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone, avatar_url')
        .in('id', subAgentIds);

      // Fetch earnings per subagent from parent's perspective
      const { data: earningsData } = await supabase
        .from('agent_earnings')
        .select('amount, source_user_id')
        .eq('agent_id', user.id)
        .eq('earning_type', 'subagent_commission');

      // Calculate total earnings from each subagent's tenants
      const earningsBySubAgent: Record<string, number> = {};
      let totalEarnings = 0;

      if (earningsData) {
        for (const earning of earningsData) {
          // Find which subagent registered this tenant
          for (const subAgentId of subAgentIds) {
            const { data: tenantCheck } = await supabase
              .from('rent_requests')
              .select('id')
              .eq('agent_id', subAgentId)
              .eq('tenant_id', earning.source_user_id)
              .limit(1);

            if (tenantCheck && tenantCheck.length > 0) {
              earningsBySubAgent[subAgentId] = (earningsBySubAgent[subAgentId] || 0) + Number(earning.amount);
              totalEarnings += Number(earning.amount);
              break;
            }
          }
        }
      }

      // Count tenants per subagent
      const tenantsCountBySubAgent: Record<string, number> = {};
      for (const subAgentId of subAgentIds) {
        const { count } = await supabase
          .from('rent_requests')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', subAgentId);
        
        tenantsCountBySubAgent[subAgentId] = count || 0;
      }

      // Combine data
      const enrichedSubAgents = subAgentsData.map(sa => ({
        ...sa,
        profile: profiles?.find(p => p.id === sa.sub_agent_id),
        earnings: earningsBySubAgent[sa.sub_agent_id] || 0,
        tenants_count: tenantsCountBySubAgent[sa.sub_agent_id] || 0,
      }));

      setSubAgents(enrichedSubAgents);
      setTotalSubAgentEarnings(totalEarnings);
    } catch (error) {
      console.error('Error fetching subagents:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (subAgents.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-orange-500" />
            My Sub-Agents
          </div>
          <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
            {subAgents.length} agent{subAgents.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {totalSubAgentEarnings > 0 && (
          <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Your earnings from sub-agents</span>
            <span className="font-bold text-orange-600">{formatUGX(totalSubAgentEarnings)}</span>
          </div>
        )}

        {subAgents.map((subAgent) => (
          <div
            key={subAgent.id}
            className="flex items-center justify-between p-3 rounded-xl bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="font-medium text-sm">{subAgent.profile?.full_name || 'Unknown'}</p>
                <p className="text-xs text-muted-foreground">
                  {subAgent.tenants_count} tenant{subAgent.tenants_count !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-sm text-orange-600 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                {formatUGX(subAgent.earnings || 0)}
              </p>
              <p className="text-xs text-muted-foreground">your 1% earnings</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default SubAgentsList;

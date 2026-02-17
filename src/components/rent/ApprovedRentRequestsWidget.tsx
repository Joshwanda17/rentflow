import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, Home, MapPin, Loader2, User } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { CollapsibleAgentSection } from '@/components/agent/CollapsibleAgentSection';
import { useAuth } from '@/hooks/useAuth';

interface ApprovedRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
  status: string;
  approved_at: string | null;
  created_at: string;
  house_category: string | null;
  request_city: string | null;
  tenant: { full_name: string; phone: string } | null;
  agent: { full_name: string } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  'single-room': '🚪 Single Room',
  'double-room': '🛏️ Double Room',
  '1-bed': '🏠 1 Bed House',
  '2-bed': '🏡 2 Bedroom',
  '2-bed-full': '🏘️ 2 Bed Full',
  '3-bed': '🏢 3 Bedroom',
  '3-bed-luxury': '🏰 3 Bed Luxury',
  '4-bed': '🏛️ 4+ Bed Villa',
  'commercial': '🏪 Commercial',
};

interface ApprovedRentRequestsWidgetProps {
  /** When 'agent', only shows requests posted by the current agent */
  mode: 'manager' | 'agent';
}

export function ApprovedRentRequestsWidget({ mode }: ApprovedRentRequestsWidgetProps) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ApprovedRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    if (!user) return;

    let query = supabase
      .from('rent_requests')
      .select('id, rent_amount, duration_days, status, approved_at, created_at, house_category, request_city, tenant_id, agent_id')
      .eq('status', 'approved')
      .order('approved_at', { ascending: false })
      .limit(20);

    if (mode === 'agent') {
      query = query.eq('agent_id', user.id);
    }

    const { data, error } = await query;

    if (!error && data) {
      const tenantIds = [...new Set(data.map(r => r.tenant_id))];
      const agentIds = [...new Set(data.map(r => r.agent_id).filter(Boolean))] as string[];
      const allIds = [...new Set([...tenantIds, ...agentIds])];

      const { data: profiles } = allIds.length > 0
        ? await supabase.from('profiles').select('id, full_name, phone').in('id', allIds)
        : { data: [] };

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      setRequests(data.map((r: any) => ({
        ...r,
        tenant: profileMap.get(r.tenant_id) ? { full_name: profileMap.get(r.tenant_id)!.full_name, phone: profileMap.get(r.tenant_id)!.phone } : null,
        agent: r.agent_id && profileMap.get(r.agent_id) ? { full_name: profileMap.get(r.agent_id)!.full_name } : null,
      })));
    }
    setLoading(false);
  }, [user, mode]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  if (loading) {
    return (
      <CollapsibleAgentSection icon={CheckCircle} label="Approved Rent Requests" iconColor="text-success">
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </CollapsibleAgentSection>
    );
  }

  return (
    <CollapsibleAgentSection
      icon={CheckCircle}
      label={`Approved Rent Requests${requests.length > 0 ? ` (${requests.length})` : ''}`}
      iconColor="text-success"
    >
      {requests.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          No approved rent requests
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req, i) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Card className="border border-success/30 bg-success/5">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">
                        {req.tenant?.full_name || 'Unknown Tenant'}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {req.house_category && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                            <Home className="h-2.5 w-2.5" />
                            {CATEGORY_LABELS[req.house_category] || req.house_category}
                          </Badge>
                        )}
                        {req.request_city && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <MapPin className="h-2.5 w-2.5" />
                            {req.request_city}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm">{formatUGX(req.rent_amount)}</p>
                      <Badge variant="outline" className="text-[10px] gap-0.5 bg-success/10 text-success border-success/30">
                        <CheckCircle className="h-2.5 w-2.5" />
                        Approved
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {req.approved_at
                      ? `Approved ${formatDistanceToNow(new Date(req.approved_at), { addSuffix: true })}`
                      : `Requested ${formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}`
                    }
                    {mode === 'manager' && req.agent?.full_name && (
                      <>
                        <span>•</span>
                        <User className="h-2.5 w-2.5" />
                        <span>{req.agent.full_name}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{req.duration_days}d</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </CollapsibleAgentSection>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, MapPin, Clock, CheckCircle, XCircle, Loader2, Home } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CollapsibleAgentSection } from '@/components/agent/CollapsibleAgentSection';

interface PendingRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
  status: string;
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

export function PendingRentRequestsWidget() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, duration_days, status, created_at, house_category, request_city, tenant_id, agent_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      // Fetch tenant & agent names in batch
      const tenantIds = [...new Set(data.map(r => r.tenant_id))];
      const agentIds = [...new Set(data.map(r => r.agent_id).filter(Boolean))] as string[];
      const allIds = [...new Set([...tenantIds, ...agentIds])];
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', allIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      setRequests(data.map((r: any) => ({
        ...r,
        tenant: profileMap.get(r.tenant_id) ? { full_name: profileMap.get(r.tenant_id)!.full_name, phone: profileMap.get(r.tenant_id)!.phone } : null,
        agent: r.agent_id && profileMap.get(r.agent_id) ? { full_name: profileMap.get(r.agent_id)!.full_name } : null,
      })));
    }
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    const { error } = await supabase
      .from('rent_requests')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast.error('Failed to approve: ' + error.message);
    } else {
      toast.success('Request approved! Now visible to supporters.');
      setRequests(prev => prev.filter(r => r.id !== id));
    }
    setActionLoading(null);
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    const { error } = await supabase
      .from('rent_requests')
      .update({ status: 'rejected', rejected_reason: 'Rejected by manager' })
      .eq('id', id);

    if (error) {
      toast.error('Failed to reject: ' + error.message);
    } else {
      toast.success('Request rejected.');
      setRequests(prev => prev.filter(r => r.id !== id));
    }
    setActionLoading(null);
  };

  if (loading) {
    return (
      <CollapsibleAgentSection icon={FileText} label="Incoming Rent Requests" iconColor="text-primary">
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </CollapsibleAgentSection>
    );
  }

  return (
    <CollapsibleAgentSection
      icon={FileText}
      label={`Incoming Rent Requests${requests.length > 0 ? ` (${requests.length})` : ''}`}
      iconColor="text-primary"
    >
      {requests.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          No pending rent requests
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
              <Card className="border border-border/60">
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
                    <p className="font-bold text-sm shrink-0">{formatUGX(req.rent_amount)}</p>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                    {req.agent?.full_name && (
                      <>
                        <span>•</span>
                        <span>by {req.agent.full_name}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{req.duration_days}d</span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs gap-1"
                      onClick={() => handleApprove(req.id)}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === req.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3 w-3" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => handleReject(req.id)}
                      disabled={!!actionLoading}
                    >
                      <XCircle className="h-3 w-3" />
                      Reject
                    </Button>
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

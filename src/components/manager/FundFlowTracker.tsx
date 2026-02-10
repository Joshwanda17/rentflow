import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Home, User, Shield, ArrowRight, Wallet, Clock } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface FundFlow {
  id: string;
  rent_amount: number;
  status: string;
  tenant_name: string;
  landlord_name: string;
  supporter_name: string;
  fund_recipient_type: string | null;
  fund_recipient_name: string | null;
  fund_routed_at: string | null;
  funded_at: string | null;
  created_at: string;
}

export default function FundFlowTracker() {
  const [flows, setFlows] = useState<FundFlow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFlows();
  }, []);

  const fetchFlows = async () => {
    setLoading(true);
    const { data: requests } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, status, tenant_id, landlord_id, supporter_id, fund_recipient_type, fund_recipient_name, fund_routed_at, funded_at, created_at')
      .in('status', ['funded', 'disbursed', 'completed', 'approved'])
      .order('created_at', { ascending: false })
      .limit(30);

    if (!requests || requests.length === 0) {
      setFlows([]);
      setLoading(false);
      return;
    }

    const userIds = [
      ...new Set(
        requests
          .flatMap((r) => [r.tenant_id, r.supporter_id, r.fund_recipient_id])
          .filter(Boolean)
      ),
    ];
    const landlordIds = [...new Set(requests.map((r) => r.landlord_id).filter(Boolean))];

    const [profilesRes, landlordsRes] = await Promise.all([
      userIds.length > 0
        ? supabase.from('profiles').select('id, full_name').in('id', userIds)
        : { data: [] },
      landlordIds.length > 0
        ? supabase.from('landlords').select('id, name').in('id', landlordIds)
        : { data: [] },
    ]);

    const profileMap = new Map((profilesRes.data || []).map((p) => [p.id, p.full_name]));
    const landlordMap = new Map((landlordsRes.data || []).map((l) => [l.id, l.name]));

    setFlows(
      requests.map((r) => ({
        id: r.id,
        rent_amount: r.rent_amount,
        status: r.status,
        tenant_name: profileMap.get(r.tenant_id) || 'Unknown',
        landlord_name: landlordMap.get(r.landlord_id) || 'Unknown',
        supporter_name: r.supporter_id ? profileMap.get(r.supporter_id) || 'Unknown' : '—',
        fund_recipient_type: r.fund_recipient_type,
        fund_recipient_name: r.fund_recipient_name,
        fund_routed_at: r.fund_routed_at,
        funded_at: r.funded_at,
        created_at: r.created_at,
      }))
    );
    setLoading(false);
  };

  const recipientIcon = (type: string | null) => {
    switch (type) {
      case 'landlord':
        return <Home className="h-3.5 w-3.5" />;
      case 'caretaker':
        return <User className="h-3.5 w-3.5" />;
      case 'agent':
        return <Shield className="h-3.5 w-3.5" />;
      default:
        return <Clock className="h-3.5 w-3.5" />;
    }
  };

  const recipientColor = (type: string | null) => {
    switch (type) {
      case 'landlord':
        return 'bg-success/10 text-success border-success/30';
      case 'caretaker':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
      case 'agent':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Fund Flow Tracker</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Fund Flow Tracker
          </CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {flows.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {flows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">No fund flows yet</p>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="divide-y divide-border">
              {flows.map((flow) => (
                <div key={flow.id} className="px-4 py-3 space-y-2">
                  {/* Flow header */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate">{flow.tenant_name}</p>
                    <span className="text-sm font-bold text-primary">
                      {formatUGX(Number(flow.rent_amount))}
                    </span>
                  </div>
                  {/* Flow path */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground overflow-x-auto">
                    <span className="shrink-0">Supporter: {flow.supporter_name}</span>
                    <ArrowRight className="h-3 w-3 shrink-0" />
                    <span className="shrink-0">Landlord: {flow.landlord_name}</span>
                    {flow.fund_recipient_type && (
                      <>
                        <ArrowRight className="h-3 w-3 shrink-0" />
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1.5 py-0 shrink-0 ${recipientColor(flow.fund_recipient_type)}`}
                        >
                          {recipientIcon(flow.fund_recipient_type)}
                          <span className="ml-1">
                            {flow.fund_recipient_name} ({flow.fund_recipient_type})
                          </span>
                        </Badge>
                      </>
                    )}
                  </div>
                  {/* Status */}
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 ${
                        flow.fund_routed_at
                          ? 'bg-success/10 text-success border-success/30'
                          : flow.status === 'funded'
                          ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {flow.fund_routed_at
                        ? '✓ Funds Delivered'
                        : flow.status === 'funded'
                        ? '⏳ Awaiting Verification'
                        : flow.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

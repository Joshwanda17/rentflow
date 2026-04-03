import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, MessageCircle, User, ArrowLeft, MapPin, FileSearch } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const statusColor = (s: string) => {
  const m: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    tenant_ops_approved: 'bg-blue-100 text-blue-700',
    agent_verified: 'bg-purple-100 text-purple-700',
    funded: 'bg-green-100 text-green-700',
    disbursed: 'bg-teal-100 text-teal-700',
    repaying: 'bg-purple-100 text-purple-700',
    fully_repaid: 'bg-emerald-100 text-emerald-700',
    defaulted: 'bg-destructive/10 text-destructive',
  };
  return m[s] || 'bg-muted';
};

interface TenantDetailPanelProps {
  tenantId: string;
  tenantName: string;
  onBack: () => void;
}

export function TenantDetailPanel({ tenantId, tenantName, onBack }: TenantDetailPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-detail', tenantId],
    queryFn: async () => {
      const [profileRes, requestsRes, walletRes, collectionsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, phone, city, created_at').eq('id', tenantId).maybeSingle(),
        supabase.from('rent_requests').select('id, status, rent_amount, amount_repaid, daily_repayment, created_at, landlord_id, assigned_agent_id').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
        supabase.from('wallet_transactions').select('id, amount, type, created_at, description').or(`sender_id.eq.${tenantId},recipient_id.eq.${tenantId}`).order('created_at', { ascending: false }).limit(10),
        supabase.from('agent_collections').select('id, amount, created_at, agent_id, payment_method').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
      ]);

      const agentIds = [...new Set((requestsRes.data || []).map(r => r.assigned_agent_id).filter(Boolean))] as string[];
      const agentRes = agentIds.length > 0
        ? await supabase.from('profiles').select('id, full_name, phone').in('id', agentIds)
        : { data: [] as { id: string; full_name: string; phone: string }[] };
      const agentMap = new Map((agentRes.data || []).map(a => [a.id, a]));

      const landlordIds = [...new Set((requestsRes.data || []).map(r => r.landlord_id).filter(Boolean))] as string[];
      const landlordRes = landlordIds.length > 0
        ? await supabase.from('landlords').select('id, name, phone').in('id', landlordIds)
        : { data: [] as { id: string; name: string; phone: string }[] };
      const landlordMap = new Map((landlordRes.data || []).map(l => [l.id, l]));

      return {
        profile: profileRes.data,
        requests: (requestsRes.data || []).map(r => ({
          ...r,
          agent_name: agentMap.get(r.assigned_agent_id || '')?.full_name || '—',
          landlord_name: landlordMap.get(r.landlord_id)?.name || '—',
        })),
        walletTxns: walletRes.data || [],
        collections: collectionsRes.data || [],
      };
    },
  });

  const profile = data?.profile;
  const requests = data?.requests || [];
  const totalRent = requests.reduce((s, r) => s + Number(r.rent_amount || 0), 0);
  const totalRepaid = requests.reduce((s, r) => s + Number(r.amount_repaid || 0), 0);

  return (
    <div className="space-y-3">
      <Button variant="ghost" onClick={onBack} className="h-10 px-3 gap-2 text-sm font-semibold -ml-1">
        <ArrowLeft className="h-4 w-4" /> Back · {tenantName}
      </Button>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* Profile card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-foreground">{profile?.full_name || tenantName}</p>
                  <p className="text-sm text-muted-foreground">{profile?.phone || '—'}</p>
                  {profile?.city && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" />{profile.city}
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {profile?.phone && (
                    <>
                      <Button variant="outline" size="icon" className="h-9 w-9" asChild>
                        <a href={`tel:${profile.phone}`}><Phone className="h-4 w-4" /></a>
                      </Button>
                      <Button variant="outline" size="icon" className="h-9 w-9" asChild>
                        <a href={`https://wa.me/${profile.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-2">
            <Card><CardContent className="p-3 text-center">
              <p className="text-lg font-extrabold text-foreground">{requests.length}</p>
              <p className="text-[10px] text-muted-foreground">Requests</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-lg font-extrabold text-emerald-600">UGX {totalRepaid.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Total Repaid</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-lg font-extrabold text-amber-600">UGX {(totalRent - totalRepaid).toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Outstanding</p>
            </CardContent></Card>
          </div>

          {/* Rent requests */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rent Requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {requests.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">No requests</p>
              ) : (
                <div className="divide-y divide-border">
                  {requests.map((req) => (
                    <div key={req.id} className="px-4 py-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', statusColor(req.status))}>
                          {req.status.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(req.created_at), 'dd MMM yyyy')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold">UGX {Number(req.rent_amount || 0).toLocaleString()}</span>
                        <span className="text-muted-foreground">
                          Repaid: UGX {Number(req.amount_repaid || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>Agent: {req.agent_name}</span>
                        <span>Landlord: {req.landlord_name}</span>
                        {req.daily_repayment && <span>Daily: UGX {Number(req.daily_repayment).toLocaleString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent collections */}
          {data?.collections && data.collections.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Recent Collections</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {data.collections.map((c) => (
                    <div key={c.id} className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">UGX {Number(c.amount).toLocaleString()}</p>
                        <p className="text-[11px] text-muted-foreground">{c.payment_method}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(c.created_at), 'dd MMM, HH:mm')}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Loader2, User, Calendar, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface TenancyRow {
  id: string;
  tenant_id: string;
  created_at: string;
  tenancy_status: string;
  tenancy_ended_at: string | null;
  tenancy_end_reason: string | null;
  outstanding_at_end: number | null;
  amount_repaid: number | null;
  total_repayment: number | null;
  tenant?: { full_name: string | null; phone: string | null } | null;
}

const fmt = (n: number | null | undefined) =>
  `UGX ${new Intl.NumberFormat('en-UG').format(Math.round(n || 0))}`;

const statusVariant = (s: string) => {
  switch (s) {
    case 'active': return 'default' as const;
    case 'evicted': return 'destructive' as const;
    case 'completed': return 'secondary' as const;
    case 'terminated': return 'outline' as const;
    default: return 'outline' as const;
  }
};

export function PropertyTenancyTimeline({ landlordId }: { landlordId: string }) {
  const [rows, setRows] = useState<TenancyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('rent_requests')
        .select('id, tenant_id, created_at, tenancy_status, tenancy_ended_at, tenancy_end_reason, outstanding_at_end, amount_repaid, total_repayment, tenant:profiles!rent_requests_tenant_id_fkey(full_name, phone)')
        .eq('landlord_id', landlordId)
        .order('created_at', { ascending: false });
      if (!cancelled) {
        if (!error) setRows((data || []) as any);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [landlordId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading tenancy history...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No tenancy records for this property yet.
      </Card>
    );
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-0 bottom-0 w-px bg-border" aria-hidden />
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.id} className="relative">
            <div className="absolute -left-[18px] top-2 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
            <Card className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <User className="h-3.5 w-3.5" />
                    {r.tenant?.full_name || 'Unknown tenant'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(r.created_at), 'd MMM yyyy')}
                    {r.tenancy_ended_at && <> → {format(new Date(r.tenancy_ended_at), 'd MMM yyyy')}</>}
                  </div>
                </div>
                <Badge variant={statusVariant(r.tenancy_status)} className="capitalize text-[10px]">
                  {r.tenancy_status}
                </Badge>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">Total paid</div>
                  <div className="font-mono">{fmt(r.amount_repaid)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    {r.tenancy_status === 'evicted' ? 'Outstanding at end' : 'Plan total'}
                  </div>
                  <div className="font-mono">
                    {fmt(r.tenancy_status === 'evicted' ? r.outstanding_at_end : r.total_repayment)}
                  </div>
                </div>
              </div>

              {r.tenancy_end_reason && (
                <div className="mt-2 text-xs flex gap-1.5 text-muted-foreground border-t pt-2">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span><span className="font-medium text-foreground">Reason: </span>{r.tenancy_end_reason}</span>
                </div>
              )}
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

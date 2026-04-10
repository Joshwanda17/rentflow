import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { AlertTriangle, Navigation, Phone, ChevronRight, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { differenceInDays } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface CollectionItem {
  tenant_id: string;
  tenant_name: string;
  tenant_phone: string;
  rent_amount: number;
  daily_repayment: number;
  amount_repaid: number;
  outstanding: number;
  days_overdue: number;
  priority_score: number;
  latitude?: number | null;
  longitude?: number | null;
  risk_level: 'low' | 'medium' | 'high' | 'critical' | 'completed';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
}

export function PriorityCollectionQueue({ open, onOpenChange, agentId }: Props) {
  const { data: queue = [], isLoading } = useQuery({
    queryKey: ['priority-collection-queue', agentId],
    queryFn: async () => {
      const { data: requests } = await supabase
        .from('rent_requests')
        .select('tenant_id, rent_amount, daily_repayment, amount_repaid, total_repayment, disbursed_at, status, request_latitude, request_longitude')
        .eq('agent_id', agentId)
        .neq('status', 'rejected');

      if (!requests?.length) return [];

      const tenantIds = [...new Set(requests.map(r => r.tenant_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', tenantIds);

      const profileMap: Record<string, { name: string; phone: string }> = {};
      (profiles || []).forEach(p => { profileMap[p.id] = { name: p.full_name, phone: p.phone || '' }; });

      const items: CollectionItem[] = requests.map(r => {
        const outstanding = (r.total_repayment || 0) - (r.amount_repaid || 0);
        const daysOverdue = r.disbursed_at
          ? Math.max(0, differenceInDays(new Date(), new Date(r.disbursed_at)) - Math.floor((r.amount_repaid || 0) / (r.daily_repayment || 1)))
          : 0;
        const priorityScore = daysOverdue * outstanding;
        const actualOutstanding = Math.max(0, outstanding);
        const isCompleted = actualOutstanding === 0;
        const risk: CollectionItem['risk_level'] = isCompleted ? 'completed' : daysOverdue >= 10 ? 'critical' : daysOverdue >= 5 ? 'high' : daysOverdue >= 2 ? 'medium' : 'low';

        return {
          tenant_id: r.tenant_id,
          tenant_name: profileMap[r.tenant_id]?.name || 'Unknown',
          tenant_phone: profileMap[r.tenant_id]?.phone || '',
          rent_amount: r.rent_amount,
          daily_repayment: r.daily_repayment,
          amount_repaid: r.amount_repaid || 0,
          outstanding: actualOutstanding,
          days_overdue: daysOverdue,
          priority_score: priorityScore,
          latitude: r.request_latitude,
          longitude: r.request_longitude,
          risk_level: risk,
        };
      }).sort((a, b) => {
        if (a.risk_level === 'completed' && b.risk_level !== 'completed') return 1;
        if (a.risk_level !== 'completed' && b.risk_level === 'completed') return -1;
        return b.priority_score - a.priority_score;
      });

      return items;
    },
    enabled: open,
    staleTime: 60000,
  });

  const riskColors = {
    low: 'border-success/30 bg-success/5',
    medium: 'border-warning/30 bg-warning/5',
    high: 'border-destructive/30 bg-destructive/5',
    critical: 'border-destructive/50 bg-destructive/10 ring-1 ring-destructive/20',
    completed: 'border-success/20 bg-success/5 opacity-75',
  };

  const riskLabels = {
    low: { text: 'On Track', color: 'text-success' },
    medium: { text: 'Slipping', color: 'text-warning' },
    high: { text: 'Overdue', color: 'text-destructive' },
    critical: { text: '🚨 Critical', color: 'text-destructive font-bold' },
    completed: { text: '✅ Paid Up', color: 'text-success' },
  };

  const totalOwed = queue.reduce((s, i) => s + i.outstanding, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl p-0">
        <SheetHeader className="p-4 pb-2 border-b border-border/40">
          <SheetTitle className="text-left flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Priority Collections
          </SheetTitle>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{queue.length} tenants total</span>
            <span className="font-bold text-destructive">{formatUGX(totalOwed)} owed</span>
          </div>
        </SheetHeader>

        <div className="overflow-y-auto p-3 space-y-2" style={{ maxHeight: 'calc(85vh - 100px)' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>
          ) : queue.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-success font-semibold">🎉 All tenants are up to date!</p>
            </div>
          ) : (
            queue.map((item, idx) => (
              <div
                key={item.tenant_id + idx}
                className={cn("rounded-xl border p-3 space-y-2 transition-all", riskColors[item.risk_level])}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{item.tenant_name}</p>
                      <p className={cn("text-[10px] font-medium", riskLabels[item.risk_level].color)}>
                        {riskLabels[item.risk_level].text} • {item.days_overdue}d overdue
                      </p>
                    </div>
                  </div>
                  <p className="font-bold text-sm text-destructive shrink-0">{formatUGX(item.outstanding)}</p>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>Daily: {formatUGX(item.daily_repayment)}</span>
                  <span>•</span>
                  <span>Paid: {formatUGX(item.amount_repaid)}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.tenant_phone && (
                    <a href={`tel:${item.tenant_phone}`} className="flex-1">
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1">
                        <Phone className="h-3 w-3" /> Call
                      </Button>
                    </a>
                  )}
                  {item.latitude && item.longitude && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1"
                    >
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1">
                        <Navigation className="h-3 w-3" /> Navigate
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

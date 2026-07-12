import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Clock, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';

const db = supabase as any;

type OrderStatus = 'submitted' | 'processing' | 'completed' | 'failed';

interface SmartphoneOrder {
  id: string;
  unit_price: number;
  amount_outstanding: number;
  order_status: OrderStatus;
  created_at: string;
}

const STATUS_META: Record<OrderStatus, { label: string; icon: typeof Clock; className: string }> = {
  submitted: { label: 'Submitted', icon: Clock, className: 'bg-muted text-muted-foreground border-border' },
  processing: { label: 'Processing', icon: Loader2, className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  completed: { label: 'Completed', icon: CheckCircle2, className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
  failed: { label: 'Failed', icon: XCircle, className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

function normalizeStatus(value: unknown): OrderStatus {
  return value === 'processing' || value === 'completed' || value === 'failed' ? value : 'submitted';
}

interface Props {
  userId?: string;
}

export default function SmartphoneOrderStatus({ userId }: Props) {
  const { data: orders = [] } = useQuery<SmartphoneOrder[]>({
    queryKey: ['my-smartphone-orders', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await db
        .from('merchandise_sales')
        .select('id, unit_price, amount_outstanding, order_status, created_at')
        .eq('customer_id', userId)
        .eq('item_name', 'Welile Smartphone')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if (!userId || orders.length === 0) return null;

  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          <p className="text-sm font-bold">Smartphone order status</p>
        </div>
        <div className="space-y-2">
          {orders.map((o) => {
            const status = normalizeStatus(o.order_status);
            const meta = STATUS_META[status];
            const Icon = meta.icon;
            return (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{formatUGX(Number(o.unit_price))}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Ordered {format(new Date(o.created_at), 'd MMM yyyy')}
                    {Number(o.amount_outstanding) > 0
                      ? ` · ${formatUGX(Number(o.amount_outstanding))} to recover`
                      : ' · fully recovered'}
                  </p>
                </div>
                <Badge variant="outline" className={`gap-1 shrink-0 ${meta.className}`}>
                  <Icon className={`h-3 w-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
                  {meta.label}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
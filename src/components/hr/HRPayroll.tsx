import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Banknote } from 'lucide-react';

export default function HRPayroll() {
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['hr-payroll-batches'],
    queryFn: async () => {
      const { data } = await supabase
        .from('payroll_batches')
        .select('*')
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const statusColors: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    submitted: 'bg-warning/20 text-warning',
    approved: 'bg-success/20 text-success',
    rejected: 'bg-destructive/20 text-destructive',
    disbursed: 'bg-primary/20 text-primary',
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-foreground">Payroll Batches</h2>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : batches.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No payroll batches</p>
      ) : (
        <div className="space-y-2">
          {batches.map((batch: any) => (
            <Card key={batch.id} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center">
                      <Banknote className="h-4 w-4 text-success" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {batch.batch_month || `${batch.period_start} – ${batch.period_end}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {batch.total_employees || batch.employee_count || 0} employees • UGX {Number(batch.total_amount || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge className={statusColors[batch.status] || ''}>{batch.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

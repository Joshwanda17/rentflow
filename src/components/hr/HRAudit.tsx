import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function HRAudit() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['hr-audit-logs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .like('action_type', 'hr_%')
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-foreground">HR Audit Trail</h2>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No HR audit events yet</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log: any) => (
            <Card key={log.id} className="border-border/50">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {(log.action_type as string).replace('hr_', '').replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
                {log.metadata && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {JSON.stringify(log.metadata).slice(0, 120)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

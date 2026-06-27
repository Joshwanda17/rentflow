import * as React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { History, RefreshCw, Loader2, Plus, Pause, Play, Trash2 } from 'lucide-react';

interface AuditEntry {
  id: string;
  action: 'create' | 'pause' | 'resume' | 'cancel';
  acted_by_name: string | null;
  recipient_name: string | null;
  amount: number | null;
  reason: string | null;
  schedule_description: string | null;
  created_at: string;
}

const PAGE_SIZE = 10;

const ACTION_META: Record<AuditEntry['action'], { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  create: { label: 'Created', cls: 'bg-emerald-600 hover:bg-emerald-600 text-white', Icon: Plus },
  pause: { label: 'Paused', cls: 'bg-amber-500 hover:bg-amber-500 text-white', Icon: Pause },
  resume: { label: 'Resumed', cls: 'bg-blue-600 hover:bg-blue-600 text-white', Icon: Play },
  cancel: { label: 'Cancelled', cls: 'bg-destructive hover:bg-destructive text-destructive-foreground', Icon: Trash2 },
};

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function StandingOrderAuditLog() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error, count } = await supabase
      .from('standing_order_audit_log')
      .select('id, action, acted_by_name, recipient_name, amount, reason, schedule_description, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) {
      console.error('[StandingOrderAuditLog] load failed:', error);
      toast({ title: 'Could not load audit log', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    setEntries((data ?? []) as AuditEntry[]);
    setTotal(count ?? 0);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(page); }, [load, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Standing Order Audit Log ({total})
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => load(page)} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Every create, pause, resume, and cancel action with timestamp and acting user.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-4 text-center">No standing order actions recorded yet.</p>
        ) : (
          <>
            {entries.map(e => {
              const meta = ACTION_META[e.action];
              const Icon = meta.Icon;
              return (
                <div key={e.id} className="rounded-lg border p-3 space-y-1 bg-muted/10">
                  <div className="flex items-start justify-between gap-2">
                    <Badge className={`${meta.cls} text-[10px] gap-1`}>
                      <Icon className="h-3 w-3" /> {meta.label}
                    </Badge>
                    {e.amount != null && (
                      <span className="text-sm font-bold whitespace-nowrap">UGX {Number(e.amount).toLocaleString()}</span>
                    )}
                  </div>
                  <p className="text-xs">
                    <span className="font-semibold">{e.acted_by_name || 'Unknown user'}</span>
                    {e.recipient_name ? <> → {e.recipient_name}</> : null}
                  </p>
                  {(e.schedule_description || e.reason) && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[e.schedule_description, e.reason].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">{formatTs(e.created_at)}</p>
                </div>
              );
            })}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>
                  Previous
                </Button>
                <span className="text-[11px] text-muted-foreground">Page {page + 1} of {totalPages}</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page + 1 >= totalPages || loading} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

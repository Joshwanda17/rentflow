import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatUGX } from '@/lib/rentCalculations';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Inbox, ShieldCheck, ChevronRight, AlertTriangle } from 'lucide-react';
import {
  PendingBatch,
  channelLabel,
  listPendingFinOpsBatches,
} from '@/lib/fieldDepositBatches';
import { FieldDepositVerifyDialog } from './FieldDepositVerifyDialog';

export function FieldDepositVerificationQueue() {
  const [batches, setBatches] = useState<PendingBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<PendingBatch | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const rows = await listPendingFinOpsBatches();
      setBatches(rows);
    } catch (e: any) {
      if (!silent) toast.error(e?.message ?? 'Failed to load deposits');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 15000);
    return () => clearInterval(id);
  }, [load]);

  const totalDeclared = batches.reduce((s, b) => s + Number(b.declared_total || 0), 0);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Field Deposits — Pending Verification
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => load(false)}
              disabled={refreshing}
              className="h-8"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="font-mono">{batches.length} batch{batches.length === 1 ? '' : 'es'}</Badge>
            <Badge variant="secondary" className="font-mono">{formatUGX(totalDeclared)} declared</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : batches.length === 0 ? (
            <div className="py-10 flex flex-col items-center text-center text-muted-foreground">
              <Inbox className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm font-medium">All caught up</p>
              <p className="text-xs">No field deposit batches awaiting verification.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="divide-y rounded-md border">
                {batches.map((b) => {
                  const tagged = b.items.reduce((s, i) => s + Number(i.amount || 0), 0);
                  const surplus = Math.max(0, Number(b.declared_total || 0) - tagged);
                  return (
                    <button
                      key={b.id}
                      onClick={() => setActive(b)}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {b.agent_name ?? b.agent_id.slice(0, 8)}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {channelLabel(b.channel)}
                          </Badge>
                          {surplus > 0 && (
                            <Badge variant="outline" className="text-[10px] border-warning/30 text-warning">
                              <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                              Surplus
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {b.items.length} tenant{b.items.length === 1 ? '' : 's'} · proof{' '}
                          <span className="font-mono">{b.proof_reference ?? '—'}</span>
                          {b.proof_submitted_at && (
                            <> · {formatDistanceToNow(new Date(b.proof_submitted_at), { addSuffix: true })}</>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-semibold text-sm">
                          {formatUGX(Number(b.declared_total))}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <FieldDepositVerifyDialog
        batch={active}
        open={active !== null}
        onClose={() => setActive(null)}
        onResolved={() => load(true)}
      />
    </>
  );
}
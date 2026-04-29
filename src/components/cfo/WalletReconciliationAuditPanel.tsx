import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ChevronDown, ChevronRight, ShieldCheck, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

interface AuditRow {
  id: string;
  user_id: string | null;
  record_id: string | null;
  created_at: string;
  metadata: Record<string, any> | null;
}

interface LedgerLeg {
  id: string;
  user_id: string | null;
  ledger_scope: string;
  direction: string;
  category: string;
  amount: number;
  classification: string | null;
  description: string | null;
  created_at: string;
}

const ugx = (n: number | string | null | undefined) =>
  `UGX ${Number(n ?? 0).toLocaleString('en-UG')}`;

/**
 * Wallet Reconciliation Audit Trail
 * --------------------------------------------------
 * CFO-facing read-only ledger of every one-time wallet reconciliation
 * (e.g. zero-phantom corrections). Each row exposes:
 *  - operator that triggered the fix
 *  - reason + directive
 *  - before/after BOTH cached (wallets bucket) and strict (RPC) balances
 *  - drill-down into the actual general_ledger legs created
 *    (looked up by `transaction_group_id` = audit metadata.transaction_id)
 */
export default function WalletReconciliationAuditPanel() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['wallet-reconciliation-audit'],
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, user_id, record_id, created_at, metadata')
        .eq('action_type', 'wallet_reconciliation')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
    staleTime: 30_000,
  });

  // Hydrate affected-user names in one batch
  const userIds = Array.from(
    new Set(rows.map((r) => r.record_id).filter(Boolean) as string[]),
  );
  const { data: profileMap = {} } = useQuery({
    queryKey: ['wallet-reconciliation-audit-profiles', userIds.join(',')],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of data ?? []) map[(p as any).id] = (p as any).full_name ?? '';
      return map;
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Wallet Reconciliation Audit Trail
          </CardTitle>
          <CardDescription>
            Every one-time wallet correction posted under the{' '}
            <span className="font-mono text-xs">admin_correction</span>{' '}
            partition. Shows operator, reason, before/after balances, and the
            ledger entries created.
          </CardDescription>
        </div>
        <Badge variant="outline" className="shrink-0">
          {rows.length} record{rows.length === 1 ? '' : 's'}
        </Badge>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No wallet reconciliations on file.
          </p>
        ) : (
          <ScrollArea className="max-h-[640px] pr-2">
            <div className="space-y-3">
              {rows.map((row) => {
                const m = row.metadata ?? {};
                const isOpen = expanded === row.id;
                const affectedName =
                  (row.record_id && profileMap[row.record_id]) || 'Unknown user';

                return (
                  <div
                    key={row.id}
                    className="border border-border rounded-lg overflow-hidden"
                  >
                    {/* Header row */}
                    <button
                      onClick={() => setExpanded(isOpen ? null : row.id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">
                            {affectedName}
                          </span>
                          {m.reason && (
                            <Badge variant="secondary" className="text-[10px]">
                              {m.reason}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(row.created_at), 'PPp')} ·{' '}
                          {m.operator ?? 'Unknown operator'}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold">{ugx(m.amount)}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {m.currency ?? 'UGX'}
                        </div>
                      </div>
                    </button>

                    {/* Expanded body */}
                    {isOpen && (
                      <div className="border-t border-border bg-muted/20 p-3 space-y-3">
                        {/* Before / After — Cached */}
                        <div className="grid grid-cols-2 gap-2">
                          <BalanceDelta
                            label="Cached withdrawable"
                            before={m.before_cached}
                            after={m.after_cached}
                          />
                          <BalanceDelta
                            label="Strict (RPC) available"
                            before={m.before_strict}
                            after={m.after_strict}
                            highlight
                          />
                        </div>

                        {/* Directive */}
                        {m.directive && (
                          <div className="text-xs text-muted-foreground border-l-2 border-primary/50 pl-2 italic">
                            {m.directive}
                          </div>
                        )}

                        {/* Operator details */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div>
                            <span className="text-muted-foreground">Operator: </span>
                            <span className="font-medium">
                              {m.operator ?? '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Channel: </span>
                            <span className="font-medium">
                              {m.channel ?? '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Wallet ID: </span>
                            <span className="font-mono text-[10px]">
                              {m.wallet_id ?? '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Audit ID: </span>
                            <span className="font-mono text-[10px]">{row.id}</span>
                          </div>
                        </div>

                        {/* Ledger legs */}
                        {m.transaction_id && (
                          <LedgerLegs transactionGroupId={m.transaction_id} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function BalanceDelta({
  label,
  before,
  after,
  highlight = false,
}: {
  label: string;
  before: any;
  after: any;
  highlight?: boolean;
}) {
  const delta = Number(after ?? 0) - Number(before ?? 0);
  return (
    <div
      className={`rounded-md border p-2 ${
        highlight ? 'border-primary/40 bg-primary/5' : 'border-border bg-background'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <span className="text-muted-foreground line-through">{ugx(before)}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span>{ugx(after)}</span>
      </div>
      <div
        className={`text-[10px] mt-0.5 ${
          delta < 0 ? 'text-destructive' : 'text-emerald-600'
        }`}
      >
        {delta >= 0 ? '+' : ''}
        {ugx(delta)} delta
      </div>
    </div>
  );
}

function LedgerLegs({ transactionGroupId }: { transactionGroupId: string }) {
  const { data: legs = [], isLoading } = useQuery({
    queryKey: ['wallet-reconciliation-legs', transactionGroupId],
    queryFn: async (): Promise<LedgerLeg[]> => {
      const { data, error } = await supabase
        .from('general_ledger')
        .select(
          'id, user_id, ledger_scope, direction, category, amount, classification, description, created_at',
        )
        .eq('transaction_group_id', transactionGroupId)
        .order('ledger_scope', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LedgerLeg[];
    },
  });

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        Ledger entries created
      </div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : legs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No matching ledger legs found.</p>
      ) : (
        <div className="space-y-1.5">
          {legs.map((leg) => (
            <div
              key={leg.id}
              className="rounded border border-border bg-background p-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {leg.ledger_scope}
                  </Badge>
                  <Badge
                    variant={leg.direction === 'cash_in' ? 'default' : 'destructive'}
                    className="text-[10px]"
                  >
                    {leg.direction}
                  </Badge>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {leg.category}
                  </span>
                  {leg.classification && (
                    <Badge variant="secondary" className="text-[10px]">
                      {leg.classification}
                    </Badge>
                  )}
                </div>
                <span className="font-bold">{ugx(leg.amount)}</span>
              </div>
              {leg.description && (
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {leg.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
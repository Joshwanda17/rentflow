import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { extractFromErrorObject } from '@/lib/extractEdgeFunctionError';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, MapPin, Users, Send, Search, ChevronDown, CheckCircle2, XCircle } from 'lucide-react';

/**
 * ADDITIVE ONLY — Rent Disbursement: pay tenants by category / location.
 *
 * This panel does NOT introduce a new payment mechanism. Each selected tenant
 * is paid through the exact same `cfo-direct-credit` edge-function call the
 * existing "Send money to users wallet" form uses, with the same wallet
 * category, platform category, financial impact and recipient routing.
 */

type TenantRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  district: string | null;
  city: string | null;
  sub_county: string | null;
  region: string | null;
  tenant_house_category: string | null;
};

type GroupKey = 'district' | 'city' | 'sub_county' | 'region' | 'tenant_house_category';

const GROUP_LABELS: Record<GroupKey, string> = {
  district: 'District',
  city: 'City / Town',
  sub_county: 'Sub-county',
  region: 'Region',
  tenant_house_category: 'House category',
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface RentCategoryBulkPayoutProps {
  walletCategory: string;
  platformCategory: string;
  financialImpact: 'expense' | 'revenue' | 'neutral';
  categoryLabel: string;
  recipientType: 'user' | 'operational_wallet';
}

export function RentCategoryBulkPayout({
  walletCategory,
  platformCategory,
  financialImpact,
  categoryLabel,
  recipientType,
}: RentCategoryBulkPayoutProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupKey>('district');
  const [groupValue, setGroupValue] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string }[]>([]);

  // Tenants that exist in the rent pipeline, with their location details.
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['rent-category-bulk-tenants'],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TenantRow[]> => {
      const ids = new Set<string>();
      let from = 0;
      const page = 1000;
      // Paginate the tenant ids that appear in rent_requests.
      for (let i = 0; i < 20; i++) {
        const { data, error } = await supabase
          .from('rent_requests')
          .select('tenant_id')
          .not('tenant_id', 'is', null)
          .range(from, from + page - 1);
        if (error) throw error;
        (data || []).forEach((r: any) => r.tenant_id && ids.add(r.tenant_id));
        if (!data || data.length < page) break;
        from += page;
      }
      const idList = Array.from(ids);
      const rows: TenantRow[] = [];
      for (const part of chunk(idList, 200)) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, phone, district, city, sub_county, region, tenant_house_category')
          .in('id', part);
        if (error) throw error;
        rows.push(...((data || []) as TenantRow[]));
      }
      return rows;
    },
  });

  // Categories are derived from the records that actually exist in the database.
  const groupOptions = useMemo(() => {
    const counts = new Map<string, number>();
    tenants.forEach((t) => {
      const raw = (t[groupBy] || '').toString().trim();
      if (!raw) return;
      const key = raw;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [tenants, groupBy]);

  const inGroup = useMemo(() => {
    if (!groupValue) return [];
    return tenants
      .filter((t) => (t[groupBy] || '').toString().trim().toLowerCase() === groupValue.toLowerCase())
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }, [tenants, groupBy, groupValue]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inGroup;
    return inGroup.filter(
      (t) =>
        (t.full_name || '').toLowerCase().includes(q) ||
        (t.phone || '').toLowerCase().includes(q),
    );
  }, [inGroup, search]);

  const selectedTenants = useMemo(
    () => inGroup.filter((t) => selected[t.id]),
    [inGroup, selected],
  );

  const amt = parseFloat(amount || '0');
  const total = (amt > 0 ? amt : 0) * selectedTenants.length;
  const allVisibleSelected = visible.length > 0 && visible.every((t) => selected[t.id]);

  const resetSelection = () => {
    setSelected({});
    setResults([]);
  };

  const handleSend = async () => {
    if (!amt || amt <= 0) {
      toast({ title: 'Enter an amount', description: 'Amount per tenant must be greater than zero.', variant: 'destructive' });
      return;
    }
    if (selectedTenants.length === 0) {
      toast({ title: 'No tenants selected', description: 'Select at least one tenant.', variant: 'destructive' });
      return;
    }
    if (reason.trim().length < 10) {
      toast({ title: 'Reason too short', description: 'Provide a reason of at least 10 characters.', variant: 'destructive' });
      return;
    }

    setSending(true);
    setResults([]);
    setProgress({ done: 0, total: selectedTenants.length });
    const out: { name: string; ok: boolean; error?: string }[] = [];

    for (let i = 0; i < selectedTenants.length; i++) {
      const t = selectedTenants[i];
      const name = t.full_name || t.phone || t.id.slice(0, 8);
      try {
        const { data, error } = await supabase.functions.invoke('cfo-direct-credit', {
          body: {
            target_user_id: t.id,
            amount: amt,
            reason: `[${GROUP_LABELS[groupBy]}: ${groupValue}] ${reason.trim()}`,
            operation: 'credit',
            wallet_category: walletCategory,
            platform_category: platformCategory,
            financial_impact: financialImpact,
            category_label: categoryLabel,
            sub_category: null,
            recipient_type: recipientType,
            manual_credit: true,
            allow_overdraw: false,
          },
        });
        if (error) {
          const msg = await extractFromErrorObject(error, 'Payment failed');
          out.push({ name, ok: false, error: msg });
        } else if ((data as any)?.error) {
          out.push({ name, ok: false, error: String((data as any).error) });
        } else {
          out.push({ name, ok: true });
        }
      } catch (e: any) {
        out.push({ name, ok: false, error: e?.message ?? String(e) });
      }
      setProgress({ done: i + 1, total: selectedTenants.length });
      setResults([...out]);
    }

    setSending(false);
    const okCount = out.filter((r) => r.ok).length;
    const failCount = out.length - okCount;
    toast({
      title: failCount === 0 ? '✅ Category payout complete' : '⚠️ Category payout finished with errors',
      description: `${okCount} paid · ${failCount} failed · UGX ${(okCount * amt).toLocaleString()} sent`,
      variant: failCount === 0 ? undefined : 'destructive',
    });
    qc.invalidateQueries({ queryKey: ['expense-transfers'] });
    qc.invalidateQueries({ queryKey: ['channel-balances'] });
    qc.invalidateQueries({ queryKey: ['treasury-cash-snapshot'] });
    qc.invalidateQueries({ queryKey: ['cfo-overview'] });
    if (failCount === 0) {
      setSelected({});
      setAmount('');
      setReason('');
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Pay tenants by category / location
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">Optional</Badge>
          </CardTitle>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Uses the same “{categoryLabel}” send-money-to-wallet process, one payment per selected tenant.
          </p>

          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tenant categories...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="mb-1.5 block">Category type</Label>
                  <div className="relative">
                    <select
                      value={groupBy}
                      onChange={(e) => {
                        setGroupBy(e.target.value as GroupKey);
                        setGroupValue('');
                        resetSelection();
                      }}
                      className="flex h-10 w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm"
                    >
                      {(Object.keys(GROUP_LABELS) as GroupKey[]).map((k) => (
                        <option key={k} value={k}>{GROUP_LABELS[k]}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5 block">{GROUP_LABELS[groupBy]}</Label>
                  <div className="relative">
                    <select
                      value={groupValue}
                      onChange={(e) => { setGroupValue(e.target.value); resetSelection(); }}
                      className="flex h-10 w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm"
                    >
                      <option value="">Select {GROUP_LABELS[groupBy].toLowerCase()}...</option>
                      {groupOptions.map(([value, count]) => (
                        <option key={value} value={value}>{`${value} — ${count} tenant${count === 1 ? '' : 's'}`}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              </div>

              {groupOptions.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No tenant records carry a {GROUP_LABELS[groupBy].toLowerCase()} value yet.
                </p>
              )}

              {groupValue && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {inGroup.length} tenant{inGroup.length === 1 ? '' : 's'} in {groupValue}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const next = { ...selected };
                        visible.forEach((t) => { next[t.id] = !allVisibleSelected; });
                        setSelected(next);
                      }}
                    >
                      {allVisibleSelected ? 'Clear all' : 'Select all'}
                    </Button>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Filter by name or phone..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                    {visible.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent/50"
                      >
                        <Checkbox
                          checked={!!selected[t.id]}
                          onCheckedChange={(v) =>
                            setSelected((prev) => ({ ...prev, [t.id]: v === true }))
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{t.full_name || 'Unnamed tenant'}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {t.phone || 'No phone'}
                            {t.district ? ` · ${t.district}` : ''}
                          </p>
                        </div>
                      </label>
                    ))}
                    {visible.length === 0 && (
                      <p className="px-3 py-4 text-center text-xs text-muted-foreground">No tenants match.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="mb-1.5 block">Amount per tenant (UGX) <span className="text-destructive">*</span></Label>
                      <Input
                        type="number"
                        min={1}
                        placeholder="50000"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-[11px] text-muted-foreground">Review</p>
                      <p className="text-sm font-semibold">
                        {selectedTenants.length} tenant{selectedTenants.length === 1 ? '' : 's'} selected
                      </p>
                      <p className="text-sm font-semibold text-primary">
                        Total: UGX {total.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="mb-1.5 block">Reason <span className="text-destructive">*</span></Label>
                    <Textarea
                      rows={2}
                      placeholder="Reason (min 10 characters) — applied to every payment in this batch"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    disabled={sending || selectedTenants.length === 0 || !amt || amt <= 0 || reason.trim().length < 10}
                    onClick={handleSend}
                  >
                    {sending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending {progress?.done ?? 0}/{progress?.total ?? 0}...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send UGX {total.toLocaleString()} to {selectedTenants.length} tenant{selectedTenants.length === 1 ? '' : 's'}
                      </>
                    )}
                  </Button>

                  {results.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border divide-y text-xs">
                      {results.map((r, i) => (
                        <div key={`${r.name}-${i}`} className="flex items-start gap-2 px-3 py-1.5">
                          {r.ok ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate">{r.name}</p>
                            {r.error && <p className="text-[10px] text-destructive break-words">{r.error}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
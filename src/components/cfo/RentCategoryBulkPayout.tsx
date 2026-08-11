import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MapPin, Users, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { TreasuryImpactBanner } from './TreasuryImpactBanner';

type FieldKey = 'district' | 'city' | 'sub_county' | 'region' | 'tenant_house_category';

const FIELD_LABELS: Record<FieldKey, string> = {
  district: 'District',
  city: 'City / Town',
  sub_county: 'Sub-county',
  region: 'Region',
  tenant_house_category: 'House category',
};

interface TenantRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  district: string | null;
  city: string | null;
  sub_county: string | null;
  region: string | null;
  tenant_house_category: string | null;
}

const fmt = (n: number) => `UGX ${Math.round(n).toLocaleString()}`;

interface TenantRentInfo {
  rent_amount: number;
  revenue: number;
  total_repayment: number;
}

export function RentCategoryBulkPayout() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<FieldKey>('district');
  const [value, setValue] = useState<string>('');
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [rentMap, setRentMap] = useState<Map<string, TenantRentInfo>>(new Map());

  const loadTenants = async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone, district, city, sub_county, region, tenant_house_category')
        .not(field, 'is', null)
        .neq(field, '')
        .order('full_name', { ascending: true })
        .limit(2000);
      if (error) throw error;
      setTenants((data ?? []) as TenantRow[]);
      await loadRentAmounts((data ?? []).map((d: any) => d.id));
    } catch (e: any) {
      toast({ title: 'Could not load tenants', description: e.message, variant: 'destructive' });
      setTenants([]);
    } finally {
      setLoading(false);
    }
  };

  // Pending (COO-approved) rent amounts per tenant, so the CFO sees the money
  // figures exactly like the Rent Disbursement queue does.
  const loadRentAmounts = async (tenantIds: string[]) => {
    if (!tenantIds.length) { setRentMap(new Map()); return; }
    const map = new Map<string, TenantRentInfo>();
    for (let i = 0; i < tenantIds.length; i += 500) {
      const chunk = tenantIds.slice(i, i + 500);
      const { data } = await supabase
        .from('rent_requests')
        .select('tenant_id, rent_amount, access_fee, request_fee, total_repayment')
        .eq('status', 'coo_approved')
        .in('tenant_id', chunk);
      for (const r of data ?? []) {
        const prev = map.get(r.tenant_id) ?? { rent_amount: 0, revenue: 0, total_repayment: 0 };
        map.set(r.tenant_id, {
          rent_amount: prev.rent_amount + (r.rent_amount ?? 0),
          revenue: prev.revenue + (r.access_fee ?? 0) + (r.request_fee ?? 0),
          total_repayment: prev.total_repayment + (r.total_repayment ?? 0),
        });
      }
    }
    setRentMap(map);
  };

  const values = useMemo(() => {
    const set = new Map<string, number>();
    tenants.forEach(t => {
      const v = (t[field] ?? '').toString().trim();
      if (!v) return;
      set.set(v, (set.get(v) ?? 0) + 1);
    });
    return Array.from(set.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [tenants, field]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter(t => {
      if ((t[field] ?? '').toString().trim() !== value) return false;
      if (!q) return true;
      return (
        (t.full_name ?? '').toLowerCase().includes(q) ||
        (t.phone ?? '').toLowerCase().includes(q)
      );
    });
  }, [tenants, field, value, search]);

  const amt = Number(amount.replace(/[^0-9.]/g, '')) || 0;
  const total = amt * selected.size;
  const canSend = amt > 0 && selected.size > 0 && reason.trim().length >= 10 && !sending;

  // Money summary for the current selection, from each tenant's pending rent.
  const selectionRent = useMemo(() => {
    let rent = 0, revenue = 0, repayment = 0;
    selected.forEach(id => {
      const info = rentMap.get(id);
      if (!info) return;
      rent += info.rent_amount;
      revenue += info.revenue;
      repayment += info.total_repayment;
    });
    return { rent, revenue, repayment };
  }, [selected, rentMap]);

  const groupRentTotal = useMemo(
    () => filtered.reduce((s, t) => s + (rentMap.get(t.id)?.rent_amount ?? 0), 0),
    [filtered, rentMap],
  );

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(prev =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map(t => t.id))
    );
  };

  const send = async () => {
    const ids = Array.from(selected);
    setSending(true);
    setProgress({ done: 0, total: ids.length });
    let ok = 0;
    const failures: string[] = [];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const t = tenants.find(x => x.id === id);
      try {
        const { data, error } = await supabase.functions.invoke('cfo-direct-credit', {
          body: {
            target_user_id: id,
            amount: amt,
            reason: `[BULK ${FIELD_LABELS[field]}: ${value}] ${reason.trim()}`,
            operation: 'credit',
            wallet_category: 'rent_disbursement',
            platform_category: 'rent_disbursement',
            financial_impact: 'revenue',
            category_label: '🏠 Rent Disbursement',
            sub_category: null,
            recipient_type: 'operational_wallet',
            manual_credit: true,
            allow_overdraw: false,
          },
        });
        if (error) throw new Error(error.message);
        if ((data as any)?.error) throw new Error((data as any).error);
        ok++;
      } catch (e: any) {
        failures.push(`${t?.full_name ?? id}: ${e.message}`);
      }
      setProgress({ done: i + 1, total: ids.length });
    }

    setSending(false);
    setProgress(null);
    toast({
      title: failures.length ? `Paid ${ok}/${ids.length} — ${failures.length} failed` : `✅ Paid ${ok} tenants`,
      description: failures.length ? failures.slice(0, 4).join(' • ') : `${fmt(amt * ok)} disbursed`,
      variant: failures.length ? 'destructive' : 'default',
    });
    if (!failures.length) setSelected(new Set());
  };

  return (
    <Card className="border-primary/30">
      <CardHeader
        className="cursor-pointer"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && tenants.length === 0) void loadTenants();
        }}
      >
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Pay tenants by category / location
          </span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category type</Label>
              <Select
                value={field}
                onValueChange={v => {
                  setField(v as FieldKey);
                  setValue('');
                  setSelected(new Set());
                  void loadTenants();
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIELD_LABELS) as FieldKey[]).map(k => (
                    <SelectItem key={k} value={k}>{FIELD_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{FIELD_LABELS[field]}</Label>
              <Select value={value} onValueChange={v => { setValue(v); setSelected(new Set()); }}>
                <SelectTrigger>
                  <SelectValue placeholder={loading ? 'Loading…' : 'Select'} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {values.map(([v, count]) => (
                    <SelectItem key={v} value={v}>{v} ({count})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading records…
            </p>
          )}

          {value && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Search name or phone…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-9 max-w-xs"
                />
                <Button variant="outline" size="sm" onClick={toggleAll}>
                  {selected.size === filtered.length && filtered.length > 0 ? 'Clear all' : `Select all (${filtered.length})`}
                </Button>
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" /> {selected.size} selected
                </Badge>
                <Badge className="border-primary/30 bg-primary/10 text-primary">
                  {FIELD_LABELS[field]} total · {fmt(groupRentTotal)}
                </Badge>
              </div>

              {selected.size > 0 && (
                <div className="space-y-2 rounded-lg border-2 border-emerald-200 bg-emerald-50 p-3 dark:bg-emerald-950/20">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Revenue from this disbursement
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Rent Out</p>
                      <p className="text-sm font-bold text-orange-600">{fmt(selectionRent.rent)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">We Earn (Fees)</p>
                      <p className="text-sm font-bold text-emerald-600">{fmt(selectionRent.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Total Repayment</p>
                      <p className="text-sm font-bold text-primary">{fmt(selectionRent.repayment)}</p>
                    </div>
                  </div>
                  <TreasuryImpactBanner payoutAmount={selectionRent.rent || total || groupRentTotal} />
                  {selectionRent.rent === 0 && (
                    <p className="text-[10px] text-amber-600">
                      No pending (COO-approved) rent found for the ticked tenants — the payout figure falls back to
                      the amount you enter below.
                    </p>
                  )}
                </div>
              )}

              <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
                {filtered.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">No tenants in this category.</p>
                )}
                {filtered.map(t => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-3 p-2.5 hover:bg-muted/50">
                    <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggle(t.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.full_name ?? 'Unnamed'}</span>
                      <span className="block truncate text-xs text-muted-foreground">{t.phone ?? '—'}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold text-orange-600">
                        {fmt(rentMap.get(t.id)?.rent_amount ?? 0)}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">pending rent</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Amount per tenant (UGX)</Label>
                  <Input
                    inputMode="numeric"
                    placeholder="50000"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Reason (min 10 characters)</Label>
                  <Textarea
                    rows={2}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Rent disbursement batch for this location"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
                <div className="text-sm">
                  <span className="text-muted-foreground">Total to disburse: </span>
                  <span className="font-semibold">{fmt(total)}</span>
                  <span className="text-muted-foreground"> · {selected.size} tenant(s)</span>
                </div>
                <Button disabled={!canSend} onClick={send}>
                  {sending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {progress ? `Sending ${progress.done}/${progress.total}` : 'Sending…'}
                    </>
                  ) : (
                    <>Send {fmt(total)} to {selected.size} tenant(s)</>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default RentCategoryBulkPayout;
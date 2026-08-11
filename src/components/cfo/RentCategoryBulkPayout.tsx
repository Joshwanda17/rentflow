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
import { Loader2, MapPin, Users, ChevronDown, ChevronUp } from 'lucide-react';

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
    } catch (e: any) {
      toast({ title: 'Could not load tenants', description: e.message, variant: 'destructive' });
      setTenants([]);
    } finally {
      setLoading(false);
    }
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
              </div>

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
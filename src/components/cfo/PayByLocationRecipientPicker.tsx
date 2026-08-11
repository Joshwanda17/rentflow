import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MapPin, Users, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Pay by Location / Category — RECIPIENT SELECTION ONLY.
 *
 * This component contains **no payout logic**: it simply lets the CFO pick
 * tenants by an existing location/category field and hands the selected
 * people back to the caller, which then runs the *existing* general payout
 * flow (same amount fields, validation, confirmation, ledger + wallet logic).
 */

type FieldKey =
  | 'district'
  | 'town'
  | 'city'
  | 'sub_county'
  | 'parish'
  | 'village'
  | 'region'
  | 'tenant_house_category';

const FIELD_LABELS: Record<FieldKey, string> = {
  district: 'District',
  town: 'Town Council',
  city: 'City / Municipality',
  sub_county: 'Sub-county',
  parish: 'Parish',
  village: 'Village',
  region: 'Region',
  tenant_house_category: 'House category',
};

const FIELD_KEYS = Object.keys(FIELD_LABELS) as FieldKey[];

export interface LocationRecipient {
  id: string;
  full_name: string;
  phone: string | null;
}

interface Row extends LocationRecipient {
  district: string | null;
  town: string | null;
  city: string | null;
  sub_county: string | null;
  parish: string | null;
  village: string | null;
  region: string | null;
  tenant_house_category: string | null;
}

interface Props {
  /** Called with the ticked people — the caller feeds them into the existing payout flow. */
  onUseRecipients: (recipients: LocationRecipient[]) => void;
  /** Number of recipients currently queued in the existing payout form. */
  queuedCount?: number;
  disabled?: boolean;
}

export function PayByLocationRecipientPicker({ onUseRecipients, queuedCount = 0, disabled }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<FieldKey>('district');
  const [value, setValue] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async (key: FieldKey) => {
    setLoading(true);
    setSelected(new Set());
    setValue('');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone, district, town, city, sub_county, parish, village, region, tenant_house_category')
        .not(key, 'is', null)
        .neq(key, '')
        .order('full_name', { ascending: true })
        .limit(3000);
      if (error) throw error;
      setRows((data ?? []) as Row[]);
    } catch (e: any) {
      toast({ title: 'Could not load people', description: e.message, variant: 'destructive' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const options = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const v = (r[field] ?? '').toString().trim();
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, field]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if ((r[field] ?? '').toString().trim() !== value) return false;
      if (!q) return true;
      return (
        (r.full_name ?? '').toLowerCase().includes(q) ||
        (r.phone ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, field, value, search]);

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(prev =>
      prev.size === filtered.length && filtered.length > 0
        ? new Set()
        : new Set(filtered.map(r => r.id)),
    );

  const use = () => {
    const picked = filtered
      .filter(r => selected.has(r.id))
      .map(r => ({ id: r.id, full_name: r.full_name, phone: r.phone }));
    if (!picked.length) return;
    onUseRecipients(picked);
    toast({
      title: `${picked.length} recipient${picked.length === 1 ? '' : 's'} added`,
      description: `From ${FIELD_LABELS[field]}: ${value}. Complete the payout below as usual.`,
    });
  };

  return (
    <Card className="border-primary/30">
      <CardHeader
        className="cursor-pointer py-3"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && rows.length === 0) void load(field);
        }}
      >
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Pay by Location / Category (optional)
            {queuedCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">{queuedCount} queued</Badge>
            )}
          </span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Pick people by an existing location/category, then continue with the normal payout form below —
            amounts, checks, approval and records stay exactly the same.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category type</Label>
              <Select
                value={field}
                onValueChange={v => {
                  setField(v as FieldKey);
                  void load(v as FieldKey);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_KEYS.map(k => (
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
                  {options.map(([v, count]) => (
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
                <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
                  {selected.size === filtered.length && filtered.length > 0
                    ? 'Clear all'
                    : `Select all (${filtered.length})`}
                </Button>
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" /> {selected.size} selected
                </Badge>
              </div>

              <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
                {filtered.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">Nobody found in this selection.</p>
                )}
                {filtered.map(r => (
                  <label key={r.id} className="flex cursor-pointer items-center gap-3 p-2.5 hover:bg-muted/50">
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.full_name || 'Unnamed'}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.phone ?? '—'}</span>
                    </span>
                  </label>
                ))}
              </div>

              <Button
                type="button"
                className="w-full"
                variant="secondary"
                disabled={disabled || selected.size === 0}
                onClick={use}
              >
                Use {selected.size} selected recipient{selected.size === 1 ? '' : 's'}
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default PayByLocationRecipientPicker;
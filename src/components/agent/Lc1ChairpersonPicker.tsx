import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, ShieldCheck, Search, Loader2, X, UserPlus, ChevronDown } from 'lucide-react';
import { PhoneInput } from '@/components/ui/phone-input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { normalizeDistrict, districtWarning, regionLabel } from '@/lib/ugandaDistricts';

const REGIONS = [
  'Central', 'Eastern', 'Northern', 'Western',
  'Kampala', 'Wakiso', 'Mukono', 'Jinja', 'Mbale',
  'Mbarara', 'Gulu', 'Lira', 'Fort Portal', 'Masaka',
  'Entebbe', 'Nansana', 'Kira', 'Bweyogerere',
];

/**
 * The agent's LC1 chairperson choice for a listing.
 *  - mode "existing" → an LC1 already in the system (no bonus, no insert)
 *  - mode "new"      → a brand-new LC1 the agent is registering. On submit the
 *                      parent inserts it with registered_by = agent and triggers
 *                      the UGX 1,000 instant reward (UGX 4,000 on Ops verify).
 */
export interface Lc1Selection {
  mode: 'existing' | 'new';
  id?: string;
  name: string;
  phone: string;
  region?: string;
  district?: string;
  county?: string;
  sub_county?: string;
  parish?: string;
  town_council?: string;
  cell?: string;
  zone?: string;
  village: string;
}

interface Lc1Hit {
  id: string;
  name: string;
  phone: string;
  village: string | null;
  district: string | null;
  region: string | null;
  verified: boolean;
}

interface Lc1ChairpersonPickerProps {
  value: Lc1Selection | null;
  onChange: (value: Lc1Selection | null) => void;
  /** Pre-fill admin location from the property location captured earlier. */
  defaultRegion?: string;
  defaultDistrict?: string;
  defaultVillage?: string;
  /** Highlight missing required fields after a failed submit. */
  attempted?: boolean;
}

const emptyNew = (region = '', district = '', village = ''): Lc1Selection => ({
  mode: 'new',
  name: '',
  phone: '',
  region,
  district,
  county: '',
  sub_county: '',
  parish: '',
  town_council: '',
  cell: '',
  zone: '',
  village,
});

export function Lc1ChairpersonPicker({
  value,
  onChange,
  defaultRegion = '',
  defaultDistrict = '',
  defaultVillage = '',
  attempted = false,
}: Lc1ChairpersonPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Lc1Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const search = async () => {
    const q = query.trim();
    if (q.length < 2) {
      toast.error('Type at least 2 letters of the LC1 chairperson name');
      return;
    }
    setSearching(true);
    setSearchedOnce(true);
    try {
      const isPhone = /^[0-9+]/.test(q);
      let builder = supabase
        .from('lc1_chairpersons')
        .select('id, name, phone, village, district, region, verified')
        .order('verified', { ascending: false })
        .limit(10);
      builder = isPhone ? builder.ilike('phone', `%${q}%`) : builder.ilike('name', `%${q}%`);
      const { data, error } = await builder;
      if (error) throw error;
      setResults((data || []) as Lc1Hit[]);
    } catch (err) {
      console.error('[Lc1ChairpersonPicker] search failed:', err);
      toast.error('Could not search LC1 chairpersons');
    } finally {
      setSearching(false);
    }
  };

  const selectExisting = (hit: Lc1Hit) => {
    onChange({
      mode: 'existing',
      id: hit.id,
      name: hit.name,
      phone: hit.phone,
      region: hit.region || undefined,
      district: hit.district || undefined,
      village: hit.village || defaultVillage,
    });
  };

  const startNew = () => {
    const prefillName = query.trim() && !/^[0-9+]/.test(query.trim()) ? query.trim() : '';
    onChange({ ...emptyNew(defaultRegion, defaultDistrict, defaultVillage), name: prefillName });
    setShowAdmin(true);
  };

  const clearSelection = () => {
    onChange(null);
    setResults([]);
    setSearchedOnce(false);
  };

  const patchNew = (patch: Partial<Lc1Selection>) => {
    if (!value || value.mode !== 'new') return;
    onChange({ ...value, ...patch });
  };

  const invalid = (cond: boolean) => (attempted && cond ? 'border-destructive' : '');

  return (
    <div className="space-y-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-primary uppercase">LC1 Chairperson *</p>
      </div>

      {/* ── Search-first: find an LC1 already in the system ── */}
      {!value && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Search the chairperson in the system first. If they're not there, register them and
            earn <span className="font-semibold text-foreground">UGX 5,000</span> — paid in full
            after Landlord Ops verifies the chairperson.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Chairperson name or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
            />
            <Button type="button" variant="secondary" onClick={search} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {results.length > 0 && (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {results.map((hit) => (
                <button
                  type="button"
                  key={hit.id}
                  onClick={() => selectExisting(hit)}
                  className="w-full text-left p-2.5 rounded-lg border border-border bg-background hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{hit.name}</span>
                    {hit.verified ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-success shrink-0">
                        <ShieldCheck className="h-3.5 w-3.5" /> Verified
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground shrink-0">Pending</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{hit.phone}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {[hit.village, hit.district, hit.region].filter(Boolean).join(' · ') || 'No location on file'}
                  </p>
                </button>
              ))}
            </div>
          )}

          {searchedOnce && !searching && results.length === 0 && (
            <p className="text-xs text-muted-foreground">No LC1 chairperson found for that search.</p>
          )}

          <Button type="button" variant="outline" className="h-9 text-xs w-full" onClick={startNew}>
            <UserPlus className="h-4 w-4 mr-1.5" />
            Register a new LC1 chairperson (earn UGX 5,000)
          </Button>
        </div>
      )}

      {/* ── Existing LC1 selected ── */}
      {value?.mode === 'existing' && (
        <div className="p-2.5 rounded-lg border border-success/40 bg-success/5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-sm truncate flex items-center gap-1.5">
                {value.name}
              </p>
              <p className="text-xs text-muted-foreground">{value.phone}</p>
              <p className="text-[11px] text-muted-foreground">
                {[value.village, value.district, value.region].filter(Boolean).join(' · ') || 'No location on file'}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs shrink-0" onClick={clearSelection}>
              <X className="h-3.5 w-3.5 mr-1" /> Change
            </Button>
          </div>
        </div>
      )}

      {/* ── Register a new LC1 chairperson ── */}
      {value?.mode === 'new' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-primary">New LC1 chairperson</p>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelection}>
              ← Back to search
            </Button>
          </div>

          <div className="p-2 rounded-lg bg-chart-4/10 border border-chart-4/20 text-center">
            <p className="text-xs text-chart-4 font-semibold">
              💰 UGX 5,000 paid once Landlord Ops verifies (nothing paid upfront)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input
                placeholder="Chairperson name"
                value={value.name}
                onChange={(e) => patchNew({ name: e.target.value })}
                className={invalid(!value.name.trim())}
              />
            </div>
            <div>
              <Label className="text-xs">Phone *</Label>
              <PhoneInput
                placeholder="0771234567"
                value={value.phone}
                onChange={(v) => patchNew({ phone: v })}
                onContactPicked={({ name }) => {
                  if (name && !value.name.trim()) patchNew({ name });
                }}
              />
            </div>
          </div>

          {/* Uganda administrative structure */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Region *</Label>
              <Select value={value.region || ''} onValueChange={(v) => patchNew({ region: v })}>
                <SelectTrigger className={invalid(!value.region)}><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {REGIONS.map((r) => (
                    <SelectItem key={r} value={r}>{regionLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">District *</Label>
              <Input
                placeholder="District"
                value={value.district || ''}
                onChange={(e) => patchNew({ district: e.target.value })}
                onBlur={(e) => {
                  const normalized = normalizeDistrict(e.target.value);
                  if (normalized && normalized !== e.target.value.trim()) patchNew({ district: normalized });
                }}
                className={invalid(!(value.district || '').trim())}
              />
              {districtWarning(value.district || '') && (
                <p className="text-[10px] text-warning leading-tight mt-1">{districtWarning(value.district || '')}</p>
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs">Village / Zone *</Label>
            <Input
              placeholder="e.g. Kikaya Zone B"
              value={value.village}
              onChange={(e) => patchNew({ village: e.target.value })}
              className={invalid(!value.village.trim())}
            />
          </div>

          {/* Deeper admin levels — collapsed to keep it simple for ordinary agents */}
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdmin((s) => !s)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            >
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                More location detail {showAdmin ? '' : '(county, parish, cell…)'}
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showAdmin ? 'rotate-180' : ''}`} />
            </button>
            {showAdmin && (
              <div className="p-3 grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">County</Label>
                  <Input value={value.county || ''} onChange={(e) => patchNew({ county: e.target.value })} placeholder="County" />
                </div>
                <div>
                  <Label className="text-xs">Sub-county</Label>
                  <Input value={value.sub_county || ''} onChange={(e) => patchNew({ sub_county: e.target.value })} placeholder="Sub-county" />
                </div>
                <div>
                  <Label className="text-xs">Town council</Label>
                  <Input value={value.town_council || ''} onChange={(e) => patchNew({ town_council: e.target.value })} placeholder="Town council" />
                </div>
                <div>
                  <Label className="text-xs">Parish</Label>
                  <Input value={value.parish || ''} onChange={(e) => patchNew({ parish: e.target.value })} placeholder="Parish" />
                </div>
                <div>
                  <Label className="text-xs">Cell</Label>
                  <Input value={value.cell || ''} onChange={(e) => patchNew({ cell: e.target.value })} placeholder="Cell" />
                </div>
                <div>
                  <Label className="text-xs">Zone</Label>
                  <Input value={value.zone || ''} onChange={(e) => patchNew({ zone: e.target.value })} placeholder="Zone" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Validate an LC1 selection before listing. Returns an error string or null.
 */
export function validateLc1Selection(sel: Lc1Selection | null): string | null {
  if (!sel) return 'Search for the LC1 chairperson or register a new one';
  if (!sel.name.trim()) return 'LC1 chairperson name is required';
  if (!sel.phone.trim()) return 'LC1 chairperson phone is required';
  if (sel.mode === 'new') {
    if (!sel.region) return 'Select the LC1 chairperson region';
    if (!(sel.district || '').trim()) return 'Enter the LC1 chairperson district';
    if (!sel.village.trim()) return 'Enter the LC1 chairperson village / zone';
  }
  return null;
}
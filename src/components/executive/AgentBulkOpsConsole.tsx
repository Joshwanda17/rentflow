import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  ChevronLeft, Filter, FileUp, Layers, AlertTriangle, ShieldAlert, CheckCircle2, RefreshCw,
} from 'lucide-react';

/**
 * AgentBulkOpsConsole
 * --------------------------------------------------------------------
 * Million-agent scale console to enable/disable functions across:
 *   1. SEGMENT  — server-side resolver across tier/region/district/
 *                 territory/frozen/inactivity/capability filters.
 *   2. CSV      — paste or upload a list of agent IDs, phones, or
 *                 emails; server matches and reports unmatched.
 *
 * Both modes feed the same "Apply" step which calls
 * ops_bulk_apply_capabilities (server chunks 5 000 agents per batch).
 */

const ALL_CAPABILITIES = [
  { key: 'view_agent_dashboard', label: 'View dashboard',     risk: 'low' as const },
  { key: 'collect_rent',         label: 'Collect rent',       risk: 'high' as const },
  { key: 'request_float',        label: 'Request float',      risk: 'high' as const },
  { key: 'process_cash_out',     label: 'Process cash-out',   risk: 'high' as const },
  { key: 'act_as_proxy',         label: 'Act as proxy',       risk: 'high' as const },
  { key: 'onboard_tenants',      label: 'Onboard tenants',    risk: 'med' as const },
  { key: 'onboard_landlords',    label: 'Onboard landlords',  risk: 'med' as const },
  { key: 'capture_supporters',   label: 'Capture supporters', risk: 'med' as const },
  { key: 'manage_subagents',     label: 'Manage sub-agents',  risk: 'med' as const },
  { key: 'approve_subagents',    label: 'Approve sub-agents', risk: 'med' as const },
  { key: 'view_subagent_data',   label: 'View sub-agent data',risk: 'low' as const },
];

type Tier = 'probation' | 'collector' | 'full_agent' | 'senior' | 'suspended';
const TIERS: Tier[] = ['probation','collector','full_agent','senior','suspended'];

interface ResolvedSet {
  source: 'segment' | 'csv';
  agentIds: string[];
  count: number;
  sample: Array<{ agent_id: string; full_name: string|null; phone: string|null; tier: string|null; is_frozen: boolean; last_active_at: string|null }>;
  unmatched?: string[];
}

export function AgentBulkOpsConsole({ onBack }: { onBack?: () => void }) {
  const [resolved, setResolved] = useState<ResolvedSet | null>(null);
  const [selectedCaps, setSelectedCaps] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<'enable'|'disable'>('disable');
  const [reason, setReason] = useState('');
  const [confirmCount, setConfirmCount] = useState('');

  const toggleCap = (k: string) => {
    setSelectedCaps(prev => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  };

  const apply = useMutation({
    mutationFn: async () => {
      if (!resolved) throw new Error('Resolve a segment or import a CSV first');
      if (selectedCaps.size === 0) throw new Error('Pick at least one function');
      if (reason.trim().length < 10) throw new Error('Reason must be at least 10 characters');
      if (resolved.count > 1000 && Number(confirmCount) !== resolved.count) {
        throw new Error(`Type the count (${resolved.count}) to confirm large changes`);
      }
      const { data, error } = await supabase.rpc('ops_bulk_apply_capabilities', {
        _agent_ids: resolved.agentIds,
        _capabilities: Array.from(selectedCaps),
        _action: action,
        _reason: reason.trim(),
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (r) => {
      toast.success(`Applied ${action} on ${r?.affected_total ?? 0} agent-capability pairs`);
      setResolved(null);
      setSelectedCaps(new Set());
      setReason('');
      setConfirmCount('');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed'),
  });

  const highRiskPicked = useMemo(
    () => Array.from(selectedCaps).some(k => ALL_CAPABILITIES.find(c => c.key === k)?.risk === 'high'),
    [selectedCaps],
  );

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        )}
        <Layers className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-bold">Bulk Ops Console</h2>
          <p className="text-xs text-muted-foreground">
            Enable or disable functions across thousands of agents at once. Server chunks 5 000 agents per batch.
          </p>
        </div>
      </div>

      {/* Step 1 – build the agent set */}
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          1 · Build the target set
        </p>
        <Tabs defaultValue="segment">
          <TabsList>
            <TabsTrigger value="segment"><Filter className="h-3 w-3 mr-1" /> Segment</TabsTrigger>
            <TabsTrigger value="csv"><FileUp className="h-3 w-3 mr-1" /> CSV / paste list</TabsTrigger>
          </TabsList>
          <TabsContent value="segment" className="mt-3">
            <SegmentForm onResolved={setResolved} />
          </TabsContent>
          <TabsContent value="csv" className="mt-3">
            <CsvForm onResolved={setResolved} />
          </TabsContent>
        </Tabs>
      </Card>

      {/* Resolved preview */}
      {resolved && (
        <Card className="p-4 border-primary/40 bg-primary/5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">
              {resolved.count.toLocaleString()} agents matched
              {resolved.unmatched && resolved.unmatched.length > 0 && (
                <span className="text-destructive ml-2">· {resolved.unmatched.length} unmatched</span>
              )}
            </p>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => setResolved(null)}>
              <RefreshCw className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>
          {resolved.sample.length > 0 && (
            <div className="text-xs space-y-1 max-h-40 overflow-y-auto">
              {resolved.sample.slice(0, 25).map(s => (
                <div key={s.agent_id} className="flex justify-between gap-2 border-b last:border-b-0 py-1">
                  <span className="truncate">{s.full_name ?? s.agent_id.slice(0,8)}</span>
                  <span className="text-muted-foreground truncate">{s.phone ?? '—'}</span>
                  <Badge variant="outline" className="text-[9px] capitalize">{(s.tier ?? 'unset').replace('_',' ')}</Badge>
                </div>
              ))}
              {resolved.count > 25 && (
                <p className="text-muted-foreground italic">…and {(resolved.count - 25).toLocaleString()} more</p>
              )}
            </div>
          )}
          {resolved.unmatched && resolved.unmatched.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-destructive">
                Show {resolved.unmatched.length} unmatched identifier{resolved.unmatched.length === 1 ? '' : 's'}
              </summary>
              <pre className="bg-muted/50 p-2 mt-1 rounded max-h-32 overflow-auto whitespace-pre-wrap">
                {resolved.unmatched.join('\n')}
              </pre>
            </details>
          )}
        </Card>
      )}

      {/* Step 2 – functions + action */}
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          2 · Pick function(s) and action
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {ALL_CAPABILITIES.map(c => (
            <label key={c.key} className="flex items-center justify-between gap-2 p-2 rounded border cursor-pointer">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{c.label}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{c.key}</p>
              </div>
              <Badge variant={c.risk === 'high' ? 'destructive' : c.risk === 'med' ? 'default' : 'secondary'} className="text-[9px]">
                {c.risk}
              </Badge>
              <Switch
                checked={selectedCaps.has(c.key)}
                onCheckedChange={() => toggleCap(c.key)}
              />
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm">Action:</label>
          <Select value={action} onValueChange={(v) => setAction(v as 'enable'|'disable')}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="enable">Enable</SelectItem>
              <SelectItem value="disable">Disable</SelectItem>
            </SelectContent>
          </Select>
          {highRiskPicked && (
            <span className="flex items-center text-xs text-destructive gap-1">
              <ShieldAlert className="h-3 w-3" /> High-risk function selected
            </span>
          )}
        </div>
      </Card>

      {/* Step 3 – reason + confirm */}
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          3 · Reason &amp; confirm
        </p>
        <Textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={2}
          placeholder="e.g. Region-wide suspension pending KYC sweep on 2026-04-29"
        />
        {resolved && resolved.count > 1000 && (
          <div className="mt-3">
            <label className="text-xs flex items-center gap-1 text-destructive font-semibold">
              <AlertTriangle className="h-3 w-3" /> Large batch — type {resolved.count} to confirm
            </label>
            <Input
              value={confirmCount}
              onChange={e => setConfirmCount(e.target.value)}
              placeholder={String(resolved.count)}
              className="mt-1"
            />
          </div>
        )}
        <Button
          className="w-full mt-3"
          disabled={apply.isPending || !resolved || selectedCaps.size === 0}
          onClick={() => apply.mutate()}
        >
          {apply.isPending
            ? 'Applying…'
            : `${action === 'enable' ? 'Enable' : 'Disable'} ${selectedCaps.size} function${selectedCaps.size === 1 ? '' : 's'} on ${resolved?.count.toLocaleString() ?? 0} agents`}
        </Button>
      </Card>
    </div>
  );
}

/* =====================================================================
 * Segment form
 * ===================================================================*/
function SegmentForm({ onResolved }: { onResolved: (r: ResolvedSet) => void }) {
  const [tier, setTier] = useState<Tier | 'all'>('all');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [territory, setTerritory] = useState('');
  const [frozen, setFrozen] = useState<'any'|'frozen'|'active'>('any');
  const [inactiveDays, setInactiveDays] = useState('');
  const [hasCap, setHasCap] = useState<string>('');
  const [missingCap, setMissingCap] = useState<string>('');

  const resolve = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('ops_resolve_agent_segment', {
        _tier: tier === 'all' ? null : tier,
        _region: region.trim() || null,
        _district: district.trim() || null,
        _territory: territory.trim() || null,
        _frozen: frozen === 'any' ? null : frozen === 'frozen',
        _inactive_days: inactiveDays ? Number(inactiveDays) : null,
        _has_capability: hasCap || null,
        _missing_capability: missingCap || null,
        _limit_preview: 50,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (d) => {
      onResolved({
        source: 'segment',
        agentIds: d?.agent_ids ?? [],
        count: Number(d?.count ?? 0),
        sample: d?.sample ?? [],
      });
      toast.success(`Found ${Number(d?.count ?? 0).toLocaleString()} agents`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Resolve failed'),
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
      <Select value={tier} onValueChange={(v) => setTier(v as Tier | 'all')}>
        <SelectTrigger><SelectValue placeholder="Tier" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All tiers</SelectItem>
          {TIERS.map(t => <SelectItem key={t} value={t}>{t.replace('_',' ')}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input placeholder="Region (exact)" value={region} onChange={e => setRegion(e.target.value)} />
      <Input placeholder="District (exact)" value={district} onChange={e => setDistrict(e.target.value)} />
      <Input placeholder="Territory (exact)" value={territory} onChange={e => setTerritory(e.target.value)} />
      <Select value={frozen} onValueChange={(v) => setFrozen(v as any)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any status</SelectItem>
          <SelectItem value="frozen">Frozen only</SelectItem>
          <SelectItem value="active">Active only</SelectItem>
        </SelectContent>
      </Select>
      <Input
        placeholder="Inactive ≥ N days"
        type="number"
        value={inactiveDays}
        onChange={e => setInactiveDays(e.target.value)}
      />
      <Select value={hasCap || 'none'} onValueChange={(v) => setHasCap(v === 'none' ? '' : v)}>
        <SelectTrigger><SelectValue placeholder="Has function (optional)" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Has function —</SelectItem>
          {ALL_CAPABILITIES.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={missingCap || 'none'} onValueChange={(v) => setMissingCap(v === 'none' ? '' : v)}>
        <SelectTrigger><SelectValue placeholder="Missing function (optional)" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Missing function —</SelectItem>
          {ALL_CAPABILITIES.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button onClick={() => resolve.mutate()} disabled={resolve.isPending} className="md:col-span-3">
        {resolve.isPending ? 'Resolving…' : 'Resolve segment'}
      </Button>
    </div>
  );
}

/* =====================================================================
 * CSV / paste form
 * ===================================================================*/
function CsvForm({ onResolved }: { onResolved: (r: ResolvedSet) => void }) {
  const [text, setText] = useState('');

  const parseItems = (raw: string): string[] => {
    return raw
      .split(/[\s,;\n\r\t]+/)
      .map(s => s.trim())
      .filter(Boolean);
  };

  const onFile = async (file: File) => {
    const t = await file.text();
    setText(t);
  };

  const resolve = useMutation({
    mutationFn: async () => {
      const items = parseItems(text);
      if (items.length === 0) throw new Error('Paste or upload at least one identifier');
      if (items.length > 200_000) throw new Error('Cap is 200 000 identifiers per import');
      const { data, error } = await supabase.rpc('ops_resolve_agents_by_identifier', { _items: items });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (d) => {
      const matched = (d?.matched ?? []) as Array<any>;
      onResolved({
        source: 'csv',
        agentIds: matched.map(m => m.agent_id),
        count: matched.length,
        sample: matched.slice(0, 50).map(m => ({
          agent_id: m.agent_id,
          full_name: m.full_name,
          phone: m.phone,
          tier: null,
          is_frozen: false,
          last_active_at: null,
        })),
        unmatched: d?.unmatched ?? [],
      });
      toast.success(`Matched ${matched.length} · unmatched ${(d?.unmatched ?? []).length}`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Resolve failed'),
  });

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Paste one identifier per line or upload a CSV. Accepts agent IDs (UUID), phone numbers, or emails.
      </p>
      <Textarea
        rows={6}
        placeholder={'+256700123456\n+256700123457\nagent@example.com\n9c2d…'}
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          type="file"
          accept=".csv,.txt"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          className="max-w-xs"
        />
        <span className="text-xs text-muted-foreground">
          {parseItems(text).length.toLocaleString()} identifier{parseItems(text).length === 1 ? '' : 's'}
        </span>
        <div className="flex-1" />
        <Button onClick={() => resolve.mutate()} disabled={resolve.isPending}>
          {resolve.isPending ? 'Resolving…' : 'Resolve list'}
        </Button>
      </div>
    </div>
  );
}

export default AgentBulkOpsConsole;
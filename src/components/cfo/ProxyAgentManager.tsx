import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Handshake, UserPlus, Loader2, Smartphone, ShieldCheck, Pencil, Trash2, Users, UserCheck, Building, Search, Layers, X, ArrowRightLeft } from 'lucide-react';
import { UserSearchPicker } from './UserSearchPicker';
import { format } from 'date-fns';

/**
 * Build a normalized identity key for deduplication.
 * Same human shouldn't be assigned twice when filters overlap (re-registered
 * profiles often share a phone number or national ID).
 * Returns null when no usable identifier exists — caller falls back to profile id only.
 */
function dedupeKey(p: any): string | null {
  if (!p) return null;
  const digits = (p.phone || '').toString().replace(/\D+/g, '');
  // Last 9 digits handle MSISDN prefix variations (256xxx vs 0xxx).
  const phoneKey = digits ? `p:${digits.slice(-9)}` : '';
  const nid = (p.national_id || p.nida_no || p.reference_id || '').toString().trim().toLowerCase();
  const nidKey = nid ? `n:${nid}` : '';
  return phoneKey || nidKey || null;
}

export function ProxyAgentManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [pickedAgent, setPickedAgent] = useState<any>(null);
  const [pickedBeneficiary, setPickedBeneficiary] = useState<any>(null);
  const [beneficiaryRole, setBeneficiaryRole] = useState('landlord');
  const [reason, setReason] = useState('No smartphone access');
  const [isManagedAccount, setIsManagedAccount] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);

  // ─── Bulk assign state ───
  const [showBulk, setShowBulk] = useState(false);
  const [bulkAgent, setBulkAgent] = useState<any>(null);
  const [bulkBeneficiaries, setBulkBeneficiaries] = useState<any[]>([]);
  const [bulkRole, setBulkRole] = useState('supporter');
  const [bulkReason, setBulkReason] = useState('Bulk assignment by Partner Ops');
  const [bulkManaged, setBulkManaged] = useState(false);
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkFilter, setBulkFilter] = useState<'all' | 'assigned_other' | 'unassigned' | 'managed'>('all');
  // Extra filters
  const [bulkFromAgent, setBulkFromAgent] = useState<string>('any'); // 'any' | prior agent id
  const [bulkRequirePhone, setBulkRequirePhone] = useState(false);
  // Deduplicate partners that share the same phone / national id / reference.
  // Defaults ON: prevents the same human from being linked twice when filters overlap.
  const [bulkDedupe, setBulkDedupe] = useState(true);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['proxy-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proxy_agent_assignments')
        .select('*, agent:agent_id(full_name, phone), beneficiary:beneficiary_id(full_name, phone)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  /** Map: beneficiary_id → active proxy assignment (one per partner is the contract). */
  const assignmentByBeneficiary = useMemo(() => {
    const m = new Map<string, any>();
    assignments.forEach((a: any) => { m.set(a.beneficiary_id, a); });
    return m;
  }, [assignments]);

  /** Pool of selectable partners, scoped to the role we are bulk-assigning. */
  const { data: bulkPool = [], isLoading: bulkPoolLoading } = useQuery({
    queryKey: ['bulk-proxy-pool', bulkRole],
    enabled: showBulk,
    queryFn: async () => {
      // Paginate through ALL role members (PostgREST caps single requests at 1000).
      const pageSize = 1000;
      const all: any[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from('user_roles')
          .select('user_id, profiles:user_id(id, full_name, phone)')
          .eq('role', bulkRole as any)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = data || [];
        all.push(...batch);
        if (batch.length < pageSize) break;
      }
      return all
        .map((r: any) => r.profiles)
        .filter((p: any) => p && p.id && p.full_name);
    },
  });

  const filteredBulkPool = useMemo(() => {
    const q = bulkSearch.trim().toLowerCase();
    const passed = bulkPool.filter((p: any) => {
      const current = assignmentByBeneficiary.get(p.id);
      if (bulkFilter === 'assigned_other') {
        if (!current) return false;
        if (bulkAgent && current.agent_id === bulkAgent.id) return false;
      } else if (bulkFilter === 'unassigned') {
        if (current) return false;
      } else if (bulkFilter === 'managed') {
        if (!current?.is_managed_account) return false;
      }
      // "From agent" — partners currently held by this specific prior agent.
      if (bulkFromAgent !== 'any') {
        if (!current || current.agent_id !== bulkFromAgent) return false;
      }
      if (bulkRequirePhone && !p.phone) return false;
      if (!q) return true;
      return (
        p.full_name?.toLowerCase().includes(q) ||
        p.phone?.toLowerCase().includes(q)
      );
    });
    // Always collapse duplicate ids (same profile surfacing twice from joined rows).
    // When bulkDedupe is ON, also collapse by phone / national_id so the same human
    // (e.g. one profile per landlord that re-registered) only appears once.
    const seenId = new Set<string>();
    const seenDedupe = new Set<string>();
    const out: any[] = [];
    for (const p of passed) {
      if (seenId.has(p.id)) continue;
      seenId.add(p.id);
      if (bulkDedupe) {
        const key = dedupeKey(p);
        if (key && seenDedupe.has(key)) continue;
        if (key) seenDedupe.add(key);
      }
      out.push(p);
    }
    return out;
  }, [bulkPool, bulkSearch, bulkFilter, assignmentByBeneficiary, bulkAgent, bulkFromAgent, bulkRequirePhone, bulkDedupe]);

  /** How many partners were hidden as duplicates of another row in the current view. */
  const dedupeHiddenCount = useMemo(() => {
    if (!bulkDedupe) return 0;
    // Count rows that would have passed the filters but were collapsed.
    const seenId = new Set<string>();
    const seenDedupe = new Set<string>();
    let hidden = 0;
    for (const p of bulkPool) {
      const current = assignmentByBeneficiary.get(p.id);
      if (bulkFilter === 'assigned_other') {
        if (!current) continue;
        if (bulkAgent && current.agent_id === bulkAgent.id) continue;
      } else if (bulkFilter === 'unassigned') {
        if (current) continue;
      } else if (bulkFilter === 'managed') {
        if (!current?.is_managed_account) continue;
      }
      if (bulkFromAgent !== 'any' && (!current || current.agent_id !== bulkFromAgent)) continue;
      if (bulkRequirePhone && !p.phone) continue;
      if (seenId.has(p.id)) { hidden++; continue; }
      seenId.add(p.id);
      const key = dedupeKey(p);
      if (key && seenDedupe.has(key)) { hidden++; continue; }
      if (key) seenDedupe.add(key);
    }
    return hidden;
  }, [bulkPool, bulkDedupe, bulkFilter, bulkFromAgent, bulkRequirePhone, assignmentByBeneficiary, bulkAgent]);

  /** Counts for filter chips. Computed against the whole role-pool, ignoring the chip itself. */
  const filterCounts = useMemo(() => {
    let unassigned = 0, assignedOther = 0, managed = 0;
    bulkPool.forEach((p: any) => {
      const cur = assignmentByBeneficiary.get(p.id);
      if (!cur) unassigned++;
      else {
        if (!bulkAgent || cur.agent_id !== bulkAgent.id) assignedOther++;
        if (cur.is_managed_account) managed++;
      }
    });
    return { all: bulkPool.length, unassigned, assignedOther, managed };
  }, [bulkPool, assignmentByBeneficiary, bulkAgent]);

  /** Prior agents represented in the pool, with counts — drives the "From agent" picker. */
  const priorAgentOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    bulkPool.forEach((p: any) => {
      const cur = assignmentByBeneficiary.get(p.id);
      if (!cur) return;
      const name = cur.agent?.full_name || cur.agent?.phone || 'Unknown agent';
      const slot = map.get(cur.agent_id) || { id: cur.agent_id, name, count: 0 };
      slot.count++;
      map.set(cur.agent_id, slot);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [bulkPool, assignmentByBeneficiary]);

  const selectedIds = useMemo(
    () => new Set(bulkBeneficiaries.map((b) => b.id)),
    [bulkBeneficiaries],
  );
  const allFilteredSelected =
    filteredBulkPool.length > 0 &&
    filteredBulkPool.every((p: any) => selectedIds.has(p.id));
  const moveCount = useMemo(
    () =>
      bulkBeneficiaries.filter((b) => {
        const cur = assignmentByBeneficiary.get(b.id);
        return cur && bulkAgent && cur.agent_id !== bulkAgent.id;
      }).length,
    [bulkBeneficiaries, assignmentByBeneficiary, bulkAgent],
  );

  /** Breakdown for the pre-submit confirmation dialog. */
  const bulkBreakdown = useMemo(() => {
    const newLinks: any[] = [];
    const reLinks: any[] = []; // already on the same agent (no-op / reactivation)
    const moves: Array<{ partner: any; priorAgentName: string; priorAgentId: string }> = [];
    const byPriorAgent = new Map<string, { name: string; partners: any[] }>();
    bulkBeneficiaries.forEach((b) => {
      const cur = assignmentByBeneficiary.get(b.id);
      if (!cur) {
        newLinks.push(b);
      } else if (bulkAgent && cur.agent_id === bulkAgent.id) {
        reLinks.push(b);
      } else {
        const priorName = cur.agent?.full_name || cur.agent?.phone || 'Unknown agent';
        moves.push({ partner: b, priorAgentName: priorName, priorAgentId: cur.agent_id });
        const slot = byPriorAgent.get(cur.agent_id) || { name: priorName, partners: [] };
        slot.partners.push(b);
        byPriorAgent.set(cur.agent_id, slot);
      }
    });
    return { newLinks, reLinks, moves, byPriorAgent: Array.from(byPriorAgent.entries()) };
  }, [bulkBeneficiaries, assignmentByBeneficiary, bulkAgent]);

  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  /** Infinite-scroll window into filteredBulkPool. */
  const PAGE = 100;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset window when the filter inputs or the dialog change.
  useEffect(() => {
    setVisibleCount(PAGE);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [bulkSearch, bulkFilter, bulkRole, showBulk, bulkFromAgent, bulkRequirePhone]);

  const filteredAssignments = useMemo(() => {
    if (!searchTerm.trim()) return assignments;
    const q = searchTerm.toLowerCase();
    return assignments.filter((a: any) =>
      a.agent?.full_name?.toLowerCase().includes(q) ||
      a.agent?.phone?.toLowerCase().includes(q) ||
      a.beneficiary?.full_name?.toLowerCase().includes(q) ||
      a.beneficiary?.phone?.toLowerCase().includes(q) ||
      a.reason?.toLowerCase().includes(q)
    );
  }, [assignments, searchTerm]);

  const uniqueAgents = new Set(assignments.map((a: any) => a.agent_id)).size;
  const uniquePartners = new Set(assignments.map((a: any) => a.beneficiary_id)).size;
  const managedCount = assignments.filter((a: any) => a.is_managed_account).length;

  const resetForm = () => {
    setPickedAgent(null);
    setPickedBeneficiary(null);
    setBeneficiaryRole('landlord');
    setReason('No smartphone access');
    setIsManagedAccount(false);
    setEditingAssignment(null);
  };

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!pickedAgent) throw new Error('Please select an agent');
      if (!pickedBeneficiary) throw new Error('Please select a beneficiary');
      const nowIso = new Date().toISOString();
      const payload = {
        agent_id: pickedAgent.id,
        beneficiary_id: pickedBeneficiary.id,
        beneficiary_role: beneficiaryRole,
        assigned_by: user!.id,
        reason,
        is_managed_account: isManagedAccount,
        // Partner Ops owns this flow — assignments are auto-approved at source.
        approval_status: 'approved',
        approved_by: user!.id,
        approved_at: nowIso,
      };

      const { data: existingAssignment, error: existingError } = await supabase
        .from('proxy_agent_assignments')
        .select('id, approval_status')
        .eq('agent_id', pickedAgent.id)
        .eq('beneficiary_id', pickedBeneficiary.id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existingAssignment) {
        const { error } = await supabase
          .from('proxy_agent_assignments')
          .update({
            beneficiary_role: beneficiaryRole,
            assigned_by: user!.id,
            reason,
            is_managed_account: isManagedAccount,
            is_active: true,
            approval_status: 'approved',
            rejection_reason: null,
            approved_by: user!.id,
            approved_at: nowIso,
          })
          .eq('id', existingAssignment.id);

        if (error) throw error;
        return { reactivated: true };
      }

      const { error } = await supabase.from('proxy_agent_assignments').insert(payload);
      if (error) throw error;

      return { reactivated: false };
    },
    onSuccess: (result) => {
      toast({ title: result?.reactivated ? '✅ Proxy agent re-linked' : '✅ Proxy agent linked' });
      qc.invalidateQueries({ queryKey: ['proxy-assignments'] });
      setShowAssign(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // ─── Bulk Assign: one agent ⇄ many beneficiaries ───
  const resetBulkForm = () => {
    setBulkAgent(null);
    setBulkBeneficiaries([]);
    setBulkRole('supporter');
    setBulkReason('Bulk assignment by Partner Ops');
    setBulkManaged(false);
    setBulkSearch('');
    setBulkFilter('all');
    setBulkFromAgent('any');
    setBulkRequirePhone(false);
    setBulkDedupe(true);
  };

  const bulkAssignMutation = useMutation({
    mutationFn: async () => {
      if (!bulkAgent) throw new Error('Please select an agent');
      if (bulkBeneficiaries.length === 0) throw new Error('Add at least one partner');
      const nowIso = new Date().toISOString();
      const results = { inserted: 0, reactivated: 0, moved: 0, failed: 0 };
      const auditRows: any[] = [];

      for (const b of bulkBeneficiaries) {
        try {
          // ── 1) Move: deactivate any OTHER active proxy holding this partner.
          //    Fetch the prior agent (with name) so we can write a from/to audit row.
          const { data: others, error: othersErr } = await supabase
            .from('proxy_agent_assignments')
            .select('id, agent_id, is_managed_account, agent:agent_id(full_name, phone)')
            .eq('beneficiary_id', b.id)
            .eq('is_active', true)
            .neq('agent_id', bulkAgent.id);
          if (othersErr) throw othersErr;
          const priorAgents = (others || []).map((o: any) => ({
            assignment_id: o.id,
            agent_id: o.agent_id,
            agent_name: o.agent?.full_name || o.agent?.phone || null,
            was_managed: !!o.is_managed_account,
          }));
          if (others && others.length > 0) {
            const { error: deactErr } = await supabase
              .from('proxy_agent_assignments')
              .update({ is_active: false })
              .in('id', others.map((o: any) => o.id));
            if (deactErr) throw deactErr;
            results.moved++;
          }

          // ── 2) Upsert assignment for (bulkAgent, beneficiary).
          const { data: existing } = await supabase
            .from('proxy_agent_assignments')
            .select('id')
            .eq('agent_id', bulkAgent.id)
            .eq('beneficiary_id', b.id)
            .maybeSingle();

          if (existing) {
            const { error } = await supabase
              .from('proxy_agent_assignments')
              .update({
                beneficiary_role: bulkRole,
                assigned_by: user!.id,
                reason: bulkReason,
                is_managed_account: bulkManaged,
                is_active: true,
                approval_status: 'approved',
                rejection_reason: null,
                approved_by: user!.id,
                approved_at: nowIso,
              })
              .eq('id', existing.id);
            if (error) throw error;
            results.reactivated++;
          } else {
            const { error } = await supabase.from('proxy_agent_assignments').insert({
              agent_id: bulkAgent.id,
              beneficiary_id: b.id,
              beneficiary_role: bulkRole,
              assigned_by: user!.id,
              reason: bulkReason,
              is_managed_account: bulkManaged,
              approval_status: 'approved',
              approved_by: user!.id,
              approved_at: nowIso,
            });
            if (error) throw error;
            results.inserted++;
          }

          // ── 3) Audit: one row per partner capturing from/to agent context.
          auditRows.push({
            user_id: user!.id,
            action_type: priorAgents.length > 0 ? 'proxy_bulk_move' : 'proxy_bulk_link',
            table_name: 'proxy_agent_assignments',
            record_id: b.id,
            metadata: {
              reason: bulkReason,
              beneficiary_id: b.id,
              beneficiary_name: b.full_name || null,
              beneficiary_phone: b.phone || null,
              beneficiary_role: bulkRole,
              to_agent_id: bulkAgent.id,
              to_agent_name: bulkAgent.full_name || bulkAgent.phone || null,
              to_is_managed_account: bulkManaged,
              from_agents: priorAgents, // [] when this is a brand-new link
              moved_from_prior: priorAgents.length > 0,
              source: 'ProxyAgentManager.bulkAssign',
              at: nowIso,
            },
          });
        } catch (e) {
          console.error('[bulkAssign] failed for', b, e);
          results.failed++;
        }
      }

      // Fire-and-forget audit insert (chunked to stay under PostgREST payload limits).
      if (auditRows.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < auditRows.length; i += CHUNK) {
          const { error: auditErr } = await supabase
            .from('audit_logs')
            .insert(auditRows.slice(i, i + CHUNK));
          if (auditErr) console.error('[bulkAssign] audit log insert failed', auditErr);
        }
      }

      return results;
    },
    onSuccess: (r) => {
      const parts: string[] = [];
      if (r.inserted) parts.push(`${r.inserted} linked`);
      if (r.reactivated) parts.push(`${r.reactivated} re-linked`);
      if (r.moved) parts.push(`${r.moved} moved from prior agent`);
      if (r.failed) parts.push(`${r.failed} failed`);
      toast({
        title: '✅ Bulk assignment complete',
        description: parts.join(' • ') || 'No changes',
        variant: r.failed && !r.inserted && !r.reactivated && !r.moved ? 'destructive' : 'default',
      });
      qc.invalidateQueries({ queryKey: ['proxy-assignments'] });
      setShowBulk(false);
      resetBulkForm();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const toggleBulkBeneficiary = (u: any) =>
    setBulkBeneficiaries((prev) => {
      if (prev.some((x) => x.id === u.id)) {
        return prev.filter((x) => x.id !== u.id);
      }
      if (bulkDedupe) {
        const key = dedupeKey(u);
        if (key && prev.some((x) => dedupeKey(x) === key)) {
          toast({
            title: 'Duplicate skipped',
            description: `${u.full_name || 'This partner'} shares a phone / ID with another selected partner.`,
          });
          return prev;
        }
      }
      return [...prev, u];
    });
  const removeBulkBeneficiary = (id: string) =>
    setBulkBeneficiaries((prev) => prev.filter((b) => b.id !== id));
  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const idsToRemove = new Set(filteredBulkPool.map((p: any) => p.id));
      setBulkBeneficiaries((prev) => prev.filter((b) => !idsToRemove.has(b.id)));
    } else {
      const existing = new Map(bulkBeneficiaries.map((b) => [b.id, b]));
      const seenDedupe = new Set<string>();
      if (bulkDedupe) {
        bulkBeneficiaries.forEach((b) => {
          const k = dedupeKey(b);
          if (k) seenDedupe.add(k);
        });
      }
      filteredBulkPool.forEach((p: any) => {
        if (existing.has(p.id)) return;
        if (bulkDedupe) {
          const k = dedupeKey(p);
          if (k) {
            if (seenDedupe.has(k)) return;
            seenDedupe.add(k);
          }
        }
        existing.set(p.id, p);
      });
      setBulkBeneficiaries(Array.from(existing.values()));
    }
  };

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingAssignment) throw new Error('No assignment selected');
      const { error } = await supabase.from('proxy_agent_assignments').update({
        beneficiary_role: beneficiaryRole,
        reason,
        is_managed_account: isManagedAccount,
      }).eq('id', editingAssignment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: '✅ Assignment updated' });
      qc.invalidateQueries({ queryKey: ['proxy-assignments'] });
      setShowAssign(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('proxy_agent_assignments').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Proxy assignment deactivated' });
      qc.invalidateQueries({ queryKey: ['proxy-assignments'] });
    },
  });

  const openEdit = (a: any) => {
    setEditingAssignment(a);
    setBeneficiaryRole(a.beneficiary_role || 'landlord');
    setReason(a.reason || '');
    setIsManagedAccount(a.is_managed_account || false);
    setShowAssign(true);
  };

  const handleDelete = (a: any) => {
    if (window.confirm(`Deactivate proxy link: ${a.agent?.full_name} → ${a.beneficiary?.full_name}?`)) {
      deactivateMutation.mutate(a.id);
    }
  };

  const kpis = [
    { label: 'Total Assignments', value: assignments.length, icon: Handshake, color: 'text-primary' },
    { label: 'Unique Agents', value: uniqueAgents, icon: Users, color: 'text-blue-500' },
    { label: 'Partners Assigned', value: uniquePartners, icon: UserCheck, color: 'text-green-500' },
    { label: 'Managed Accounts', value: managedCount, icon: Building, color: 'text-amber-500' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Handshake className="h-5 w-5 text-primary" />
          Proxy Agents
        </h2>
        <div className="flex items-center gap-2">
        <Dialog open={showBulk} onOpenChange={v => { setShowBulk(v); if (!v) resetBulkForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Layers className="h-4 w-4" /> Bulk Assign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Bulk Assign Partners to Agent</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Pick one agent, search/filter the partner pool, multi-select, and link.
              Partners already attached to a different proxy agent will be automatically
              moved over.
            </p>
            <div className="space-y-3">
              <UserSearchPicker
                label="Agent"
                placeholder="Search agent by name or phone..."
                selectedUser={bulkAgent}
                onSelect={setBulkAgent}
                roleFilter="agent"
              />
              <div>
                <Label>Beneficiary Role</Label>
                <Select value={bulkRole} onValueChange={setBulkRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="landlord">🏠 Landlord</SelectItem>
                    <SelectItem value="supporter">💼 Partner/Funder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm">
                    Partners ({bulkBeneficiaries.length} selected
                    {moveCount > 0 && (
                      <span className="ml-1 text-amber-600 dark:text-amber-400">
                        · {moveCount} will be moved
                      </span>
                    )})
                  </Label>
                  {bulkBeneficiaries.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setBulkBeneficiaries([])}
                    >
                      Clear
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or phone..."
                      value={bulkSearch}
                      onChange={(e) => setBulkSearch(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>
                  <Select value={bulkFilter} onValueChange={(v) => setBulkFilter(v as any)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All partners ({filterCounts.all})</SelectItem>
                      <SelectItem value="unassigned">Unassigned only ({filterCounts.unassigned})</SelectItem>
                      <SelectItem value="assigned_other">On another agent ({filterCounts.assignedOther})</SelectItem>
                      <SelectItem value="managed">Managed accounts ({filterCounts.managed})</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Secondary filters: pick a specific prior agent + require phone */}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <Select value={bulkFromAgent} onValueChange={setBulkFromAgent}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="From agent (any)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">From any agent</SelectItem>
                      {priorAgentOptions.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          No prior assignments in this pool
                        </div>
                      ) : (
                        priorAgentOptions.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.name} ({opt.count})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => setBulkRequirePhone((v) => !v)}
                    className={`h-9 px-3 rounded-md border text-xs font-medium transition-colors ${
                      bulkRequirePhone
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {bulkRequirePhone ? '✓ Has phone' : 'Has phone'}
                  </button>
                </div>

                {/* Deduplication toggle — collapses partners sharing phone / national id */}
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium">Deduplicate by phone / ID</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Prevent the same person from being linked twice when filters overlap.
                      {bulkDedupe && dedupeHiddenCount > 0 && (
                        <span className="ml-1 text-amber-600 dark:text-amber-400">
                          {dedupeHiddenCount} duplicate{dedupeHiddenCount === 1 ? '' : 's'} hidden
                        </span>
                      )}
                    </p>
                  </div>
                  <Switch checked={bulkDedupe} onCheckedChange={setBulkDedupe} />
                </div>

                {(bulkFromAgent !== 'any' || bulkRequirePhone || bulkFilter !== 'all' || bulkSearch) && (
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                    <span>Filters active</span>
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => {
                        setBulkFilter('all');
                        setBulkFromAgent('any');
                        setBulkRequirePhone(false);
                        setBulkSearch('');
                      }}
                    >
                      Clear all
                    </button>
                  </div>
                )}

                <div className="rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
                    <button
                      type="button"
                      onClick={toggleSelectAllFiltered}
                      disabled={filteredBulkPool.length === 0}
                      className="flex items-center gap-2 text-xs font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Checkbox
                        checked={allFilteredSelected}
                        disabled={filteredBulkPool.length === 0}
                        tabIndex={-1}
                        className="pointer-events-none"
                      />
                      {allFilteredSelected ? 'Clear' : 'Select all'}
                      {bulkSearch || bulkFilter !== 'all' ? ' filtered' : ''}
                      <span className="text-muted-foreground font-normal">
                        ({filteredBulkPool.length})
                      </span>
                    </button>
                  </div>
                  <div
                    ref={scrollRef}
                    className="max-h-72 overflow-y-auto divide-y divide-border"
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
                        setVisibleCount((c) =>
                          c < filteredBulkPool.length ? Math.min(c + PAGE, filteredBulkPool.length) : c,
                        );
                      }
                    }}
                  >
                    {bulkPoolLoading ? (
                      <div className="py-6 flex justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : filteredBulkPool.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted-foreground">
                        No partners match this filter.
                      </div>
                    ) : (
                      filteredBulkPool.slice(0, visibleCount).map((p: any) => {
                        const cur = assignmentByBeneficiary.get(p.id);
                        const checked = selectedIds.has(p.id);
                        const wouldMove = cur && bulkAgent && cur.agent_id !== bulkAgent.id;
                        return (
                          <label
                            key={p.id}
                            className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/40 cursor-pointer"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleBulkBeneficiary(p)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{p.full_name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{p.phone}</p>
                            </div>
                            {cur ? (
                              <Badge
                                variant="outline"
                                className={`text-[9px] gap-1 ${wouldMove && checked ? 'border-amber-500/40 text-amber-600 dark:text-amber-400' : ''}`}
                              >
                                {wouldMove && checked && <ArrowRightLeft className="h-2.5 w-2.5" />}
                                {cur.agent?.full_name || 'Has proxy'}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                                Unassigned
                              </Badge>
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>
                  {!bulkPoolLoading && filteredBulkPool.length > 0 && (
                    <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border">
                      <span>
                        Showing {Math.min(visibleCount, filteredBulkPool.length)} of {filteredBulkPool.length}
                      </span>
                      {visibleCount < filteredBulkPool.length ? (
                        <button
                          type="button"
                          className="text-primary hover:underline font-medium"
                          onClick={() =>
                            setVisibleCount((c) => Math.min(c + PAGE, filteredBulkPool.length))
                          }
                        >
                          Load more
                        </button>
                      ) : (
                        <span>All loaded</span>
                      )}
                    </div>
                  )}
                </div>

                {bulkBeneficiaries.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-muted/30 p-2 max-h-32 overflow-y-auto">
                    {bulkBeneficiaries.map((b) => (
                      <Badge key={b.id} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
                        <span className="text-[11px]">{b.full_name}</span>
                        <button
                          type="button"
                          onClick={() => removeBulkBeneficiary(b.id)}
                          className="rounded hover:bg-destructive/20 p-0.5"
                          aria-label={`Remove ${b.full_name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    Managed Accounts
                  </Label>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Applies to every partner in this batch.
                  </p>
                </div>
                <Switch checked={bulkManaged} onCheckedChange={setBulkManaged} />
              </div>
              <div>
                <Label>Reason</Label>
                <Input value={bulkReason} onChange={e => setBulkReason(e.target.value)} />
              </div>
              <Button
                className="w-full"
                onClick={() => setShowBulkConfirm(true)}
                disabled={bulkAssignMutation.isPending || !bulkAgent || bulkBeneficiaries.length === 0}
              >
                {bulkAssignMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Review &amp; Link {bulkBeneficiaries.length || ''} Partner{bulkBeneficiaries.length === 1 ? '' : 's'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {/* ── Bulk Assign Confirmation ───────────────────────────────── */}
        <Dialog open={showBulkConfirm} onOpenChange={setShowBulkConfirm}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Bulk Assignment</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Assigning to agent</p>
                <p className="font-semibold">{bulkAgent?.full_name || '—'}</p>
                {bulkAgent?.phone && <p className="text-xs text-muted-foreground">{bulkAgent.phone}</p>}
                {bulkManaged && (
                  <Badge variant="secondary" className="mt-1 gap-1">
                    <ShieldCheck className="h-3 w-3" /> Managed Account
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-[10px] text-muted-foreground">New links</p>
                  <p className="text-lg font-bold tabular-nums">{bulkBreakdown.newLinks.length}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-[10px] text-muted-foreground">Re-linked (same agent)</p>
                  <p className="text-lg font-bold tabular-nums">{bulkBreakdown.reLinks.length}</p>
                </div>
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2">
                  <p className="text-[10px] text-amber-700 dark:text-amber-400">Moved from prior agent</p>
                  <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">{bulkBreakdown.moves.length}</p>
                </div>
              </div>
              {bulkBreakdown.byPriorAgent.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                  <p className="text-xs font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Partners that will be moved
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {bulkBreakdown.byPriorAgent.map(([priorId, slot]) => (
                      <div key={priorId} className="text-xs">
                        <p className="font-medium">
                          {slot.partners.length} from <span className="text-amber-700 dark:text-amber-400">{slot.name}</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-snug pl-2">
                          {slot.partners.slice(0, 5).map((p: any) => p.full_name || p.phone).join(', ')}
                          {slot.partners.length > 5 && ` +${slot.partners.length - 5} more`}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Their previous proxy assignment will be deactivated automatically.
                  </p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setShowBulkConfirm(false)} disabled={bulkAssignMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={bulkAssignMutation.isPending}
                  onClick={() =>
                    bulkAssignMutation.mutate(undefined, {
                      onSuccess: () => setShowBulkConfirm(false),
                    })
                  }
                >
                  {bulkAssignMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Confirm &amp; Link {bulkBeneficiaries.length}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={showAssign} onOpenChange={v => { setShowAssign(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><UserPlus className="h-4 w-4" /> Link Agent</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{editingAssignment ? 'Edit Proxy Assignment' : 'Link Proxy Agent'}</DialogTitle>
            </DialogHeader>
            {!editingAssignment && (
              <p className="text-xs text-muted-foreground">
                Assign an agent to act on behalf of a landlord or partner who doesn't have smartphone access.
              </p>
            )}
            <div className="space-y-3">
              {editingAssignment ? (
                <div className="space-y-1 rounded-lg border border-border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Agent</p>
                  <p className="text-sm font-medium">{editingAssignment.agent?.full_name}</p>
                  <p className="text-xs text-muted-foreground mt-2">Beneficiary</p>
                  <p className="text-sm font-medium">{editingAssignment.beneficiary?.full_name}</p>
                </div>
              ) : (
                <>
                  <UserSearchPicker label="Search Agent" placeholder="Search agent by name or phone..." selectedUser={pickedAgent} onSelect={setPickedAgent} roleFilter="agent" />
                  <UserSearchPicker label="Search Beneficiary (landlord/partner)" placeholder="Search beneficiary by name or phone..." selectedUser={pickedBeneficiary} onSelect={setPickedBeneficiary} />
                </>
              )}
              <div>
                <Label>Beneficiary Role</Label>
                <Select value={beneficiaryRole} onValueChange={setBeneficiaryRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="landlord">🏠 Landlord</SelectItem>
                    <SelectItem value="supporter">💼 Partner/Funder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    Managed Account
                  </Label>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Payouts go to agent's wallet instead of the partner's.
                  </p>
                </div>
                <Switch checked={isManagedAccount} onCheckedChange={setIsManagedAccount} />
              </div>
              <div>
                <Label>Reason</Label>
                <Input value={reason} onChange={e => setReason(e.target.value)} />
              </div>
              <Button
                className="w-full"
                onClick={() => editingAssignment ? editMutation.mutate() : assignMutation.mutate()}
                disabled={(editingAssignment ? editMutation.isPending : assignMutation.isPending) || (!editingAssignment && (!pickedAgent || !pickedBeneficiary))}
              >
                {(editingAssignment ? editMutation.isPending : assignMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingAssignment ? 'Update Assignment' : 'Link Proxy'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-3 flex items-center gap-3">
              <k.icon className={`h-8 w-8 ${k.color} shrink-0`} />
              <div>
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-[11px] text-muted-foreground leading-tight">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      {assignments.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agent, partner, phone..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : assignments.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
          <Smartphone className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          No proxy agents assigned. Link agents for landlords/partners without smartphones.
        </CardContent></Card>
      ) : filteredAssignments.length === 0 ? (
        <Card><CardContent className="py-6 text-center text-muted-foreground text-sm">
          No results for "{searchTerm}"
        </CardContent></Card>
      ) : (
        <Card>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Partner / Beneficiary</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Managed</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssignments.map((a: any, idx: number) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{a.agent?.full_name || '—'}</p>
                      <p className="text-[11px] text-muted-foreground">{a.agent?.phone || ''}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{a.beneficiary?.full_name || '—'}</p>
                      <p className="text-[11px] text-muted-foreground">{a.beneficiary?.phone || ''}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {a.beneficiary_role === 'landlord' ? '🏠 Landlord' : '💼 Partner'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {a.is_managed_account ? (
                        <Badge className="text-[10px] gap-0.5 bg-primary/10 text-primary border-primary/20">
                          <ShieldCheck className="h-2.5 w-2.5" /> Yes
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{a.reason || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {a.created_at ? format(new Date(a.created_at), 'dd MMM yyyy') : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(a)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { UserSearchPicker } from '@/components/cfo/UserSearchPicker';
import { CreateInvestmentAccountDialog } from '@/components/manager/CreateInvestmentAccountDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, UserPlus, Pencil, Loader2, Phone, Clock, ShieldCheck, PlusCircle, Save, X, ChevronDown, ShieldOff, History } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { UGANDA_BANKS } from '@/lib/ugandaBanks';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';

// ════════════════════════════════════════════════════════════════
// Shared validators — keep portfolio payout fields clean & DB-safe
// ════════════════════════════════════════════════════════════════
/**
 * Normalize a Ugandan mobile number to canonical local form: 0XXXXXXXXX (10 digits, starts 07).
 * Accepts: 0770…, 256770…, +256770…, 770… (with optional spaces / dashes).
 * Returns null if invalid.
 */
function normalizeUgPhone(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  let local = digits;
  if (local.startsWith('256')) local = '0' + local.slice(3);
  else if (local.length === 9 && local.startsWith('7')) local = '0' + local;
  if (!/^0[7]\d{8}$/.test(local)) return null;
  return local;
}

function networkMatchesPrefix(network: string, phone: string): boolean {
  // MTN: 077, 078, 076, 039  · Airtel: 070, 074, 075, 020
  const p3 = phone.slice(0, 3);
  const n = network.toLowerCase();
  if (n === 'mtn') return ['077', '078', '076', '039'].includes(p3);
  if (n === 'airtel') return ['070', '074', '075', '020'].includes(p3);
  return true; // unknown network → don't block
}

interface PortfolioFieldsInput {
  payment_method: string;
  payout_day?: string | number | null;
  mobile_money_number?: string | null;
  mobile_network?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  account_number?: string | null;
}

interface PortfolioFieldsResult {
  payout_day: number | null;
  mobile_money_number: string | null;
  mobile_network: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  account_number: string | null;
}

/**
 * Validates + normalizes the fields commonly touched by the inline forms.
 * Throws Error with a user-friendly message on the first failure.
 */
function validatePortfolioPayoutFields(f: PortfolioFieldsInput): PortfolioFieldsResult {
  // ── Payout day (required when a payment method is chosen) ──
  let payout_day: number | null = null;
  if (f.payout_day !== null && f.payout_day !== undefined && f.payout_day !== '') {
    const n = typeof f.payout_day === 'number' ? f.payout_day : parseInt(String(f.payout_day), 10);
    if (!Number.isInteger(n) || n < 1 || n > 28) {
      throw new Error('Payout day must be a whole number between 1 and 28.');
    }
    payout_day = n;
  }
  if (f.payment_method && f.payment_method !== 'wallet' && payout_day === null) {
    throw new Error('Payout day is required for mobile money and bank payouts.');
  }

  // ── Mobile Money ──
  let mobile_money_number: string | null = null;
  let mobile_network: string | null = null;
  if (f.payment_method === 'mobile_money') {
    const normalized = normalizeUgPhone(f.mobile_money_number || '');
    if (!normalized) {
      throw new Error('Mobile number must be a valid Ugandan number (e.g. 0770000000).');
    }
    const network = (f.mobile_network || '').trim();
    if (!network) throw new Error('Mobile network is required for mobile money payouts.');
    if (!['MTN', 'Airtel', 'mtn', 'airtel'].includes(network)) {
      throw new Error('Mobile network must be MTN or Airtel.');
    }
    if (!networkMatchesPrefix(network, normalized)) {
      throw new Error(`${normalized} does not match the selected ${network} network. Check the number prefix.`);
    }
    mobile_money_number = normalized;
    mobile_network = network;
  }

  // ── Bank ──
  let bank_name: string | null = null;
  let bank_account_name: string | null = null;
  let account_number: string | null = null;
  if (f.payment_method === 'bank') {
    const bn = (f.bank_name || '').trim();
    if (bn.length < 2 || bn.length > 80) {
      throw new Error('Bank name must be 2–80 characters.');
    }
    const an = (f.bank_account_name || '').trim();
    if (an.length < 2 || an.length > 100 || !/^[A-Za-z][A-Za-z .'\-]*$/.test(an)) {
      throw new Error('Bank account name must be 2–100 letters (spaces, hyphens, apostrophes allowed).');
    }
    const accDigits = (f.account_number || '').replace(/[\s-]/g, '');
    if (!/^\d{6,20}$/.test(accDigits)) {
      throw new Error('Bank account number must be 6–20 digits.');
    }
    bank_name = bn;
    bank_account_name = an;
    account_number = accDigits;
  }

  return { payout_day, mobile_money_number, mobile_network, bank_name, bank_account_name, account_number };
}
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface JoinedPartner {
  user_id: string;
  created_at: string;
  full_name: string;
  phone: string;
  portfolio_count: number;
}

interface PickedUser { id: string; full_name: string; phone: string }

export function NewPartnersPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<PickedUser | null>(null);
  const [selectedIsPartner, setSelectedIsPartner] = useState<boolean | null>(null);
  const [grantBusy, setGrantBusy] = useState(false);
  const [selectedPortfolios, setSelectedPortfolios] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForUser, setCreateForUser] = useState<PickedUser | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [inlineCreateOpen, setInlineCreateOpen] = useState(false);

  // ── Just-joined partners (last 14 days) ──
  const { data: joined, isLoading } = useQuery({
    queryKey: ['new-partners-panel'],
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, created_at')
        .eq('role', 'supporter')
        .eq('enabled', true)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(12);
      const rows = roles || [];
      if (rows.length === 0) return [] as JoinedPartner[];

      const ids = rows.map(r => r.user_id);
      const [{ data: profiles }, { data: portfolios }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, phone').in('id', ids),
        supabase.from('investor_portfolios').select('investor_id').in('investor_id', ids),
      ]);
      const pMap = new Map((profiles || []).map(p => [p.id, p]));
      const countMap = new Map<string, number>();
      (portfolios || []).forEach(p => {
        if (!p.investor_id) return;
        countMap.set(p.investor_id, (countMap.get(p.investor_id) || 0) + 1);
      });

      return rows.map(r => ({
        user_id: r.user_id,
        created_at: r.created_at,
        full_name: pMap.get(r.user_id)?.full_name || 'Unknown',
        phone: pMap.get(r.user_id)?.phone || '—',
        portfolio_count: countMap.get(r.user_id) || 0,
      })) as JoinedPartner[];
    },
    staleTime: 60_000,
  });

  // ── Realtime: any new supporter role grant pops in instantly ──
  useEffect(() => {
    const channel = supabase
      .channel('new-partners-panel-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_roles', filter: 'role=eq.supporter' },
        () => { qc.invalidateQueries({ queryKey: ['new-partners-panel'] }); }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'investor_portfolios' },
        () => { qc.invalidateQueries({ queryKey: ['new-partners-panel'] }); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // When a user is selected via search, look up role + portfolios
  async function handleSelect(u: PickedUser | null) {
    setSelected(u);
    setSelectedIsPartner(null);
    setSelectedPortfolios([]);
    if (!u) return;
    const [{ data: roleRow }, { data: ports }] = await Promise.all([
      supabase.from('user_roles').select('id').eq('user_id', u.id).eq('role', 'supporter').eq('enabled', true).maybeSingle(),
      supabase.from('investor_portfolios')
        .select('id, portfolio_code, account_name, investment_amount, roi_percentage, status, investor_id, agent_id, display_currency, payment_method, mobile_money_number, mobile_network, bank_name, bank_account_name, account_number, payout_day')
        .eq('investor_id', u.id)
        .order('created_at', { ascending: false }),
    ]);
    setSelectedIsPartner(!!roleRow);
    setSelectedPortfolios(ports || []);
  }

  async function makePartner() {
    if (!selected) return;
    setGrantBusy(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .upsert({ user_id: selected.id, role: 'supporter' as any, enabled: true }, { onConflict: 'user_id,role' });
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'grant_supporter_role',
        table_name: 'user_roles',
        record_id: selected.id,
        metadata: { granted_to: selected.full_name, phone: selected.phone, source: 'PartnerOps NewPartnersPanel' },
      });
      toast({ title: '✅ Partner role granted', description: `${selected.full_name} is now a Partner.` });
      setSelectedIsPartner(true);
      qc.invalidateQueries({ queryKey: ['new-partners-panel'] });
    } catch (e: any) {
      toast({ title: 'Could not grant role', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setGrantBusy(false);
    }
  }

  function openCreateFor(u: PickedUser) {
    setCreateForUser(u);
    setCreateOpen(true);
  }

  async function revokePartner() {
    if (!selected) return;
    setRevokeBusy(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ enabled: false })
        .eq('user_id', selected.id)
        .eq('role', 'supporter');
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'revoke_supporter_role',
        table_name: 'user_roles',
        record_id: selected.id,
        metadata: { revoked_from: selected.full_name, phone: selected.phone, source: 'PartnerOps NewPartnersPanel' },
      });
      toast({ title: 'Partner role revoked', description: `${selected.full_name} is no longer a Partner.` });
      setSelectedIsPartner(false);
      setRevokeOpen(false);
      qc.invalidateQueries({ queryKey: ['new-partners-panel'] });
      if (historyOpen) loadHistory();
    } catch (e: any) {
      toast({ title: 'Could not revoke role', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setRevokeBusy(false);
    }
  }

  async function loadHistory() {
    if (!selected) return;
    setHistoryLoading(true);
    try {
      const portfolioIds = selectedPortfolios.map(p => p.id);
      const recordIds = [selected.id, ...portfolioIds];
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, created_at, action_type, table_name, record_id, user_id, metadata')
        .in('record_id', recordIds)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setHistoryRows(data || []);
    } catch (e: any) {
      toast({ title: 'Could not load history', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next) loadHistory();
  }

  return (
    <>
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardContent className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/15">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold">Just Joined Partners</h3>
              <p className="text-[10px] text-muted-foreground">Welcome, activate & set up their first portfolio</p>
            </div>
            {joined && joined.length > 0 && (
              <Badge className="bg-primary/15 text-primary border-0 text-xs font-bold">{joined.length}</Badge>
            )}
          </div>

          {/* Newly joined list */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : !joined || joined.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No new partners joined in the last 14 days.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {joined.map(p => (
                <div key={p.user_id} className="rounded-xl border border-border/60 bg-card p-2.5 flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {(p.full_name || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{p.full_name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{p.phone}</span>
                      <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</span>
                    </div>
                    {p.portfolio_count > 0 && (
                      <Badge variant="outline" className="mt-1 text-[9px] py-0 px-1.5">{p.portfolio_count} portfolio{p.portfolio_count > 1 ? 's' : ''}</Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] gap-1 shrink-0"
                    onClick={() => openCreateFor({ id: p.user_id, full_name: p.full_name, phone: p.phone })}
                  >
                    <PlusCircle className="h-3 w-3" />
                    {p.portfolio_count > 0 ? 'Add' : 'Activate'}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-border/50" />

          {/* Search any user */}
          <div className="space-y-2">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5 text-primary" />
              Search any user — grant Partner role or edit their portfolios
            </p>
            <UserSearchPicker
              label=""
              placeholder="Search by name or phone…"
              selectedUser={selected}
              onSelect={handleSelect}
            />

            {selected && (
              <div className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  {selectedIsPartner === null ? (
                    <span className="text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Checking…</span>
                  ) : selectedIsPartner ? (
                    <Badge className="bg-success/15 text-success border-0 gap-1"><ShieldCheck className="h-3 w-3" /> Already a Partner</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">Not a Partner yet</Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedIsPartner === false && (
                    <Button size="sm" className="h-8 text-xs gap-1.5" onClick={makePartner} disabled={grantBusy}>
                      {grantBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                      Make Partner
                    </Button>
                  )}
                  {selectedIsPartner === true && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setRevokeOpen(true)}
                    >
                      <ShieldOff className="h-3 w-3" /> Revoke Partner
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => openCreateFor(selected)}
                  >
                    <PlusCircle className="h-3 w-3" /> New Portfolio
                  </Button>
                  <Button
                    size="sm"
                    variant={inlineCreateOpen ? 'default' : 'outline'}
                    className="h-8 text-xs gap-1.5"
                    onClick={() => setInlineCreateOpen(o => !o)}
                  >
                    <PlusCircle className="h-3 w-3" /> {inlineCreateOpen ? 'Close inline' : 'Add Portfolio (inline)'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={toggleHistory}
                  >
                    <History className="h-3 w-3" /> {historyOpen ? 'Hide' : 'View'} History
                  </Button>
                </div>

                {inlineCreateOpen && (
                  <InlineCreatePortfolioForm
                    partner={selected}
                    actingUserId={user?.id}
                    onCreated={() => {
                      setInlineCreateOpen(false);
                      handleSelect(selected);
                      qc.invalidateQueries({ queryKey: ['exec-partner-portfolios'] });
                      qc.invalidateQueries({ queryKey: ['new-partners-panel'] });
                    }}
                    onCancel={() => setInlineCreateOpen(false)}
                  />
                )}

                {historyOpen && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-2 space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <History className="h-3 w-3" /> Audit history (last 50)
                    </p>
                    {historyLoading ? (
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground p-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                      </div>
                    ) : historyRows.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground italic p-2">No audit entries for this partner yet.</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto space-y-1">
                        {historyRows.map(row => (
                          <div key={row.id} className="rounded-md bg-background border border-border/40 px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold truncate">{row.action_type}</span>
                              <span className="text-[9px] text-muted-foreground shrink-0">
                                {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                              </span>
                            </div>
                            <p className="text-[9px] text-muted-foreground truncate">
                              {row.table_name} · {row.record_id?.slice(0, 8)}
                            </p>
                            {row.metadata && Object.keys(row.metadata).length > 0 && (
                              <pre className="mt-1 text-[9px] text-muted-foreground whitespace-pre-wrap break-all line-clamp-3">
                                {JSON.stringify(row.metadata).slice(0, 200)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Portfolio list to edit */}
                {selectedPortfolios.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Portfolios ({selectedPortfolios.length}) — tap to edit inline
                    </p>
                    {selectedPortfolios.map(p => (
                      <InlinePortfolioRow
                        key={p.id}
                        portfolio={p}
                        expanded={expandedId === p.id}
                        onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                        onSaved={(updated) => {
                          setSelectedPortfolios(list => list.map(x => x.id === updated.id ? { ...x, ...updated } : x));
                          qc.invalidateQueries({ queryKey: ['exec-partner-portfolios'] });
                        }}
                        actingUserId={user?.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <CreateInvestmentAccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => { handleSelect(selected); qc.invalidateQueries({ queryKey: ['exec-partner-portfolios'] }); qc.invalidateQueries({ queryKey: ['new-partners-panel'] }); }}
        prefillInvestorId={createForUser?.id}
        prefillInvestorName={createForUser?.full_name}
      />

      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Partner role?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disable the Partner (supporter) role for{' '}
              <span className="font-semibold">{selected?.full_name}</span>. Their portfolios remain intact, but they will lose Partner access. This action is logged in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); revokePartner(); }}
              disabled={revokeBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ShieldOff className="h-3 w-3 mr-1" />}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// InlinePortfolioRow — collapsible inline editor (no dialogs)
// ════════════════════════════════════════════════════════════════
interface InlinePortfolioRowProps {
  portfolio: any;
  expanded: boolean;
  onToggle: () => void;
  onSaved: (updated: any) => void;
  actingUserId?: string;
}

function InlinePortfolioRow({ portfolio: p, expanded, onToggle, onSaved, actingUserId }: InlinePortfolioRowProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    account_name: p.account_name || '',
    payout_day: p.payout_day ? String(p.payout_day) : '',
    payment_method: p.payment_method || 'mobile_money',
    mobile_money_number: p.mobile_money_number || '',
    mobile_network: p.mobile_network || '',
    bank_name: p.bank_name || '',
    bank_account_name: p.bank_account_name || '',
    account_number: p.account_number || '',
  });

  // Re-sync when underlying portfolio prop changes (e.g. realtime update)
  useEffect(() => {
    if (!expanded) {
      setForm({
        account_name: p.account_name || '',
        payout_day: p.payout_day ? String(p.payout_day) : '',
        payment_method: p.payment_method || 'mobile_money',
        mobile_money_number: p.mobile_money_number || '',
        mobile_network: p.mobile_network || '',
        bank_name: p.bank_name || '',
        bank_account_name: p.bank_account_name || '',
        account_number: p.account_number || '',
      });
    }
  }, [p.id, expanded]);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  async function handleSave() {
    if (form.account_name.length > 100) {
      toast({ title: 'Portfolio name too long', variant: 'destructive' });
      return;
    }

    let validated;
    try {
      validated = validatePortfolioPayoutFields({
        payment_method: form.payment_method,
        payout_day: form.payout_day,
        mobile_money_number: form.mobile_money_number,
        mobile_network: form.mobile_network,
        bank_name: form.bank_name,
        bank_account_name: form.bank_account_name,
        account_number: form.account_number,
      });
    } catch (e: any) {
      toast({ title: 'Check the form', description: e?.message || 'Invalid value', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const patch: Record<string, any> = {
        account_name: form.account_name.trim() || null,
        payout_day: validated.payout_day,
        payment_method: form.payment_method,
        mobile_money_number: validated.mobile_money_number,
        mobile_network: validated.mobile_network,
        bank_name: validated.bank_name,
        bank_account_name: validated.bank_account_name,
        account_number: validated.account_number,
      };
      const { error } = await supabase.from('investor_portfolios').update(patch).eq('id', p.id);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: actingUserId,
        action_type: 'edit_portfolio_inline',
        table_name: 'investor_portfolios',
        record_id: p.id,
        metadata: { source: 'PartnerOps NewPartnersPanel inline', changes: patch },
      });

      toast({ title: '✅ Portfolio updated' });
      onSaved({ id: p.id, ...patch });
      onToggle(); // collapse
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate">{p.account_name || p.portfolio_code}</p>
          <p className="text-[10px] text-muted-foreground">
            {p.display_currency || 'UGX'} {Number(p.investment_amount || 0).toLocaleString()} · {p.roi_percentage}% · {p.status}
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-primary shrink-0 rotate-180 transition-transform" />
        ) : (
          <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/60 bg-background p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Portfolio name</Label>
              <Input value={form.account_name} onChange={e => set('account_name', e.target.value)} className="h-8 text-xs" maxLength={100} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Payout day (1-28)</Label>
              <Input type="number" min={1} max={28} value={form.payout_day} onChange={e => set('payout_day', e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px]">Payment method</Label>
            <Select value={form.payment_method} onValueChange={v => set('payment_method', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mobile_money">📱 Mobile Money</SelectItem>
                <SelectItem value="bank">🏦 Bank</SelectItem>
                <SelectItem value="wallet">👛 Wallet (Welile)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.payment_method === 'mobile_money' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Mobile number</Label>
                <Input value={form.mobile_money_number} onChange={e => set('mobile_money_number', e.target.value)} placeholder="0770…" className="h-8 text-xs" maxLength={20} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Network</Label>
                <Select value={form.mobile_network || ''} onValueChange={v => set('mobile_network', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MTN">MTN</SelectItem>
                    <SelectItem value="Airtel">Airtel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {form.payment_method === 'bank' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Bank name</Label>
                  <Input value={form.bank_name} onChange={e => set('bank_name', e.target.value)} className="h-8 text-xs" maxLength={80} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Account number</Label>
                  <Input value={form.account_number} onChange={e => set('account_number', e.target.value)} className="h-8 text-xs" maxLength={30} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Account name</Label>
                <Input value={form.bank_account_name} onChange={e => set('bank_account_name', e.target.value)} className="h-8 text-xs" maxLength={100} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="h-8 text-xs gap-1.5 flex-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save changes
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5" onClick={onToggle} disabled={saving}>
              <X className="h-3 w-3" /> Cancel
            </Button>
          </div>
          <p className={cn("text-[9px] text-muted-foreground italic")}>
            Investment amount, status and currency are managed from the full edit screen for safety.
          </p>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// InlineCreatePortfolioForm — create a new portfolio without a dialog
// ════════════════════════════════════════════════════════════════
interface InlineCreatePortfolioFormProps {
  partner: PickedUser;
  actingUserId?: string;
  onCreated: () => void;
  onCancel: () => void;
}

function InlineCreatePortfolioForm({ partner, actingUserId, onCreated, onCancel }: InlineCreatePortfolioFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [form, setForm] = useState({
    account_name: '',
    investment_amount: '',
    roi_percentage: '20',
    duration_months: '12',
    roi_mode: 'monthly_payout',
    portfolio_pin: String(Math.floor(1000 + Math.random() * 9000)),
    payout_day: '15',
    contribution_date: new Date().toISOString().slice(0, 10),
    payment_method: '',
    mobile_network: '',
    mobile_money_number: '',
    bank_name: '',
    bank_account_name: '',
    account_number: '',
  });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Load partner total wallet balance (deposits land in float, matches edge fn gate)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBalanceLoading(true);
      const { data } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', partner.id)
        .maybeSingle();
      if (cancelled) return;
      const bal = data ? Number(data.balance) || 0 : 0;
      setBalance(bal);
      setForm(p => ({ ...p, investment_amount: bal > 0 ? String(Math.floor(bal)) : '' }));
      setBalanceLoading(false);
    })();
    return () => { cancelled = true; };
  }, [partner.id]);

  function regenPin() {
    set('portfolio_pin', String(Math.floor(1000 + Math.random() * 9000)));
  }

  async function handleCreate() {
    const amt = parseFloat(form.investment_amount);
    if (!form.investment_amount || isNaN(amt) || amt < 50000) {
      toast({ title: 'Investment must be at least UGX 50,000', variant: 'destructive' });
      return;
    }
    if (balance === null) {
      toast({ title: 'Partner wallet balance not loaded yet', variant: 'destructive' });
      return;
    }
    if (amt > balance) {
      toast({
        title: 'Insufficient partner wallet balance',
        description: `${partner.full_name} has UGX ${balance.toLocaleString()} available. Top up first.`,
        variant: 'destructive',
      });
      return;
    }
    if (!/^\d{4}$/.test(form.portfolio_pin)) {
      toast({ title: 'Portfolio PIN must be exactly 4 digits', variant: 'destructive' });
      return;
    }
    if (form.account_name.length > 100) {
      toast({ title: 'Portfolio name too long', variant: 'destructive' });
      return;
    }

    // Validate + normalize payout/mobile/bank fields before sending to the
    // edge function (which writes to investor_portfolios).
    let validated;
    try {
      validated = validatePortfolioPayoutFields({
        payment_method: form.payment_method,
        payout_day: form.payout_day,
        mobile_money_number: form.mobile_money_number,
        mobile_network: form.mobile_network,
        bank_name: form.bank_name,
        bank_account_name: form.bank_account_name,
        account_number: form.account_number,
      });
    } catch (e: any) {
      toast({ title: 'Check the form', description: e?.message || 'Invalid value', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const response = await supabase.functions.invoke('create-investor-portfolio', {
        body: {
          investor_id: partner.id,
          investment_amount: amt,
          duration_months: parseInt(form.duration_months),
          roi_percentage: parseFloat(form.roi_percentage),
          roi_mode: form.roi_mode,
          portfolio_pin: form.portfolio_pin,
          payout_day: validated.payout_day ?? parseInt(form.payout_day),
          contribution_date: form.contribution_date || null,
          payment_method: form.payment_method || null,
          mobile_network: validated.mobile_network,
          mobile_money_number: validated.mobile_money_number,
          bank_name: validated.bank_name,
          account_name: validated.bank_account_name || form.account_name || null,
          account_number: validated.account_number,
        },
      });
      if (response.error || response.data?.error) {
        const msg = await extractEdgeFunctionError(response, 'Failed to create portfolio');
        throw new Error(msg);
      }
      const code = response.data?.portfolio?.portfolio_code || '';
      await supabase.from('audit_logs').insert({
        user_id: actingUserId,
        action_type: 'create_portfolio_inline',
        table_name: 'investor_portfolios',
        record_id: response.data?.portfolio?.id || partner.id,
        metadata: { source: 'PartnerOps NewPartnersPanel inline', partner: partner.full_name, amount: amt, code },
      });
      toast({ title: `✅ Portfolio ${code} created — pending approval` });
      onCreated();
    } catch (e: any) {
      toast({ title: 'Creation failed', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold flex items-center gap-1">
          <PlusCircle className="h-3.5 w-3.5 text-primary" /> New portfolio for {partner.full_name}
        </p>
        <span className="text-[10px] text-muted-foreground">
          {balanceLoading ? 'Loading wallet…' : `Wallet: UGX ${(balance ?? 0).toLocaleString()}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1 col-span-2">
          <Label className="text-[10px]">Portfolio name (optional)</Label>
          <Input value={form.account_name} onChange={e => set('account_name', e.target.value)} placeholder="e.g. Premium Fund" className="h-8 text-xs" maxLength={100} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">From Wallet (UGX) *</Label>
          <Input
            type="number"
            min={50000}
            max={balance ?? undefined}
            value={form.investment_amount}
            onChange={e => set('investment_amount', e.target.value)}
            disabled={balanceLoading}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">ROI %</Label>
          <Input type="number" min={0} max={100} value={form.roi_percentage} onChange={e => set('roi_percentage', e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Duration</Label>
          <Select value={form.duration_months} onValueChange={v => set('duration_months', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 Months</SelectItem>
              <SelectItem value="6">6 Months</SelectItem>
              <SelectItem value="12">12 Months</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">ROI Mode</Label>
          <Select value={form.roi_mode} onValueChange={v => set('roi_mode', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly_payout">Monthly Payout</SelectItem>
              <SelectItem value="monthly_compounding">Compounding</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Contribution Date</Label>
          <Input
            type="date"
            value={form.contribution_date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => {
              const v = e.target.value;
              const day = v ? Math.min(28, Number(v.slice(8, 10)) || 15) : 15;
              setForm(p => ({ ...p, contribution_date: v, payout_day: String(day) }));
            }}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[10px]">PIN (4 digits) *</Label>
            <button type="button" onClick={regenPin} className="text-[9px] text-primary hover:underline flex items-center gap-0.5">
              <Sparkles className="h-2.5 w-2.5" /> Gen
            </button>
          </div>
          <Input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={form.portfolio_pin}
            onChange={e => set('portfolio_pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="h-8 text-xs font-mono tracking-widest"
          />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-[10px]">Payout Method (optional)</Label>
          <Select value={form.payment_method} onValueChange={v => set('payment_method', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mobile_money">📱 Mobile Money</SelectItem>
              <SelectItem value="bank">🏦 Bank Transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.payment_method === 'mobile_money' && (
          <>
            <div className="space-y-1">
              <Label className="text-[10px]">Network</Label>
              <Select value={form.mobile_network} onValueChange={v => set('mobile_network', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mtn">MTN</SelectItem>
                  <SelectItem value="airtel">Airtel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">MoMo Number</Label>
              <Input value={form.mobile_money_number} onChange={e => set('mobile_money_number', e.target.value)} placeholder="0770000000" className="h-8 text-xs" inputMode="tel" />
            </div>
          </>
        )}
        {form.payment_method === 'bank' && (
          <>
            <div className="space-y-1 col-span-2">
              <Label className="text-[10px]">Bank</Label>
              <Select value={form.bank_name} onValueChange={v => set('bank_name', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select bank" /></SelectTrigger>
                <SelectContent>
                  {UGANDA_BANKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Account Name</Label>
              <Input value={form.bank_account_name} onChange={e => set('bank_account_name', e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Account Number</Label>
              <Input value={form.account_number} onChange={e => set('account_number', e.target.value)} className="h-8 text-xs" />
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={onCancel} disabled={saving}>
          <X className="h-3 w-3" /> Cancel
        </Button>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={handleCreate} disabled={saving || balanceLoading}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Create Portfolio
        </Button>
      </div>
    </div>
  );
}

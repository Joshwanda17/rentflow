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
import { EditInvestmentAccountDialog } from '@/components/manager/EditInvestmentAccountDialog';
import { CreateInvestmentAccountDialog } from '@/components/manager/CreateInvestmentAccountDialog';
import { Sparkles, UserPlus, Pencil, Loader2, Phone, Clock, ShieldCheck, PlusCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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
  const [editPortfolio, setEditPortfolio] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForUser, setCreateForUser] = useState<PickedUser | null>(null);

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
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => openCreateFor(selected)}
                  >
                    <PlusCircle className="h-3 w-3" /> New Portfolio
                  </Button>
                </div>

                {/* Portfolio list to edit */}
                {selectedPortfolios.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Portfolios ({selectedPortfolios.length}) — tap to edit
                    </p>
                    {selectedPortfolios.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setEditPortfolio(p)}
                        className="w-full flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted px-2.5 py-2 text-left transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate">{p.account_name || p.portfolio_code}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {p.display_currency || 'UGX'} {Number(p.investment_amount || 0).toLocaleString()} · {p.roi_percentage}% · {p.status}
                          </p>
                        </div>
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <EditInvestmentAccountDialog
        open={!!editPortfolio}
        onOpenChange={(v) => { if (!v) setEditPortfolio(null); }}
        account={editPortfolio}
        onSuccess={() => { handleSelect(selected); qc.invalidateQueries({ queryKey: ['exec-partner-portfolios'] }); }}
      />
      <CreateInvestmentAccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => { handleSelect(selected); qc.invalidateQueries({ queryKey: ['exec-partner-portfolios'] }); qc.invalidateQueries({ queryKey: ['new-partners-panel'] }); }}
        prefillInvestorId={createForUser?.id}
        prefillInvestorName={createForUser?.full_name}
      />
    </>
  );
}

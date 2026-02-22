import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Search,
  Loader2,
  ArrowLeft,
  RefreshCw,
  ChevronRight,
  TriangleAlert,
  Wallet,
  PlusCircle,
  MinusCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Phone,
  Calendar,
  TrendingUp,
  TrendingDown,
  BadgeInfo,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface UserSummary {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  balance: number;
  walletId: string | null;
  totalIn: number;
  totalOut: number;
  entryCount: number;
}

interface LedgerEntry {
  id: string;
  date: string;
  direction: 'cash_in' | 'cash_out';
  category: string;
  description: string;
  amount: number;
  reference_id?: string | null;
  linked_party?: string | null;
  balance_after: number;
}

/* ─── Human-friendly category labels ────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, { label: string; emoji: string; note: string }> = {
  referral_bonus:             { label: 'Referral Reward',        emoji: '👥', note: 'Earned for bringing a friend' },
  agent_commission:           { label: 'Commission Earned',       emoji: '💼', note: 'Earned from helping a tenant' },
  approval_bonus:             { label: 'Approval Bonus',          emoji: '✅', note: 'Bonus for approving a request' },
  subagent_commission:        { label: 'Team Commission',         emoji: '🤝', note: 'Earned from your sub-agent' },
  referral_first_transaction: { label: 'First Deal Bonus',        emoji: '🎉', note: 'Bonus when your referral first transacted' },
  welcome_bonus:              { label: 'Welcome Gift',            emoji: '🎁', note: 'One-time welcome reward' },
  deposit:                    { label: 'Money Added (Deposit)',   emoji: '📲', note: 'Sent from mobile money' },
  wallet_withdrawal:          { label: 'Money Withdrawn',         emoji: '🏧', note: 'Sent out to mobile money' },
  supporter_reward:           { label: 'Investment Return',       emoji: '📈', note: 'Return from supporting a tenant' },
  rent_repayment:             { label: 'Rent Payment Received',   emoji: '🏠', note: 'Tenant paid back rent' },
  manager_credit:             { label: 'Added by Manager',        emoji: '➕', note: 'Manager manually added funds' },
  manager_debit:              { label: 'Removed by Manager',      emoji: '➖', note: 'Manager manually removed funds' },
};

function getCategoryInfo(category: string, direction: string) {
  const meta = CATEGORY_LABELS[category];
  if (meta) return meta;
  if (direction === 'cash_out') return { label: 'Money Sent Out', emoji: '📤', note: '' };
  return { label: 'Money Received', emoji: '📥', note: '' };
}

/* ─── Quick amounts ──────────────────────────────────────────────────────── */
const QUICK_AMOUNTS = [5_000, 10_000, 50_000, 100_000, 500_000];

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */

export function ManagerBankingLedger() {
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers]             = useState<UserSummary[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [ledger, setLedger]            = useState<LedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [showOnlyType, setShowOnlyType]  = useState<'all' | 'cash_in' | 'cash_out'>('all');

  const [adjOpen, setAdjOpen]       = useState(false);
  const [adjType, setAdjType]       = useState<'add' | 'remove'>('add');
  const [adjAmount, setAdjAmount]   = useState('');
  const [adjReason, setAdjReason]   = useState('');
  const [adjLoading, setAdjLoading] = useState(false);

  /* ── load user list ── */
  const fetchUsers = useCallback(async (q: string) => {
    setLoadingUsers(true);
    try {
      let query = supabase.from('profiles').select('id, full_name, phone, email').order('full_name');
      if (q.trim()) {
        query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
      }
      const { data: profiles, error } = await query.limit(60);
      if (error) throw error;
      if (!profiles?.length) { setUsers([]); return; }

      const ids = profiles.map(p => p.id);
      const [walletsRes, ledgerRes] = await Promise.all([
        supabase.from('wallets').select('user_id, id, balance').in('user_id', ids),
        supabase.from('general_ledger').select('user_id, direction, amount').in('user_id', ids),
      ]);

      const walletMap = new Map((walletsRes.data || []).map(w => [w.user_id, { id: w.id, balance: w.balance }]));
      const aggMap    = new Map<string, { totalIn: number; totalOut: number; count: number }>();
      for (const row of ledgerRes.data || []) {
        const a = aggMap.get(row.user_id) || { totalIn: 0, totalOut: 0, count: 0 };
        if (row.direction === 'cash_in') a.totalIn += row.amount; else a.totalOut += row.amount;
        a.count++;
        aggMap.set(row.user_id, a);
      }

      setUsers(profiles.map(p => {
        const w = walletMap.get(p.id);
        const a = aggMap.get(p.id) || { totalIn: 0, totalOut: 0, count: 0 };
        return { id: p.id, full_name: p.full_name, phone: p.phone, email: p.email,
                 balance: w?.balance ?? 0, walletId: w?.id ?? null,
                 totalIn: a.totalIn, totalOut: a.totalOut, entryCount: a.count };
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => { fetchUsers(''); }, [fetchUsers]);
  useEffect(() => {
    const t = setTimeout(() => fetchUsers(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, fetchUsers]);

  /* ── load ledger for one user ── */
  const fetchLedger = useCallback(async (userId: string) => {
    setLoadingLedger(true);
    try {
      const { data, error } = await supabase
        .from('general_ledger')
        .select('id, transaction_date, amount, direction, category, description, reference_id, linked_party')
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false })
        .limit(200);
      if (error) throw error;

      let running = 0;
      const withBal: LedgerEntry[] = [...(data || [])].reverse().map(row => {
        if (row.direction === 'cash_in') running += row.amount; else running -= row.amount;
        return {
          id: row.id, date: row.transaction_date,
          direction: row.direction as 'cash_in' | 'cash_out',
          category: row.category,
          description: row.description || getCategoryInfo(row.category, row.direction).label,
          amount: row.amount, reference_id: row.reference_id, linked_party: row.linked_party,
          balance_after: Math.max(0, running),
        };
      });
      setLedger(withBal.reverse());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLedger(false);
    }
  }, []);

  const openUser = (u: UserSummary) => { setSelectedUser(u); setShowOnlyType('all'); fetchLedger(u.id); };
  const goBack   = () => { setSelectedUser(null); setLedger([]); fetchUsers(searchQuery); };

  /* ── adjust ── */
  const handleAdjust = async () => {
    if (!selectedUser || !user) return;
    const amountNum = parseFloat(adjAmount);
    if (isNaN(amountNum) || amountNum <= 0) { toast.error('Enter a valid amount'); return; }
    if (!adjReason.trim())                   { toast.error('Please explain the reason'); return; }
    if (adjType === 'remove' && amountNum > selectedUser.balance) {
      toast.error(`Can't remove more than the current balance (${formatUGX(selectedUser.balance)})`);
      return;
    }
    setAdjLoading(true);
    try {
      let { data: wallet, error: wErr } = await supabase.from('wallets').select('id, balance').eq('user_id', selectedUser.id).maybeSingle();
      if (wErr) throw wErr;
      if (!wallet) {
        const { data: nw, error: nwErr } = await supabase.from('wallets').insert({ user_id: selectedUser.id, balance: 0 }).select('id, balance').single();
        if (nwErr) throw nwErr;
        wallet = nw;
      }

      const now = new Date();
      const ref = `WBA${String(now.getFullYear()).slice(-2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}${String(Math.floor(1000+Math.random()*9000))}`;

      // Queue for manager approval instead of direct wallet update
      const { error: queueErr } = await supabase.from('pending_wallet_operations').insert({
        user_id:      selectedUser.id,
        amount:       amountNum,
        direction:    adjType === 'add' ? 'cash_in' : 'cash_out',
        category:     adjType === 'add' ? 'manager_credit' : 'manager_debit',
        source_table: 'wallets',
        source_id:    wallet.id,
        description:  `${adjType === 'add' ? 'Added' : 'Removed'} by Manager: ${adjReason.trim()}`,
        reference_id: ref,
        linked_party: user.email || 'Manager',
        status:       'pending',
      });
      if (queueErr) throw queueErr;

      toast.success(`✅ Balance adjustment queued for approval (${formatUGX(amountNum)} ${adjType === 'add' ? 'credit' : 'debit'})`);
      setAdjOpen(false); setAdjAmount(''); setAdjReason(''); setAdjType('add');
    } catch (e) {
      console.error(e);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setAdjLoading(false);
    }
  };

  const filtered = showOnlyType === 'all' ? ledger : ledger.filter(e => e.direction === showOnlyType);
  const totalIn  = ledger.filter(e => e.direction === 'cash_in').reduce((s,e) => s+e.amount, 0);
  const totalOut = ledger.filter(e => e.direction === 'cash_out').reduce((s,e) => s+e.amount, 0);

  const grouped = filtered.reduce((acc, e) => {
    const k = format(new Date(e.date), 'yyyy-MM-dd');
    if (!acc[k]) acc[k] = [];
    acc[k].push(e);
    return acc;
  }, {} as Record<string, LedgerEntry[]>);

  /* ═══════════════════════════════════════════════════════════════════
     USER LIST
  ═══════════════════════════════════════════════════════════════════ */
  if (!selectedUser) {
    return (
      <div className="space-y-4 pb-8">

        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" />
              Wallet Manager
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tap any person to see their money history and make changes
            </p>
          </div>
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => fetchUsers(searchQuery)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone number…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-12 h-12 text-base"
          />
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-success/5 border-success/20">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Total Money Held</p>
              <p className="text-lg font-bold text-success mt-0.5">
                {formatUGX(users.reduce((s,u) => s+u.balance, 0))}
              </p>
              <p className="text-[11px] text-muted-foreground">across all wallets</p>
            </CardContent>
          </Card>
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">People Listed</p>
              <p className="text-2xl font-bold text-primary mt-0.5">{users.length}</p>
              <p className="text-[11px] text-muted-foreground">tap to manage</p>
            </CardContent>
          </Card>
        </div>

        {/* User list */}
        {loadingUsers ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-semibold text-base">Nobody found</p>
            <p className="text-sm">Try a different name or phone number</p>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => openUser(u)}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border bg-card hover:bg-muted/50 active:scale-[0.98] transition-all text-left min-h-[72px]"
              >
                <Avatar className="h-12 w-12 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-base">
                    {u.full_name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base truncate">{u.full_name}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {u.phone}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-bold text-base ${u.balance > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                    {formatUGX(u.balance)}
                  </p>
                  <p className="text-xs text-muted-foreground">{u.entryCount} transactions</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-1" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════
     DETAIL VIEW
  ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-4 pb-24">

      {/* Back + name */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} className="h-11 w-11 shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg leading-tight truncate">{selectedUser.full_name}</h2>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {selectedUser.phone}
          </p>
        </div>
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => fetchLedger(selectedUser.id)}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Balance hero */}
      <div className="rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-6">
        <p className="text-sm font-semibold opacity-80 uppercase tracking-wide">💰 Wallet Balance</p>
        <p className="text-5xl font-extrabold mt-2 font-mono leading-none">
          {formatUGX(selectedUser.balance)}
        </p>
        <p className="text-sm opacity-70 mt-1">This is how much money is in their wallet right now</p>

        <div className="grid grid-cols-2 gap-4 mt-5">
          <div className="bg-primary-foreground/10 rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownCircle className="h-4 w-4 text-success" />
              <p className="text-xs opacity-80 font-medium">Total Money In</p>
            </div>
            <p className="text-xl font-bold">+{formatUGX(totalIn)}</p>
          </div>
          <div className="bg-primary-foreground/10 rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpCircle className="h-4 w-4 text-destructive" />
              <p className="text-xs opacity-80 font-medium">Total Money Out</p>
            </div>
            <p className="text-xl font-bold">-{formatUGX(totalOut)}</p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          className="h-16 text-base font-bold gap-3 bg-success hover:bg-success/90 text-white rounded-2xl"
          style={{ touchAction: 'manipulation' }}
          onClick={() => { setAdjType('add'); setAdjOpen(true); }}
        >
          <PlusCircle className="h-6 w-6" />
          Add Money
        </Button>
        <Button
          variant="outline"
          className="h-16 text-base font-bold gap-3 border-destructive text-destructive hover:bg-destructive/10 rounded-2xl"
          style={{ touchAction: 'manipulation' }}
          onClick={() => { setAdjType('remove'); setAdjOpen(true); }}
        >
          <MinusCircle className="h-6 w-6" />
          Remove Money
        </Button>
      </div>

      {/* Where money came from — simple breakdown */}
      {!loadingLedger && ledger.length > 0 && (
        <div className="rounded-2xl border overflow-hidden">
          <div className="px-4 py-3 bg-muted/50 border-b">
            <p className="font-bold text-sm">📊 Where Their Money Came From</p>
            <p className="text-xs text-muted-foreground">A simple summary of all money movements</p>
          </div>

          {/* Money In section */}
          {totalIn > 0 && (
            <>
              <div className="px-4 py-2 bg-success/5">
                <p className="text-xs font-bold text-success flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  MONEY THAT CAME IN — {formatUGX(totalIn)}
                </p>
              </div>
              {Object.entries(
                ledger.filter(e=>e.direction==='cash_in').reduce((acc, e) => {
                  acc[e.category] = (acc[e.category]||0) + e.amount; return acc;
                }, {} as Record<string,number>)
              ).map(([cat, amt]) => {
                const info = getCategoryInfo(cat, 'cash_in');
                return (
                  <div key={cat} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 bg-card">
                    <span className="text-2xl">{info.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{info.label}</p>
                      {info.note && <p className="text-xs text-muted-foreground">{info.note}</p>}
                    </div>
                    <p className="font-bold text-success font-mono text-sm">+{formatUGX(amt)}</p>
                  </div>
                );
              })}
            </>
          )}

          {/* Money Out section */}
          {totalOut > 0 && (
            <>
              <div className="px-4 py-2 bg-destructive/5">
                <p className="text-xs font-bold text-destructive flex items-center gap-1.5">
                  <TrendingDown className="h-3.5 w-3.5" />
                  MONEY THAT WENT OUT — {formatUGX(totalOut)}
                </p>
              </div>
              {Object.entries(
                ledger.filter(e=>e.direction==='cash_out').reduce((acc, e) => {
                  acc[e.category] = (acc[e.category]||0) + e.amount; return acc;
                }, {} as Record<string,number>)
              ).map(([cat, amt]) => {
                const info = getCategoryInfo(cat, 'cash_out');
                return (
                  <div key={cat} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 bg-card">
                    <span className="text-2xl">{info.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{info.label}</p>
                      {info.note && <p className="text-xs text-muted-foreground">{info.note}</p>}
                    </div>
                    <p className="font-bold text-destructive font-mono text-sm">-{formatUGX(amt)}</p>
                  </div>
                );
              })}
            </>
          )}

          {/* Net */}
          <div className="flex items-center justify-between px-4 py-4 bg-muted/70 border-t">
            <div>
              <p className="font-bold text-sm">Money Left in Wallet</p>
              <p className="text-xs text-muted-foreground">After all ins and outs</p>
            </div>
            <p className={`font-extrabold text-xl font-mono ${totalIn - totalOut >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatUGX(Math.max(0, totalIn - totalOut))}
            </p>
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2">
        {[
          { key: 'all',      label: 'All Activity' },
          { key: 'cash_in',  label: '📥 Money In' },
          { key: 'cash_out', label: '📤 Money Out' },
        ].map(opt => (
          <Button
            key={opt.key}
            variant={showOnlyType === opt.key ? 'default' : 'outline'}
            size="sm"
            className="h-10 rounded-full px-4 text-sm"
            onClick={() => setShowOnlyType(opt.key as typeof showOnlyType)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Transaction list */}
      {loadingLedger ? (
        <div className="space-y-3">
          {[...Array(5)].map((_,i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Wallet className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-base">No transactions yet</p>
          <p className="text-sm">Nothing to show for the selected filter</p>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
            Transaction History ({filtered.length} records)
          </p>
          {Object.entries(grouped).map(([dateKey, dayEntries]) => {
            const dayIn  = dayEntries.filter(e=>e.direction==='cash_in').reduce((s,e)=>s+e.amount, 0);
            const dayOut = dayEntries.filter(e=>e.direction==='cash_out').reduce((s,e)=>s+e.amount, 0);
            return (
              <div key={dateKey}>
                {/* Day header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-bold text-muted-foreground">
                      {format(new Date(dateKey), 'EEEE, MMM d, yyyy')}
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs font-semibold">
                    {dayIn  > 0 && <span className="text-success">+{formatUGX(dayIn)}</span>}
                    {dayOut > 0 && <span className="text-destructive">-{formatUGX(dayOut)}</span>}
                  </div>
                </div>

                <div className="space-y-2">
                  {dayEntries.map(entry => {
                    const isIn     = entry.direction === 'cash_in';
                    const info     = getCategoryInfo(entry.category, entry.direction);
                    const isMgr    = entry.category === 'manager_credit' || entry.category === 'manager_debit';
                    return (
                      <div
                        key={entry.id}
                        className={`flex items-center gap-4 p-4 rounded-2xl border ${
                          isMgr ? 'bg-warning/5 border-warning/30' : 'bg-card'
                        }`}
                      >
                        {/* Emoji icon */}
                        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${
                          isIn ? 'bg-success/10' : 'bg-destructive/10'
                        }`}>
                          {info.emoji}
                        </div>

                        {/* Description */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-sm leading-tight">{info.label}</p>
                            {isMgr && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-warning text-warning">
                                Manager
                              </Badge>
                            )}
                          </div>
                          {entry.linked_party && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {isMgr ? `By: ${entry.linked_party}` : entry.linked_party}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(entry.date), 'h:mm a')}
                            {entry.reference_id && ` · #${entry.reference_id.slice(0, 8)}`}
                          </p>
                        </div>

                        {/* Amount + balance */}
                        <div className="text-right shrink-0">
                          <p className={`font-extrabold text-base ${isIn ? 'text-success' : 'text-destructive'}`}>
                            {isIn ? '+' : '-'}{formatUGX(entry.amount)}
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            Balance: {formatUGX(entry.balance_after)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ ADJUSTMENT DIALOG ═══════════════════════════════════════════ */}
      <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl mx-4">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              {adjType === 'add' ? (
                <><PlusCircle className="h-6 w-6 text-success" /> Add Money to Wallet</>
              ) : (
                <><MinusCircle className="h-6 w-6 text-destructive" /> Remove Money from Wallet</>
              )}
            </DialogTitle>
            <DialogDescription className="text-base">
              <span className="font-semibold">{selectedUser.full_name}</span> — current balance:{' '}
              <span className="font-bold text-foreground">{formatUGX(selectedUser.balance)}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">

            {/* Toggle */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAdjType('add')}
                style={{ touchAction: 'manipulation' }}
                className={`h-16 rounded-2xl text-base font-bold flex items-center justify-center gap-2 border-2 transition-all ${
                  adjType === 'add'
                    ? 'bg-success text-white border-success'
                    : 'bg-card text-muted-foreground border-border'
                }`}
              >
                <PlusCircle className="h-6 w-6" />
                Add Money
              </button>
              <button
                type="button"
                onClick={() => setAdjType('remove')}
                style={{ touchAction: 'manipulation' }}
                className={`h-16 rounded-2xl text-base font-bold flex items-center justify-center gap-2 border-2 transition-all ${
                  adjType === 'remove'
                    ? 'bg-destructive text-white border-destructive'
                    : 'bg-card text-muted-foreground border-border'
                }`}
              >
                <MinusCircle className="h-6 w-6" />
                Remove
              </button>
            </div>

            {/* Amount input */}
            <div className="space-y-2">
              <Label className="text-base font-bold">How much? (UGX)</Label>
              <Input
                type="number"
                placeholder="e.g. 50000"
                value={adjAmount}
                onChange={e => {
                  const v = e.target.value;
                  if (v === '' || (Number(v) >= 0 && !isNaN(Number(v)))) setAdjAmount(v);
                }}
                min={1}
                className="h-14 text-2xl font-bold text-center rounded-xl"
              />
            </div>

            {/* Quick amounts */}
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAdjAmount(q.toString())}
                  style={{ touchAction: 'manipulation' }}
                  className="flex-1 min-w-[80px] h-11 rounded-xl border bg-card hover:bg-muted/50 text-sm font-semibold transition-colors"
                >
                  {formatUGX(q)}
                </button>
              ))}
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label className="text-base font-bold">
                Why are you doing this? <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder={adjType === 'add'
                  ? "e.g. Refund for failed withdrawal, Agent bonus payment…"
                  : "e.g. Recovering incorrect deposit, Penalty deduction…"
                }
                value={adjReason}
                onChange={e => setAdjReason(e.target.value)}
                rows={3}
                className="text-base rounded-xl"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <BadgeInfo className="h-3 w-3" />
                This reason is saved permanently for the audit record
              </p>
            </div>

            {/* Preview new balance */}
            {adjAmount && parseFloat(adjAmount) > 0 && (
              <div className={`p-4 rounded-2xl border-2 text-center ${
                adjType === 'add'
                  ? 'bg-success/10 border-success/40'
                  : 'bg-destructive/10 border-destructive/40'
              }`}>
                <p className="text-sm text-muted-foreground font-medium">New balance after this change</p>
                <p className={`text-3xl font-extrabold font-mono mt-1 ${adjType === 'add' ? 'text-success' : 'text-destructive'}`}>
                  {formatUGX(
                    adjType === 'add'
                      ? selectedUser.balance + parseFloat(adjAmount)
                      : Math.max(0, selectedUser.balance - parseFloat(adjAmount))
                  )}
                </p>
              </div>
            )}

            {/* Warning for remove */}
            {adjType === 'remove' && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-warning/10 border border-warning/30">
                <TriangleAlert className="h-5 w-5 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-warning">This cannot be undone</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Money removed from a wallet is permanently recorded in the audit log.
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setAdjOpen(false)} className="h-12 rounded-xl text-base">
              Cancel
            </Button>
            <Button
              onClick={handleAdjust}
              disabled={adjLoading || !adjAmount || parseFloat(adjAmount) <= 0 || !adjReason.trim()}
              className={`h-12 rounded-xl text-base font-bold flex-1 gap-2 ${
                adjType === 'remove' ? 'bg-destructive hover:bg-destructive/90' : ''
              }`}
            >
              {adjLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : adjType === 'add' ? (
                <><PlusCircle className="h-5 w-5" /> Confirm — Add {adjAmount ? formatUGX(parseFloat(adjAmount)) : ''}</>
              ) : (
                <><MinusCircle className="h-5 w-5" /> Confirm — Remove {adjAmount ? formatUGX(parseFloat(adjAmount)) : ''}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

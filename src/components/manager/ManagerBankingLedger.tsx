import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Search,
  Loader2,
  Landmark,
  TrendingUp,
  TrendingDown,
  Plus,
  Minus,
  ArrowUpDown,
  Calendar,
  RefreshCw,
  Users,
  Banknote,
  ArrowDownToLine,
  Coins,
  CheckCircle2,
  Gift,
  ChevronRight,
  Filter,
  FileText,
  TriangleAlert,
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

/* ─── Category meta ──────────────────────────────────────────────────────── */

const CATEGORY_META: Record<string, { label: string; Icon: React.ElementType; colorClass: string }> = {
  referral_bonus:             { label: 'Referral Bonus',          Icon: Users,          colorClass: 'text-primary bg-primary/10' },
  agent_commission:           { label: 'Commission Earned',        Icon: TrendingUp,     colorClass: 'text-success bg-success/10' },
  approval_bonus:             { label: 'Approval Bonus',           Icon: CheckCircle2,   colorClass: 'text-success bg-success/10' },
  subagent_commission:        { label: 'Sub-agent Commission',     Icon: TrendingUp,     colorClass: 'text-success bg-success/10' },
  referral_first_transaction: { label: 'First Transaction Bonus',  Icon: Gift,           colorClass: 'text-warning bg-warning/10' },
  welcome_bonus:              { label: 'Welcome Bonus',            Icon: Gift,           colorClass: 'text-warning bg-warning/10' },
  deposit:                    { label: 'Mobile Money Deposit',     Icon: Landmark,       colorClass: 'text-primary bg-primary/10' },
  wallet_withdrawal:          { label: 'Withdrawal',               Icon: ArrowDownToLine,colorClass: 'text-destructive bg-destructive/10' },
  supporter_reward:           { label: 'Supporter Reward',         Icon: Coins,          colorClass: 'text-success bg-success/10' },
  rent_repayment:             { label: 'Rent Repayment',           Icon: Banknote,       colorClass: 'text-primary bg-primary/10' },
  manager_credit:             { label: 'Manager Credit',           Icon: Plus,           colorClass: 'text-success bg-success/10' },
  manager_debit:              { label: 'Manager Debit',            Icon: Minus,          colorClass: 'text-destructive bg-destructive/10' },
};

function getCategoryMeta(category: string, direction: string) {
  const meta = CATEGORY_META[category];
  if (meta) return meta;
  if (direction === 'cash_out') return { label: category.replace(/_/g, ' '), Icon: ArrowDownToLine, colorClass: 'text-destructive bg-destructive/10' };
  return { label: category.replace(/_/g, ' '), Icon: Banknote, colorClass: 'text-muted-foreground bg-muted' };
}

/* ─── Quick amounts ──────────────────────────────────────────────────────── */

const QUICK_AMOUNTS = [5_000, 10_000, 50_000, 100_000, 500_000];

/* ─── Main component ─────────────────────────────────────────────────────── */

export function ManagerBankingLedger() {
  const { user } = useAuth();

  // Search / user list
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers]         = useState<UserSummary[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Selected user
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [ledger, setLedger]       = useState<LedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [filterDir, setFilterDir] = useState<'all' | 'cash_in' | 'cash_out'>('all');

  // Adjustment dialog
  const [adjOpen, setAdjOpen]     = useState(false);
  const [adjType, setAdjType]     = useState<'credit' | 'debit'>('credit');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjLoading, setAdjLoading] = useState(false);

  /* ── Fetch users with balances ── */
  const fetchUsers = useCallback(async (q: string) => {
    setLoadingUsers(true);
    try {
      let query = supabase
        .from('profiles')
        .select('id, full_name, phone, email')
        .order('full_name');

      if (q.trim()) {
        query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
      }

      const { data: profiles, error } = await query.limit(50);
      if (error) throw error;

      if (!profiles?.length) { setUsers([]); return; }

      const ids = profiles.map(p => p.id);

      // Batch fetch wallets + ledger summaries
      const [walletsRes, ledgerRes] = await Promise.all([
        supabase.from('wallets').select('user_id, id, balance').in('user_id', ids),
        supabase
          .from('general_ledger')
          .select('user_id, direction, amount')
          .in('user_id', ids),
      ]);

      const walletMap = new Map(
        (walletsRes.data || []).map(w => [w.user_id, { id: w.id, balance: w.balance }])
      );

      // Aggregate per user
      const ledgerAgg = new Map<string, { totalIn: number; totalOut: number; count: number }>();
      for (const row of ledgerRes.data || []) {
        const agg = ledgerAgg.get(row.user_id) || { totalIn: 0, totalOut: 0, count: 0 };
        if (row.direction === 'cash_in') agg.totalIn += row.amount;
        else agg.totalOut += row.amount;
        agg.count++;
        ledgerAgg.set(row.user_id, agg);
      }

      const summaries: UserSummary[] = profiles.map(p => {
        const w = walletMap.get(p.id);
        const agg = ledgerAgg.get(p.id) || { totalIn: 0, totalOut: 0, count: 0 };
        return {
          id: p.id,
          full_name: p.full_name,
          phone: p.phone,
          email: p.email,
          balance: w?.balance ?? 0,
          walletId: w?.id ?? null,
          totalIn: agg.totalIn,
          totalOut: agg.totalOut,
          entryCount: agg.count,
        };
      });

      setUsers(summaries);
    } catch (e) {
      console.error('[ManagerBankingLedger] fetchUsers', e);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers('');
  }, [fetchUsers]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => fetchUsers(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, fetchUsers]);

  /* ── Fetch ledger for selected user ── */
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
      const chronological = [...(data || [])].reverse();
      const withBalance: LedgerEntry[] = chronological.map(row => {
        if (row.direction === 'cash_in') running += row.amount;
        else running -= row.amount;
        return {
          id: row.id,
          date: row.transaction_date,
          direction: row.direction as 'cash_in' | 'cash_out',
          category: row.category,
          description: row.description || getCategoryMeta(row.category, row.direction).label,
          amount: row.amount,
          reference_id: row.reference_id,
          linked_party: row.linked_party,
          balance_after: Math.max(0, running),
        };
      });

      setLedger(withBalance.reverse()); // newest first
    } catch (e) {
      console.error('[ManagerBankingLedger] fetchLedger', e);
    } finally {
      setLoadingLedger(false);
    }
  }, []);

  const selectUser = (u: UserSummary) => {
    setSelectedUser(u);
    setFilterDir('all');
    fetchLedger(u.id);
  };

  const handleBack = () => {
    setSelectedUser(null);
    setLedger([]);
    fetchUsers(searchQuery);
  };

  /* ── Adjust balance ── */
  const handleAdjust = async () => {
    if (!selectedUser || !user) return;
    const amountNum = parseFloat(adjAmount);

    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!adjReason.trim()) {
      toast.error('A reason is required');
      return;
    }
    if (adjType === 'debit' && amountNum > selectedUser.balance) {
      toast.error(`Cannot debit more than balance (${formatUGX(selectedUser.balance)})`);
      return;
    }

    setAdjLoading(true);
    try {
      // Get / create wallet
      let { data: wallet, error: wErr } = await supabase
        .from('wallets')
        .select('id, balance')
        .eq('user_id', selectedUser.id)
        .maybeSingle();
      if (wErr) throw wErr;

      if (!wallet) {
        const { data: nw, error: nwErr } = await supabase
          .from('wallets')
          .insert({ user_id: selectedUser.id, balance: 0 })
          .select('id, balance')
          .single();
        if (nwErr) throw nwErr;
        wallet = nw;
      }

      const delta    = adjType === 'credit' ? amountNum : -amountNum;
      const newBal   = Math.max(0, wallet.balance + delta);

      // Optimistic-lock update
      const { data: updated, error: uErr } = await supabase
        .from('wallets')
        .update({ balance: newBal, updated_at: new Date().toISOString() })
        .eq('user_id', selectedUser.id)
        .eq('balance', wallet.balance)
        .select();

      if (uErr) throw uErr;
      if (!updated || updated.length === 0) {
        const { data: fw } = await supabase
          .from('wallets').select('balance').eq('user_id', selectedUser.id).single();
        toast.error(fw
          ? `Balance changed (now ${formatUGX(fw.balance)}). Refresh and try again.`
          : 'Balance changed. Refresh and try again.');
        return;
      }

      // Reference ID: WBA + YYMMDD + 4 digits
      const now = new Date();
      const ref = `WBA${String(now.getFullYear()).slice(-2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}${String(Math.floor(1000+Math.random()*9000))}`;

      // Ledger entry
      await supabase.from('general_ledger').insert({
        user_id:         selectedUser.id,
        amount:          amountNum,
        direction:       adjType === 'credit' ? 'cash_in' : 'cash_out',
        category:        adjType === 'credit' ? 'manager_credit' : 'manager_debit',
        source_table:    'wallets',
        source_id:       wallet.id,
        description:     `Manager ${adjType}: ${adjReason.trim()}`,
        reference_id:    ref,
        linked_party:    user.email || 'Manager',
        running_balance: newBal,
      });

      // Wallet transactions history
      await supabase.from('wallet_transactions').insert({
        sender_id:    adjType === 'debit'  ? selectedUser.id : user.id,
        recipient_id: adjType === 'credit' ? selectedUser.id : user.id,
        amount:       amountNum,
        description:  `${adjType === 'credit' ? 'Credit' : 'Debit'} by Manager: ${adjReason.trim()} (Ref: ${ref})`,
      });

      const verb = adjType === 'credit' ? 'Credited' : 'Debited';
      toast.success(`${verb} ${formatUGX(amountNum)} ${adjType === 'credit' ? 'to' : 'from'} ${selectedUser.full_name}`);

      // Refresh UI
      const updatedUser = { ...selectedUser, balance: newBal };
      setSelectedUser(updatedUser);
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? updatedUser : u));
      fetchLedger(selectedUser.id);

      setAdjOpen(false);
      setAdjAmount('');
      setAdjReason('');
      setAdjType('credit');
    } catch (e) {
      console.error('[ManagerBankingLedger] adjust', e);
      toast.error('Adjustment failed. Please try again.');
    } finally {
      setAdjLoading(false);
    }
  };

  /* ── Filtered ledger entries ── */
  const filteredLedger = filterDir === 'all'
    ? ledger
    : ledger.filter(e => e.direction === filterDir);

  /* ── Grouped by date ── */
  const grouped = filteredLedger.reduce((acc, entry) => {
    const key = format(new Date(entry.date), 'yyyy-MM-dd');
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {} as Record<string, LedgerEntry[]>);

  /* ── Income / expense breakdown ── */
  const incomeSummary  = ledger
    .filter(e => e.direction === 'cash_in')
    .reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + e.amount; return acc; }, {} as Record<string,number>);
  const expenseSummary = ledger
    .filter(e => e.direction === 'cash_out')
    .reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + e.amount; return acc; }, {} as Record<string,number>);

  const totalIn  = ledger.filter(e => e.direction === 'cash_in').reduce((s,e) => s+e.amount, 0);
  const totalOut = ledger.filter(e => e.direction === 'cash_out').reduce((s,e) => s+e.amount, 0);

  /* ─── Render ──────────────────────────────────────────────────────────── */

  /* USER LIST VIEW */
  if (!selectedUser) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" />
              Banking Ledger
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Select any user to view & manage their account</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchUsers(searchQuery)} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone or email…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Aggregate stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground font-medium">Users</p>
              <p className="text-xl font-bold text-primary">{users.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-success/5 border-success/20">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground font-medium">Total Balances</p>
              <p className="text-sm font-bold text-success">{formatUGX(users.reduce((s,u) => s+u.balance, 0))}</p>
            </CardContent>
          </Card>
          <Card className="bg-warning/5 border-warning/20">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground font-medium">Total Entries</p>
              <p className="text-xl font-bold text-warning">{users.reduce((s,u) => s+u.entryCount, 0)}</p>
            </CardContent>
          </Card>
        </div>

        {/* User rows */}
        {loadingUsers ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No users found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => selectUser(u)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/50 transition-colors text-left"
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                    {u.full_name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{u.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.phone}</p>
                </div>
                <div className="text-right shrink-0 mr-1">
                  <p className={`font-bold text-sm ${u.balance > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                    {formatUGX(u.balance)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{u.entryCount} entries</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ─── LEDGER DETAIL VIEW ───────────────────────────────────────────── */

  return (
    <div className="space-y-4">

      {/* Header bar */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
          <ArrowUpDown className="h-4 w-4 rotate-90" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-base truncate">{selectedUser.full_name}</h2>
          <p className="text-xs text-muted-foreground">{selectedUser.phone}</p>
        </div>
        <Button
          size="sm"
          className="gap-2 bg-primary hover:bg-primary/90 shrink-0"
          onClick={() => setAdjOpen(true)}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          Adjust
        </Button>
        <Button variant="outline" size="icon" onClick={() => fetchLedger(selectedUser.id)}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Balance card */}
      <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-5">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Current Balance</p>
        <p className="text-4xl font-extrabold mt-1 font-mono">{formatUGX(selectedUser.balance)}</p>
        <div className="flex gap-4 mt-4 text-xs">
          <div>
            <p className="opacity-70">Total In</p>
            <p className="font-bold text-sm">+{formatUGX(totalIn)}</p>
          </div>
          <div>
            <p className="opacity-70">Total Out</p>
            <p className="font-bold text-sm">-{formatUGX(totalOut)}</p>
          </div>
          <div>
            <p className="opacity-70">Net</p>
            <p className="font-bold text-sm">{formatUGX(Math.max(0, totalIn - totalOut))}</p>
          </div>
        </div>
      </div>

      {/* Income Statement style breakdown */}
      {!loadingLedger && (Object.keys(incomeSummary).length > 0 || Object.keys(expenseSummary).length > 0) && (
        <div className="rounded-xl border overflow-hidden">
          {/* CREDITS */}
          {Object.keys(incomeSummary).length > 0 && (
            <>
              <div className="px-4 py-2 bg-success/5 border-b flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-success" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-success">Credits (Money In)</span>
              </div>
              {Object.entries(incomeSummary).map(([cat, amt]) => {
                const { label, Icon, colorClass } = getCategoryMeta(cat, 'cash_in');
                return (
                  <div key={cat} className="flex items-center justify-between px-4 py-2 border-b last:border-b-0 bg-card">
                    <div className="flex items-center gap-2.5">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center ${colorClass}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-sm text-muted-foreground">{label}</span>
                    </div>
                    <span className="font-mono text-sm font-semibold text-success">+{formatUGX(amt)}</span>
                  </div>
                );
              })}
              <div className="flex justify-between px-4 py-2 bg-success/10 font-bold border-b">
                <span className="text-sm">Subtotal Credits</span>
                <span className="font-mono text-sm text-success">+{formatUGX(totalIn)}</span>
              </div>
            </>
          )}

          {/* DEBITS */}
          {Object.keys(expenseSummary).length > 0 && (
            <>
              <div className="px-4 py-2 bg-destructive/5 border-b flex items-center gap-2">
                <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-destructive">Debits (Money Out)</span>
              </div>
              {Object.entries(expenseSummary).map(([cat, amt]) => {
                const { label, Icon, colorClass } = getCategoryMeta(cat, 'cash_out');
                return (
                  <div key={cat} className="flex items-center justify-between px-4 py-2 border-b last:border-b-0 bg-card">
                    <div className="flex items-center gap-2.5">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center ${colorClass}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-sm text-muted-foreground">{label}</span>
                    </div>
                    <span className="font-mono text-sm font-semibold text-destructive">-{formatUGX(amt)}</span>
                  </div>
                );
              })}
              <div className="flex justify-between px-4 py-2 bg-destructive/10 font-bold border-b">
                <span className="text-sm">Subtotal Debits</span>
                <span className="font-mono text-sm text-destructive">-{formatUGX(totalOut)}</span>
              </div>
            </>
          )}

          {/* NET */}
          <div className="flex justify-between px-4 py-3 bg-muted font-bold">
            <span className="text-sm">Net Balance</span>
            <span className={`font-mono text-sm ${totalIn - totalOut >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatUGX(Math.max(0, totalIn - totalOut))}
            </span>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        {(['all', 'cash_in', 'cash_out'] as const).map(d => (
          <Button
            key={d}
            variant={filterDir === d ? 'default' : 'outline'}
            size="sm"
            className="text-xs h-7 px-3"
            onClick={() => setFilterDir(d)}
          >
            {d === 'all' ? 'All' : d === 'cash_in' ? '↑ Credits' : '↓ Debits'}
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{filteredLedger.length} entries</span>
      </div>

      {/* Transaction timeline */}
      {loadingLedger ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : filteredLedger.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No transactions found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([dateKey, dayEntries]) => {
            const dayIn  = dayEntries.filter(e => e.direction === 'cash_in').reduce((s,e) => s+e.amount, 0);
            const dayOut = dayEntries.filter(e => e.direction === 'cash_out').reduce((s,e) => s+e.amount, 0);
            return (
              <div key={dateKey}>
                {/* Date header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold text-muted-foreground">
                      {format(new Date(dateKey), 'EEEE, MMM d, yyyy')}
                    </span>
                  </div>
                  <div className="flex gap-3 text-[10px]">
                    {dayIn  > 0 && <span className="text-success font-semibold">+{formatUGX(dayIn)}</span>}
                    {dayOut > 0 && <span className="text-destructive font-semibold">-{formatUGX(dayOut)}</span>}
                  </div>
                </div>

                <div className="space-y-2 pl-2 border-l-2 border-muted ml-2">
                  {dayEntries.map(entry => {
                    const isIn = entry.direction === 'cash_in';
                    const { label, Icon, colorClass } = getCategoryMeta(entry.category, entry.direction);
                    const isManagerAdj = entry.category === 'manager_credit' || entry.category === 'manager_debit';
                    return (
                      <div key={entry.id} className="relative pl-4">
                        <div className={`absolute -left-[9px] top-4 h-4 w-4 rounded-full border-2 border-background ${
                          isIn ? 'bg-success' : 'bg-destructive'
                        }`} />
                        <div className={`p-3 rounded-xl border shadow-sm ${isManagerAdj ? 'bg-warning/5 border-warning/30' : 'bg-card'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-semibold text-sm">{entry.description || label}</p>
                                  {isManagerAdj && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-warning text-warning">
                                      Manager Adj.
                                    </Badge>
                                  )}
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0 shrink-0 ${
                                      isIn
                                        ? 'border-success/30 text-success'
                                        : 'border-destructive/30 text-destructive'
                                    }`}
                                  >
                                    {isIn ? 'IN' : 'OUT'}
                                  </Badge>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {format(new Date(entry.date), 'h:mm a')}
                                  {entry.reference_id && ` · Ref: ${entry.reference_id.slice(0,10)}`}
                                  {entry.linked_party && ` · ${entry.linked_party}`}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`font-bold text-sm ${isIn ? 'text-success' : 'text-destructive'}`}>
                                {isIn ? '+' : '-'}{formatUGX(entry.amount)}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-mono">
                                Bal: {formatUGX(entry.balance_after)}
                              </p>
                            </div>
                          </div>
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

      {/* ── Adjustment Dialog ── */}
      <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" />
              Adjust Account — {selectedUser.full_name}
            </DialogTitle>
            <DialogDescription>
              Current balance: <strong>{formatUGX(selectedUser.balance)}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Credit / Debit toggle */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={adjType === 'credit' ? 'default' : 'outline'}
                className={`h-14 text-base font-bold gap-2 ${adjType === 'credit' ? 'bg-success hover:bg-success/90 text-white' : ''}`}
                onClick={() => setAdjType('credit')}
              >
                <Plus className="h-5 w-5" />
                Credit
              </Button>
              <Button
                type="button"
                variant={adjType === 'debit' ? 'default' : 'outline'}
                className={`h-14 text-base font-bold gap-2 ${adjType === 'debit' ? 'bg-destructive hover:bg-destructive/90 text-white' : ''}`}
                onClick={() => setAdjType('debit')}
              >
                <Minus className="h-5 w-5" />
                Debit
              </Button>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label>Amount (UGX)</Label>
              <Input
                type="number"
                placeholder="Enter amount"
                value={adjAmount}
                onChange={e => {
                  const v = e.target.value;
                  if (v === '' || (Number(v) >= 0 && !isNaN(Number(v)))) setAdjAmount(v);
                }}
                min={1}
                className="h-12 text-lg font-semibold"
              />
            </div>

            {/* Quick amounts */}
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map(q => (
                <Button
                  key={q}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAdjAmount(q.toString())}
                  className="flex-1 min-w-[70px]"
                >
                  {formatUGX(q)}
                </Button>
              ))}
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label>
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="Why are you making this adjustment? (required for audit trail)"
                value={adjReason}
                onChange={e => setAdjReason(e.target.value)}
                rows={2}
              />
            </div>

            {/* Preview */}
            {adjAmount && parseFloat(adjAmount) > 0 && (
              <div className={`p-3 rounded-xl border ${adjType === 'credit' ? 'bg-success/10 border-success/30' : 'bg-destructive/10 border-destructive/30'}`}>
                <p className="text-xs text-muted-foreground">New balance:</p>
                <p className={`text-xl font-bold font-mono ${adjType === 'credit' ? 'text-success' : 'text-destructive'}`}>
                  {formatUGX(
                    adjType === 'credit'
                      ? selectedUser.balance + parseFloat(adjAmount)
                      : Math.max(0, selectedUser.balance - parseFloat(adjAmount))
                  )}
                </p>
              </div>
            )}

            {adjType === 'debit' && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-warning/10 border border-warning/30">
                <TriangleAlert className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <p className="text-xs text-warning font-medium">
                  Debits are non-refundable and logged permanently in the audit trail.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAdjust}
              disabled={adjLoading || !adjAmount || parseFloat(adjAmount) <= 0 || !adjReason.trim()}
              className={`gap-2 ${adjType === 'debit' ? 'bg-destructive hover:bg-destructive/90' : ''}`}
            >
              {adjLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : adjType === 'credit' ? (
                <Plus className="h-4 w-4" />
              ) : (
                <Minus className="h-4 w-4" />
              )}
              {adjType === 'credit' ? 'Credit Account' : 'Debit Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

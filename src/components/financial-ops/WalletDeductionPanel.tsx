import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, AlertTriangle, Wallet, MinusCircle, Loader2, User, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUGX } from '@/lib/rentCalculations';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';

const DEDUCTION_CATEGORIES = [
  { value: 'fee_correction', label: 'Fee Correction' },
  { value: 'fraud_reversal', label: 'Fraud Reversal' },
  { value: 'penalty', label: 'Penalty' },
  { value: 'overpayment_reversal', label: 'Overpayment Reversal' },
  { value: 'general_adjustment', label: 'General Adjustment' },
  { value: 'cash_payout_retraction', label: 'Cash Payout Retraction' },
  { value: 'other', label: 'Other' },
];

const BALANCE_PRESETS = [
  { label: 'All with balance', min: 1, max: 999999999999 },
  { label: '1 – 10K', min: 1, max: 10000 },
  { label: '10K – 100K', min: 10000, max: 100000 },
  { label: '100K – 500K', min: 100000, max: 500000 },
  { label: '500K – 1M', min: 500000, max: 1000000 },
  { label: '1M+', min: 1000000, max: 999999999999 },
];

interface UserResult {
  id: string;
  full_name: string;
  phone: string;
  balance: number;
  withdrawable_balance: number;
  float_balance: number;
}

interface WalletDeductionPanelProps {
  /**
   * When 'balance', the panel opens directly on the "By Balance Range"
   * tab. Combined with `initialBalancePreset`, this lets callers (e.g.
   * the Financial Ops hero "229 with balance" pill) jump straight to a
   * pre-loaded list of every wallet currently holding money.
   */
  initialMode?: 'name' | 'balance';
  /** Min / max UGX to pre-fill and auto-search on mount. */
  initialBalancePreset?: { min: number; max: number };
}

export function WalletDeductionPanel({ initialMode = 'name', initialBalancePreset }: WalletDeductionPanelProps = {}) {
  const [searchMode, setSearchMode] = useState<'name' | 'balance'>(initialMode);
  const [searchQuery, setSearchQuery] = useState('');
  const [minBalance, setMinBalance] = useState(
    initialBalancePreset ? String(initialBalancePreset.min) : '',
  );
  const [maxBalance, setMaxBalance] = useState(
    initialBalancePreset ? String(initialBalancePreset.max) : '',
  );
  const [balanceSearchTriggered, setBalanceSearchTriggered] = useState(!!initialBalancePreset);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('general_adjustment');
  const [reason, setReason] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);
  const queryClient = useQueryClient();

  // Wipe any cached results from prior versions of these queries so no
  // operator sees stale `wallets.balance` snapshots after deploy.
  useEffect(() => {
    queryClient.removeQueries({ queryKey: ['deduction-user-search'] });
    queryClient.removeQueries({ queryKey: ['deduction-balance-search'] });
  }, [queryClient]);

  // Overlay live wallet bucket balances onto candidate users. CFO deductions
  // are allowed against the wallet bucket even when older strict ledger net is
  // lower, so the UI must not clamp results with get_user_available_balance.
  const overlayWalletBalances = async (
    rows: Array<{ id: string; full_name: string; phone: string }>,
  ): Promise<UserResult[]> => {
    if (rows.length === 0) return [];
    const { data } = await supabase
      .from('wallets')
      .select('user_id, balance, withdrawable_balance, float_balance')
      .in('user_id', rows.map((r) => r.id));
    const byUser = new Map((data || []).map((w) => [w.user_id, w]));
    return rows.map((r) => {
      const w = byUser.get(r.id);
      return {
        ...r,
        balance: Number(w?.balance ?? 0),
        withdrawable_balance: Math.max(0, Number(w?.withdrawable_balance ?? 0)),
        float_balance: Math.max(0, Number(w?.float_balance ?? 0)),
      };
    });
  };

  // Live wallet bucket for the selected user — this is what the backend now
  // enforces for CFO wallet deductions.
  const { data: availableBalance } = useQuery({
    queryKey: ['deduction-wallet-balance', selectedUser?.id],
    queryFn: async () => {
      if (!selectedUser) return null;
      const { data, error } = await supabase
        .from('wallets')
        .select('withdrawable_balance')
        .eq('user_id', selectedUser.id)
        .single();
      if (error) throw error;
      return Math.max(0, Number(data?.withdrawable_balance ?? 0));
    },
    enabled: !!selectedUser,
  });

  // Show the wallet bucket directly so operators can retract what is actually
  // visible in the wallet without strict-ledger false blocks.
  const trueBalance = selectedUser
    ? (availableBalance ?? selectedUser.withdrawable_balance)
    : 0;

  // Search users by name/phone
  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ['deduction-user-search', 'v2-ledger', searchQuery],
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      if (searchQuery.length < 3) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .or(`full_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
        .limit(10);

      if (!data || data.length === 0) return [];

      // Use ledger-true balances — never the cached wallets.balance column.
      return overlayLedgerBalances(
        data.map((u) => ({
          id: u.id,
          full_name: u.full_name || 'Unnamed',
          phone: u.phone || '',
        })),
      );
    },
    enabled: searchMode === 'name' && searchQuery.length >= 3,
  });

  // Search by balance range via RPC
  const { data: balanceResults, isFetching: balanceSearching } = useQuery({
    queryKey: ['deduction-balance-search', 'v2-ledger', minBalance, maxBalance, balanceSearchTriggered],
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const min = parseFloat(minBalance) || 0;
      const max = parseFloat(maxBalance) || 999999999999;
      const { data, error } = await supabase.rpc('search_wallets_by_balance', {
        p_min_balance: min,
        p_max_balance: max,
        // Match the hero "X with balance" count — operators expect every
        // wallet the hero is counting to surface here. 500 comfortably
        // covers the current active-wallet population.
        p_limit: 500,
      });
      if (error) {
        console.error('[WalletDeductionPanel] balance search RPC error:', error);
        throw error;
      }
      console.log('[WalletDeductionPanel] balance search', { min, max, count: (data || []).length });
      let rows = (data || []) as Array<{
        user_id: string;
        full_name: string | null;
        phone: string | null;
        balance: number | string;
        withdrawable_balance?: number | string | null;
        float_balance?: number | string | null;
      }>;
      // Float is company money we owe back to the user — operators MUST
      // see it as a separate figure so they never deduct from a liability.
      const mapped = rows.map((r) => ({
        id: r.user_id,
        full_name: r.full_name || 'Unnamed',
        phone: r.phone || '',
        balance: Number(r.balance ?? 0),
        withdrawable_balance: Number(r.withdrawable_balance ?? 0),
        float_balance: Number(r.float_balance ?? 0),
      }));

      // The RPC already returns ledger-backed figures. Re-check each row
      // against the backend gate so the list cannot display stale wallet cache.
      const clamped = await Promise.all(
        mapped.map(async (u) => {
          try {
            const { data: strict, error: sErr } = await supabase.rpc(
              'get_user_available_balance',
              { p_user_id: u.id },
            );
            if (sErr) throw sErr;
            const strictAvailable = Math.max(0, Number(strict ?? 0));
            return {
              ...u,
              withdrawable_balance: Math.min(u.withdrawable_balance, strictAvailable),
            };
          } catch {
            // RPC unavailable — fall back conservatively (don't trust cache).
            return { ...u, withdrawable_balance: 0, balance: 0 };
          }
        }),
      );
      return clamped;
    },
    enabled: searchMode === 'balance' && balanceSearchTriggered,
  });

  const applyPreset = (min: number, max: number) => {
    setMinBalance(String(min));
    setMaxBalance(String(max));
    setBalanceSearchTriggered(true);
  };

  // Deduction mutation
  const deductMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error('No user selected');
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) throw new Error('Invalid amount');
      if (reason.trim().length < 10) throw new Error('Reason must be at least 10 characters');

      const { data, error } = await supabase.functions.invoke('wallet-deduction', {
        body: {
          target_user_id: selectedUser.id,
          amount: numAmount,
          category,
          reason: reason.trim(),
        },
      });

      if (error || data?.error) {
        const msg = await extractEdgeFunctionError({ error, data }, 'Deduction failed');
        console.error('[WalletDeductionPanel] deduction failed:', msg, error);
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: (data) => {
      toast.success(`UGX ${parseFloat(amount).toLocaleString()} deducted from ${selectedUser?.full_name}. New balance: UGX ${data.new_balance?.toLocaleString()}`);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['deduction-user-search'] });
      queryClient.invalidateQueries({ queryKey: ['deduction-balance-search'] });
      queryClient.invalidateQueries({ queryKey: ['deduction-available-balance'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setConfirmStep(false);
      // Refresh the strict balance so the CFO immediately sees the corrected
      // ceiling after a "Maximum deductible" or "Balance changed" rejection.
      queryClient.invalidateQueries({ queryKey: ['deduction-available-balance'] });
    },
  });

  const resetForm = () => {
    setSelectedUser(null);
    setAmount('');
    setCategory('general_adjustment');
    setReason('');
    setConfirmStep(false);
    setSearchQuery('');
  };

  const numAmount = parseFloat(amount);
  const isValid = selectedUser && !isNaN(numAmount) && numAmount > 0 && reason.trim().length >= 10;

  const activeResults = searchMode === 'name' ? searchResults : balanceResults;
  const isSearching = searchMode === 'name' ? searching : balanceSearching;

  const UserList = ({ users }: { users: UserResult[] }) => (
    <div className="border border-border rounded-xl overflow-hidden divide-y divide-border max-h-[300px] overflow-y-auto">
      {users.map((u) => (
        <button
          key={u.id}
          onClick={() => { setSelectedUser(u); setSearchQuery(''); }}
          className="w-full flex items-center gap-3 p-3 hover:bg-accent/40 transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{u.full_name}</p>
            <p className="text-xs text-muted-foreground">{u.phone}</p>
            {u.float_balance > 0 && u.withdrawable_balance === 0 && (
              <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                Float only — company liability (not deductible)
              </p>
            )}
          </div>
          <div className="text-right shrink-0 space-y-0.5">
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Withdrawable</p>
              <p className="text-sm font-semibold leading-tight">{formatUGX(u.withdrawable_balance)}</p>
            </div>
            {u.float_balance > 0 && (
              <div className="mt-1">
                <p className="text-[10px] text-amber-600 leading-none">Float (owed)</p>
                <p className="text-xs font-medium text-amber-700 leading-tight">{formatUGX(u.float_balance)}</p>
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Step 1: Search user */}
      {!selectedUser ? (
        <div className="space-y-3">
          {/* Search mode toggle */}
          <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
            <button
              onClick={() => { setSearchMode('name'); setBalanceSearchTriggered(false); }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-all',
                searchMode === 'name' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Search className="h-3.5 w-3.5" /> By Name / Phone
            </button>
            <button
              onClick={() => setSearchMode('balance')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-all',
                searchMode === 'balance' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Filter className="h-3.5 w-3.5" /> By Balance Range
            </button>
          </div>

          {searchMode === 'name' ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Name or phone number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {searching && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                </div>
              )}

              {searchResults && searchResults.length > 0 && <UserList users={searchResults} />}

              {searchResults && searchResults.length === 0 && searchQuery.length >= 3 && !searching && (
                <p className="text-sm text-muted-foreground text-center py-3">No users found</p>
              )}
            </>
          ) : (
            <>
              {/* Quick presets */}
              <div className="flex flex-wrap gap-1.5">
                {BALANCE_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p.min, p.max)}
                    className="px-3 py-1.5 text-xs font-medium rounded-full border border-border hover:bg-primary/10 hover:border-primary/40 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Custom range */}
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  value={minBalance}
                  onChange={(e) => setMinBalance(e.target.value)}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="number"
                  placeholder="Max"
                  value={maxBalance}
                  onChange={(e) => setMaxBalance(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => setBalanceSearchTriggered(true)}
                  disabled={!minBalance && !maxBalance}
                >
                  Search
                </Button>
              </div>

              {balanceSearching && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching wallets...
                </div>
              )}

              {balanceResults && balanceResults.length > 0 && (
                <>
                  {(() => {
                    const withW = balanceResults.filter((u) => u.withdrawable_balance > 0);
                    const withF = balanceResults.filter((u) => u.float_balance > 0);
                    const totalW = withW.reduce((s, u) => s + u.withdrawable_balance, 0);
                    const totalF = withF.reduce((s, u) => s + u.float_balance, 0);
                    return (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">
                          {balanceResults.length} wallets
                        </span>
                        <span className="text-foreground">
                          <strong>{withW.length}</strong> with withdrawable · <strong>{formatUGX(totalW)}</strong>
                        </span>
                        {withF.length > 0 && (
                          <span className="text-amber-700">
                            <strong>{withF.length}</strong> carry float · <strong>{formatUGX(totalF)}</strong> <span className="text-amber-600">(owed)</span>
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <UserList users={balanceResults} />
                </>
              )}

              {balanceResults && balanceResults.length === 0 && balanceSearchTriggered && !balanceSearching && (
                <p className="text-sm text-muted-foreground text-center py-3">No wallets in this range</p>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {/* Selected user card */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{selectedUser.full_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedUser.phone}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={resetForm}>Change</Button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="rounded-lg border border-border p-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                  <Wallet className="h-3 w-3" /> Withdrawable
                </div>
                <p className="text-sm font-bold mt-0.5">{formatUGX(trueBalance)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Deductible from this tool</p>
              </div>
              <div className={cn(
                "rounded-lg border p-2.5",
                selectedUser.float_balance > 0 ? "border-amber-300 bg-amber-50" : "border-border opacity-60"
              )}>
                <div className={cn(
                  "flex items-center gap-1.5 text-[10px] uppercase tracking-wide",
                  selectedUser.float_balance > 0 ? "text-amber-700" : "text-muted-foreground"
                )}>
                  <AlertTriangle className="h-3 w-3" /> Float (owed)
                </div>
                <p className={cn(
                  "text-sm font-bold mt-0.5",
                  selectedUser.float_balance > 0 ? "text-amber-800" : ""
                )}>{formatUGX(selectedUser.float_balance)}</p>
                <p className={cn(
                  "text-[10px] mt-0.5",
                  selectedUser.float_balance > 0 ? "text-amber-700" : "text-muted-foreground"
                )}>Company liability — not deductible</p>
              </div>
            </div>
          </div>

          {/* Step 2: Amount & details */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Amount (UGX)</Label>
              <Input
                type="number"
                placeholder="e.g. 50000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={1}
                className="mt-1"
              />
              {numAmount > trueBalance && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Exceeds available balance
                </p>
              )}
            </div>

            <div>
              <Label className="text-sm font-semibold">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEDUCTION_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold">Reason (min 10 characters)</Label>
              <Textarea
                placeholder="Describe why this deduction is being made..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 min-h-[80px]"
              />
              <p className={cn("text-xs mt-1", reason.trim().length < 10 ? "text-muted-foreground" : "text-success")}>
                {reason.trim().length}/10 characters
              </p>
            </div>

            {/* Confirm step */}
            {!confirmStep ? (
              <Button
                onClick={() => setConfirmStep(true)}
                disabled={!isValid || numAmount > trueBalance}
                className="w-full gap-2"
                variant="destructive"
              >
                <MinusCircle className="h-4 w-4" />
                Review Deduction
              </Button>
            ) : (
              <div className="space-y-3 p-4 rounded-xl border-2 border-destructive/40 bg-destructive/5">
                <div className="flex items-center gap-2 text-destructive font-bold text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  Confirm Wallet Deduction
                </div>
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">User:</span> {selectedUser.full_name}</p>
                  <p><span className="text-muted-foreground">Amount:</span> {formatUGX(numAmount)}</p>
                  <p><span className="text-muted-foreground">Category:</span> {DEDUCTION_CATEGORIES.find(c => c.value === category)?.label}</p>
                  <p><span className="text-muted-foreground">Reason:</span> {reason}</p>
                  <p><span className="text-muted-foreground">New Available:</span> {formatUGX(trueBalance - numAmount)}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setConfirmStep(false)}
                    disabled={deductMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => deductMutation.mutate()}
                    disabled={deductMutation.isPending}
                  >
                    {deductMutation.isPending ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Processing...</>
                    ) : (
                      <><MinusCircle className="h-3 w-3" /> Confirm Deduction</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

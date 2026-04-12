import { useState } from 'react';
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
}

export function WalletDeductionPanel() {
  const [searchMode, setSearchMode] = useState<'name' | 'balance'>('name');
  const [searchQuery, setSearchQuery] = useState('');
  const [minBalance, setMinBalance] = useState('');
  const [maxBalance, setMaxBalance] = useState('');
  const [balanceSearchTriggered, setBalanceSearchTriggered] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('general_adjustment');
  const [reason, setReason] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);
  const queryClient = useQueryClient();

  // Search users by name/phone
  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ['deduction-user-search', searchQuery],
    queryFn: async () => {
      if (searchQuery.length < 3) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .or(`full_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
        .limit(10);

      if (!data || data.length === 0) return [];

      const userIds = data.map(u => u.id);
      const { data: wallets } = await supabase
        .from('wallets')
        .select('user_id, balance')
        .in('user_id', userIds);

      const walletMap = new Map((wallets || []).map(w => [w.user_id, w.balance]));

      return data.map(u => ({
        id: u.id,
        full_name: u.full_name || 'Unnamed',
        phone: u.phone || '',
        balance: walletMap.get(u.id) || 0,
      }));
    },
    enabled: searchMode === 'name' && searchQuery.length >= 3,
  });

  // Search by balance range via RPC
  const { data: balanceResults, isFetching: balanceSearching } = useQuery({
    queryKey: ['deduction-balance-search', minBalance, maxBalance, balanceSearchTriggered],
    queryFn: async () => {
      const min = parseFloat(minBalance) || 0;
      const max = parseFloat(maxBalance) || 999999999999;
      const { data, error } = await supabase.rpc('search_wallets_by_balance', {
        p_min_balance: min,
        p_max_balance: max,
        p_limit: 100,
      });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.user_id,
        full_name: r.full_name || 'Unnamed',
        phone: r.phone || '',
        balance: Number(r.balance || 0),
      }));
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

      if (error) throw new Error(error.message || 'Deduction failed');
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`UGX ${parseFloat(amount).toLocaleString()} deducted from ${selectedUser?.full_name}. New balance: UGX ${data.new_balance?.toLocaleString()}`);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['deduction-user-search'] });
      queryClient.invalidateQueries({ queryKey: ['deduction-balance-search'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setConfirmStep(false);
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
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="text-sm font-semibold">{formatUGX(u.balance)}</p>
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
                  <p className="text-xs text-muted-foreground">
                    {balanceResults.length} wallets found · Total: {formatUGX(balanceResults.reduce((s: number, u: UserResult) => s + u.balance, 0))}
                  </p>
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
          <div className="p-4 rounded-xl border border-border bg-card space-y-1">
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
            <div className="flex items-center gap-2 mt-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Balance: <strong>{formatUGX(selectedUser.balance)}</strong></span>
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
              {numAmount > selectedUser.balance && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Exceeds wallet balance
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
                disabled={!isValid || numAmount > selectedUser.balance}
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
                  <p><span className="text-muted-foreground">New Balance:</span> {formatUGX(selectedUser.balance - numAmount)}</p>
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

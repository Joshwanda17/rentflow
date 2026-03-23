import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Hash,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Clock,
  Plus,
} from 'lucide-react';

interface MatchResult {
  id: string;
  user_id: string;
  amount: number;
  transaction_id: string | null;
  provider: string | null;
  created_at: string;
  notes: string | null;
  userName: string;
  userPhone: string;
  status: 'matched' | 'amount_mismatch';
}

interface PreRegisteredTid {
  id: string;
  transaction_id: string;
  amount: number;
  provider: string;
  notes: string | null;
  status: string;
  matched_deposit_id: string | null;
  matched_at: string | null;
  created_at: string;
}

export function TidVerification() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'verify' | 'preregister'>('verify');

  // Verify mode state
  const [tid, setTid] = useState('');
  const [operatorAmount, setOperatorAmount] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  // Pre-register mode state
  const [preTid, setPreTid] = useState('');
  const [preAmount, setPreAmount] = useState('');
  const [preProvider, setPreProvider] = useState('mtn');
  const [preNotes, setPreNotes] = useState('');
  const [registering, setRegistering] = useState(false);
  const [preRegistered, setPreRegistered] = useState<PreRegisteredTid[]>([]);
  const [loadingPre, setLoadingPre] = useState(false);

  // Load pre-registered TIDs
  const loadPreRegistered = useCallback(async () => {
    setLoadingPre(true);
    try {
      const { data, error } = await supabase
        .from('pre_registered_tids')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setPreRegistered((data as any[]) || []);
    } catch (err) {
      console.error('Failed to load pre-registered TIDs:', err);
    } finally {
      setLoadingPre(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'preregister') {
      loadPreRegistered();
    }
  }, [mode, loadPreRegistered]);

  // === VERIFY MODE LOGIC ===
  const handleSearch = useCallback(async () => {
    const trimmedTid = tid.trim();
    if (!trimmedTid) {
      toast.error('Enter a Transaction ID');
      return;
    }

    setSearching(true);
    setMatches([]);
    setSearched(false);

    try {
      const { data: deposits, error } = await supabase
        .from('deposit_requests')
        .select('*')
        .eq('status', 'pending')
        .ilike('transaction_id', `%${trimmedTid}%`)
        .limit(20);

      if (error) throw error;

      if (!deposits?.length) {
        setSearched(true);
        setSearching(false);
        return;
      }

      const userIds = [...new Set(deposits.map(d => d.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);
      const pm = new Map(profiles?.map(p => [p.id, p]) || []);

      const enteredAmount = operatorAmount ? parseFloat(operatorAmount) : null;

      const results: MatchResult[] = deposits.map(d => {
        const profile = pm.get(d.user_id);
        const amountMatches = enteredAmount ? Math.abs(d.amount - enteredAmount) < 1 : true;
        return {
          id: d.id,
          user_id: d.user_id,
          amount: d.amount,
          transaction_id: d.transaction_id,
          provider: d.provider,
          created_at: d.created_at,
          notes: d.notes,
          userName: profile?.full_name || 'Unknown',
          userPhone: profile?.phone || '',
          status: amountMatches ? 'matched' : 'amount_mismatch',
        };
      });

      results.sort((a, b) => {
        if (a.status === 'matched' && b.status !== 'matched') return -1;
        if (a.status !== 'matched' && b.status === 'matched') return 1;
        return 0;
      });

      setMatches(results);
      setSearched(true);

      if (enteredAmount) {
        const exactMatches = results.filter(r => r.status === 'matched');
        if (exactMatches.length === 1) {
          toast.info('Found 1 exact match — TID and amount tally. Ready to auto-approve.');
        } else if (exactMatches.length > 1) {
          toast.warning(`Found ${exactMatches.length} matches — review and approve individually.`);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [tid, operatorAmount]);

  const handleAutoApprove = useCallback(async (match: MatchResult) => {
    if (!user) return;
    setApproving(match.id);

    try {
      const { data, error } = await supabase.functions.invoke('approve-deposit', {
        body: { deposit_request_id: match.id, action: 'approve' },
      });

      if (error) {
        const { extractFromErrorObject } = await import('@/lib/extractEdgeFunctionError');
        const msg = await extractFromErrorObject(error, 'Failed to approve deposit');
        throw new Error(msg);
      }

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'tid_verified_approve',
        table_name: 'deposit_requests',
        record_id: match.id,
        metadata: {
          transaction_id: match.transaction_id,
          amount: match.amount,
          depositor_name: match.userName,
          depositor_phone: match.userPhone,
          operator_entered_tid: tid.trim(),
          operator_entered_amount: operatorAmount || null,
        },
      });

      setApprovedIds(prev => new Set(prev).add(match.id));
      toast.success(`Approved ${formatUGX(match.amount)} deposit for ${match.userName}`);

      queryClient.invalidateQueries({ queryKey: ['approval-queue-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['financial-ops-pulse'] });
    } catch (err: any) {
      toast.error(err.message || 'Approval failed');
    } finally {
      setApproving(null);
    }
  }, [user, tid, operatorAmount, queryClient]);

  const handleAutoApproveAll = useCallback(async () => {
    const exactMatches = matches.filter(m => m.status === 'matched' && !approvedIds.has(m.id));
    if (!exactMatches.length) return;
    for (const match of exactMatches) {
      await handleAutoApprove(match);
    }
  }, [matches, approvedIds, handleAutoApprove]);

  const resetSearch = () => {
    setTid('');
    setOperatorAmount('');
    setMatches([]);
    setSearched(false);
    setApprovedIds(new Set());
  };

  // === PRE-REGISTER MODE LOGIC ===
  const handlePreRegister = useCallback(async () => {
    const trimmedTid = preTid.trim().toUpperCase();
    if (!trimmedTid || !preAmount) {
      toast.error('TID and Amount are required');
      return;
    }
    if (!user) return;

    setRegistering(true);
    try {
      // Check if this TID already exists
      const { data: existing } = await supabase
        .from('pre_registered_tids')
        .select('id')
        .eq('transaction_id', trimmedTid)
        .eq('status', 'waiting')
        .limit(1);

      if (existing && existing.length > 0) {
        toast.error('This TID is already pre-registered and waiting');
        setRegistering(false);
        return;
      }

      // Check if there's already a pending deposit with this TID (instant match)
      const normalizedTid = trimmedTid.startsWith('TID') ? trimmedTid : `TID${trimmedTid}`;
      const { data: pendingDeposits } = await supabase
        .from('deposit_requests')
        .select('*')
        .eq('status', 'pending')
        .or(`transaction_id.ilike.%${trimmedTid}%,transaction_id.ilike.%${normalizedTid}%`)
        .limit(5);

      const parsedAmount = parseFloat(preAmount);
      const matchedDeposit = pendingDeposits?.find(d => Math.abs(d.amount - parsedAmount) < 1);

      if (matchedDeposit) {
        // Instant match found! Auto-approve the deposit
        const { error: approveError } = await supabase.functions.invoke('approve-deposit', {
          body: { deposit_request_id: matchedDeposit.id, action: 'approve' },
        });

        if (approveError) {
          const { extractFromErrorObject } = await import('@/lib/extractEdgeFunctionError');
          const msg = await extractFromErrorObject(approveError, 'Auto-approve failed');
          throw new Error(msg);
        }

        // Record the pre-registered TID as matched
        await supabase.from('pre_registered_tids').insert({
          transaction_id: trimmedTid,
          amount: parsedAmount,
          provider: preProvider,
          registered_by: user.id,
          notes: preNotes.trim() || null,
          status: 'matched',
          matched_deposit_id: matchedDeposit.id,
          matched_at: new Date().toISOString(),
        } as any);

        // Audit
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action_type: 'pre_registered_tid_instant_match',
          table_name: 'deposit_requests',
          record_id: matchedDeposit.id,
          metadata: {
            transaction_id: trimmedTid,
            amount: parsedAmount,
            provider: preProvider,
          },
        });

        toast.success(`Instant match! Deposit of ${formatUGX(matchedDeposit.amount)} auto-approved.`);
        queryClient.invalidateQueries({ queryKey: ['approval-queue-deposits'] });
        queryClient.invalidateQueries({ queryKey: ['financial-ops-pulse'] });
      } else {
        // No match yet, save for future matching
        const { error } = await supabase.from('pre_registered_tids').insert({
          transaction_id: trimmedTid,
          amount: parsedAmount,
          provider: preProvider,
          registered_by: user.id,
          notes: preNotes.trim() || null,
          status: 'waiting',
        } as any);

        if (error) throw error;
        toast.success('TID pre-registered. Will auto-approve when depositor submits.');
      }

      setPreTid('');
      setPreAmount('');
      setPreNotes('');
      loadPreRegistered();
    } catch (err: any) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setRegistering(false);
    }
  }, [preTid, preAmount, preProvider, preNotes, user, queryClient, loadPreRegistered]);

  const pendingMatches = matches.filter(m => m.status === 'matched' && !approvedIds.has(m.id));

  return (
    <Card>
      <CardHeader className="pb-2 px-3 sm:px-6">
        <CardTitle className="text-sm sm:text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          TID Verify
        </CardTitle>
        <p className="text-[10px] sm:text-xs text-muted-foreground">
          Verify existing deposits or pre-register TIDs for future auto-matching
        </p>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 pb-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="w-full h-9 mb-3">
            <TabsTrigger value="verify" className="flex-1 text-[11px] sm:text-xs gap-1">
              <Search className="h-3 w-3" /> Verify Now
            </TabsTrigger>
            <TabsTrigger value="preregister" className="flex-1 text-[11px] sm:text-xs gap-1">
              <Plus className="h-3 w-3" /> Pre-Register
            </TabsTrigger>
          </TabsList>

          {/* === VERIFY TAB === */}
          <TabsContent value="verify" className="space-y-3 mt-0">
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Transaction ID (TID) *</Label>
                <div className="relative">
                  <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={tid}
                    onChange={(e) => setTid(e.target.value.toUpperCase())}
                    placeholder="e.g. MP241231.1234.K56789"
                    className="pl-8 h-10 font-mono text-sm tracking-wide"
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs font-medium">Amount (optional)</Label>
                  <Input
                    type="number"
                    value={operatorAmount}
                    onChange={(e) => setOperatorAmount(e.target.value)}
                    placeholder="e.g. 15000"
                    className="h-10"
                  />
                </div>
                <div className="self-end">
                  <Button
                    onClick={handleSearch}
                    disabled={searching || !tid.trim()}
                    className="h-10 px-4"
                  >
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    <span className="ml-1.5">Verify</span>
                  </Button>
                </div>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {searched && matches.length === 0 && (
                <motion.div
                  key="no-match"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center py-6 text-center"
                >
                  <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
                    <XCircle className="h-6 w-6 text-destructive" />
                  </div>
                  <p className="text-sm font-medium">No pending deposit found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No match for "{tid.trim()}". You can pre-register this TID instead.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button variant="outline" size="sm" onClick={resetSearch}>
                      Try Another
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => {
                        setPreTid(tid.trim());
                        setMode('preregister');
                        resetSearch();
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Pre-Register
                    </Button>
                  </div>
                </motion.div>
              )}

              {matches.length > 0 && (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/50 rounded-lg p-2">
                    <div className="flex items-center gap-1.5 text-xs flex-wrap">
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        {matches.length} found
                      </Badge>
                      {pendingMatches.length > 0 && (
                        <Badge className="gap-1 bg-emerald-600 text-[10px]">
                          <Zap className="h-2.5 w-2.5" /> {pendingMatches.length} ready
                        </Badge>
                      )}
                    </div>
                    {pendingMatches.length > 1 && (
                      <Button size="sm" className="h-7 text-[11px] gap-1" onClick={handleAutoApproveAll} disabled={!!approving}>
                        <CheckCircle2 className="h-3 w-3" /> Approve All
                      </Button>
                    )}
                  </div>

                  <ScrollArea className="max-h-[50vh]">
                    <div className="space-y-2">
                      {matches.map((m) => {
                        const isApproved = approvedIds.has(m.id);
                        const isProcessing = approving === m.id;
                        return (
                          <div
                            key={m.id}
                            className={`rounded-lg border p-2.5 transition-colors ${
                              isApproved
                                ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20'
                                : m.status === 'matched'
                                ? 'border-emerald-200 bg-background'
                                : 'border-amber-200 bg-amber-50/30 dark:bg-amber-950/10'
                            }`}
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-xs sm:text-sm font-semibold truncate">{m.userName}</span>
                                <span className="text-xs sm:text-sm font-bold text-foreground shrink-0 tabular-nums">
                                  {formatUGX(m.amount)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-muted-foreground">{m.userPhone}</span>
                                {m.status === 'matched' ? (
                                  <Badge className="bg-emerald-600 text-[9px] h-4 gap-0.5 px-1">
                                    <CheckCircle2 className="h-2.5 w-2.5" /> Match
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-amber-600 border-amber-300 text-[9px] h-4 gap-0.5 px-1">
                                    <AlertTriangle className="h-2.5 w-2.5" /> Mismatch
                                  </Badge>
                                )}
                                {isApproved && (
                                  <Badge className="bg-emerald-700 text-[9px] h-4 px-1">Approved ✓</Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                                <span className="font-mono truncate max-w-[180px]">TID: {m.transaction_id || '—'}</span>
                                <span>{m.provider || 'MoMo'}</span>
                                <span>{format(new Date(m.created_at), 'dd MMM HH:mm')}</span>
                              </div>
                              {m.notes && <p className="text-[10px] text-muted-foreground italic truncate">"{m.notes}"</p>}
                              {!isApproved && m.status === 'matched' && (
                                <Button size="sm" className="h-8 text-xs gap-1 w-full mt-1" disabled={isProcessing} onClick={() => handleAutoApprove(m)}>
                                  {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                                  Auto-Approve
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={resetSearch} className="text-xs">Clear & Verify Another</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          {/* === PRE-REGISTER TAB === */}
          <TabsContent value="preregister" className="space-y-3 mt-0">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                📌 Pre-register a TID from your MoMo statement. When the depositor enters it on the app, their deposit will auto-approve instantly.
              </p>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Transaction ID *</Label>
                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={preTid}
                      onChange={(e) => setPreTid(e.target.value.toUpperCase())}
                      placeholder="e.g. MP241231.1234.K56789"
                      className="pl-8 h-10 font-mono text-sm tracking-wide"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Amount (UGX) *</Label>
                    <Input
                      type="number"
                      value={preAmount}
                      onChange={(e) => setPreAmount(e.target.value)}
                      placeholder="e.g. 50000"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Provider</Label>
                    <Select value={preProvider} onValueChange={setPreProvider}>
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mtn">MTN</SelectItem>
                        <SelectItem value="airtel">Airtel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Notes (optional)</Label>
                  <Input
                    value={preNotes}
                    onChange={(e) => setPreNotes(e.target.value)}
                    placeholder="e.g. Customer called to confirm"
                    className="h-10"
                  />
                </div>
                <Button
                  onClick={handlePreRegister}
                  disabled={registering || !preTid.trim() || !preAmount}
                  className="w-full h-10"
                >
                  {registering ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
                  Pre-Register TID
                </Button>
              </div>
            </div>

            {/* Pre-registered list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold">Recent Pre-Registered TIDs</h3>
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={loadPreRegistered} disabled={loadingPre}>
                  {loadingPre ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Refresh'}
                </Button>
              </div>
              {preRegistered.length === 0 && !loadingPre && (
                <p className="text-xs text-muted-foreground text-center py-4">No pre-registered TIDs yet</p>
              )}
              <ScrollArea className="max-h-[40vh]">
                <div className="space-y-1.5">
                  {preRegistered.map((t) => (
                    <div
                      key={t.id}
                      className={`rounded-lg border p-2.5 text-xs ${
                        t.status === 'matched'
                          ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20'
                          : 'border-border bg-background'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] truncate">{t.transaction_id}</span>
                        <span className="font-bold tabular-nums shrink-0">{formatUGX(t.amount)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-[9px] h-4 px-1 uppercase">{t.provider}</Badge>
                        {t.status === 'waiting' ? (
                          <Badge variant="secondary" className="text-[9px] h-4 gap-0.5 px-1 bg-warning/20 text-warning border-warning/30">
                            <Clock className="h-2.5 w-2.5" /> Waiting
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-600 text-[9px] h-4 gap-0.5 px-1">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Matched
                          </Badge>
                        )}
                        <span className="text-muted-foreground text-[10px]">
                          {format(new Date(t.created_at), 'dd MMM HH:mm')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

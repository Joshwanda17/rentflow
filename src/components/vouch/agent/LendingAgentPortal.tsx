import { useState, useEffect } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Banknote, ShieldCheck, Lock, Search, Loader2, AlertCircle, Plus,
  CheckCircle2, FileText, Wallet, TrendingUp, Info, Megaphone, Inbox, Trash2, X, Check,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useMyTrustScore } from '@/hooks/useMyTrustScore';
import { useAgentBalances } from '@/hooks/useAgentBalances';
import { useLendingAgentAgreement } from '@/hooks/useLendingAgentAgreement';
import { useTrustProfile } from '@/hooks/useTrustProfile';
import { LENDING_AGENT_MIN_TRUST_SCORE } from '@/components/vouch/agreements';
import LendingAgentAgreementModal from '@/components/vouch/agent/LendingAgentAgreementModal';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { generateWelileAiId } from '@/lib/welileAiId';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Loan {
  id: string;
  borrower_ai_id: string;
  borrower_display_name: string | null;
  principal_ugx: number;
  interest_rate_pct: number | null;
  amount_repaid_ugx: number;
  status: string;
  expected_repayment_date: string | null;
  created_at: string;
  platform_fee_ugx: number;
}

const PLATFORM_FEE_PCT = 0.01; // 1% per Lending Agent Agreement §4.3

export default function LendingAgentPortal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { snapshot, loading: trustLoading } = useMyTrustScore();
  const { withdrawableBalance, commissionBalance, refetch: refetchBalances } = useAgentBalances();
  const { isAccepted, acceptAgreement, isLoading: agreementLoading } = useLendingAgentAgreement();

  const [showAgreement, setShowAgreement] = useState(false);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loansLoading, setLoansLoading] = useState(false);

  // Borrower lookup
  const [aiIdInput, setAiIdInput] = useState('');
  const [activeAiId, setActiveAiId] = useState<string | null>(null);
  const { profile: borrower, loading: borrowerLoading, error: borrowerError } =
    useTrustProfile(activeAiId ?? undefined, { publicMode: true });

  // Loan form
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [principal, setPrincipal] = useState('');
  const [interestRate, setInterestRate] = useState('10');
  const [dueDate, setDueDate] = useState('');
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Loan offers (published to all users) + incoming requests
  const [offers, setOffers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [myName, setMyName] = useState<string | null>(null);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState({
    title: 'Quick Cash Loan',
    description: '',
    min_amount: '50000',
    max_amount: '500000',
    interest_rate: '10',
    min_duration: '7',
    max_duration: '30',
  });
  const myAiId = user ? generateWelileAiId(user.id) : null;

  const trustScore = snapshot?.score ?? 0;
  const lendablePool = withdrawableBalance + commissionBalance;
  const eligible = true; // Any user qualifies to lend

  // Load my disbursed loans when sheet opens & agreement is accepted
  useEffect(() => {
    if (!open || !user || !isAccepted) return;
    setLoansLoading(true);
    (async () => {
      const { data } = await (supabase
        .from('lending_agent_loans' as any)
        .select('*')
        .eq('lender_agent_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50) as any);
      if (data) setLoans(data as Loan[]);
      setLoansLoading(false);

      // Offers I've published
      const { data: offerData } = await (supabase
        .from('lending_agent_offers' as any)
        .select('*')
        .eq('lender_agent_id', user.id)
        .order('created_at', { ascending: false }) as any);
      if (offerData) setOffers(offerData);

      // Incoming loan requests
      const { data: reqData } = await (supabase
        .from('lending_loan_requests' as any)
        .select('*')
        .eq('lender_agent_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50) as any);
      if (reqData) setRequests(reqData);

      // My display name (used when publishing offers)
      const { data: prof } = await (supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle() as any);
      setMyName(prof?.full_name ?? null);
    })();
  }, [open, user, isAccepted]);

  const reloadRequests = async () => {
    if (!user) return;
    const { data } = await (supabase
      .from('lending_loan_requests' as any)
      .select('*')
      .eq('lender_agent_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50) as any);
    if (data) setRequests(data);
  };

  const handleCreateOffer = async () => {
    if (!user) return;
    const min = Number(offerForm.min_amount);
    const max = Number(offerForm.max_amount);
    if (!offerForm.title.trim()) { toast.error('Enter a title'); return; }
    if (!min || !max || min > max) { toast.error('Check the amount range'); return; }
    setSavingOffer(true);
    const { error } = await (supabase.from('lending_agent_offers' as any).insert({
      lender_agent_id: user.id,
      lender_display_name: myName,
      lender_ai_id: myAiId,
      title: offerForm.title.trim(),
      description: offerForm.description.trim() || null,
      min_amount_ugx: min,
      max_amount_ugx: max,
      interest_rate_pct: Number(offerForm.interest_rate) || 0,
      min_duration_days: Number(offerForm.min_duration) || 1,
      max_duration_days: Number(offerForm.max_duration) || 30,
      active: true,
    }) as any);
    setSavingOffer(false);
    if (error) { toast.error('Could not publish offer: ' + error.message); return; }
    toast.success('Loan offer published — any user can now request it');
    setShowOfferForm(false);
    const { data } = await (supabase
      .from('lending_agent_offers' as any)
      .select('*')
      .eq('lender_agent_id', user.id)
      .order('created_at', { ascending: false }) as any);
    if (data) setOffers(data);
  };

  const toggleOffer = async (id: string, active: boolean) => {
    await (supabase.from('lending_agent_offers' as any).update({ active }).eq('id', id) as any);
    setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, active } : o)));
  };

  const deleteOffer = async (id: string) => {
    await (supabase.from('lending_agent_offers' as any).delete().eq('id', id) as any);
    setOffers((prev) => prev.filter((o) => o.id !== id));
    toast.success('Offer removed');
  };

  const handleApproveRequest = async (req: any) => {
    if (!user) return;
    const principalNum = Number(req.requested_amount_ugx);
    const fee = Math.round(principalNum * PLATFORM_FEE_PCT);
    if (principalNum + fee > lendablePool) {
      toast.error(`Insufficient wallet balance. Need ${formatUGX(principalNum + fee)} (loan + 1% fee).`);
      return;
    }
    setDecidingId(req.id);
    const { data: loanRow, error } = await (supabase.from('lending_agent_loans' as any).insert({
      lender_agent_id: user.id,
      borrower_user_id: req.borrower_user_id,
      borrower_ai_id: req.borrower_ai_id,
      borrower_display_name: req.borrower_display_name,
      borrower_phone: req.borrower_phone,
      principal_ugx: principalNum,
      interest_rate_pct: req.interest_rate_pct ?? 0,
      expected_repayment_date: null,
      loan_purpose: req.purpose ?? null,
      platform_fee_ugx: fee,
      lender_trust_score_at_record: trustScore,
      status: 'active',
    }).select('id').single() as any);
    if (error) {
      setDecidingId(null);
      toast.error('Could not disburse: ' + error.message);
      return;
    }
    await (supabase.from('lending_loan_requests' as any)
      .update({ status: 'approved', decided_at: new Date().toISOString(), loan_id: loanRow?.id ?? null })
      .eq('id', req.id) as any);
    setDecidingId(null);
    toast.success(`Loan to ${req.borrower_display_name ?? req.borrower_ai_id} approved & recorded`);
    await reloadRequests();
    refetchBalances();
    const { data } = await (supabase
      .from('lending_agent_loans' as any)
      .select('*')
      .eq('lender_agent_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50) as any);
    if (data) setLoans(data as Loan[]);
  };

  const handleDeclineRequest = async (req: any) => {
    setDecidingId(req.id);
    await (supabase.from('lending_loan_requests' as any)
      .update({ status: 'declined', decided_at: new Date().toISOString() })
      .eq('id', req.id) as any);
    setDecidingId(null);
    toast.success('Request declined');
    await reloadRequests();
  };

  const handleLookup = () => {
    const cleaned = aiIdInput.trim().toUpperCase();
    if (!cleaned) { toast.error('Enter a borrower AI ID'); return; }
    setActiveAiId(cleaned);
    setShowLoanForm(false);
    setPrincipal(''); setInterestRate('10'); setDueDate(''); setPurpose('');
  };

  const handleAccept = async () => {
    const ok = await acceptAgreement(trustScore);
    if (ok) {
      toast.success('Agreement signed — you are now a Welile Lending Agent');
      setShowAgreement(false);
    }
    return ok;
  };

  const handleDisburse = async () => {
    if (!user || !borrower) return;
    const principalNum = Number(principal);
    if (!principalNum || principalNum <= 0) { toast.error('Enter a valid amount'); return; }
    const fee = Math.round(principalNum * PLATFORM_FEE_PCT);
    const totalDeduction = principalNum + fee;
    if (totalDeduction > lendablePool) {
      toast.error(`Insufficient wallet balance. Need ${formatUGX(totalDeduction)} (loan + 1% fee).`);
      return;
    }

    setSubmitting(true);
    const { error } = await (supabase.from('lending_agent_loans' as any).insert({
      lender_agent_id: user.id,
      borrower_user_id: borrower.user_id,
      borrower_ai_id: borrower.ai_id,
      borrower_display_name: borrower.identity?.full_name ?? null,
      borrower_phone: borrower.identity?.phone ?? null,
      principal_ugx: principalNum,
      interest_rate_pct: interestRate ? Number(interestRate) : 0,
      expected_repayment_date: dueDate || null,
      loan_purpose: purpose.trim() || null,
      platform_fee_ugx: fee,
      lender_trust_score_at_record: trustScore,
      borrower_trust_score_at_record: borrower.trust.score,
      borrower_trust_tier_at_record: borrower.trust.tier,
      status: 'active',
    }) as any);
    setSubmitting(false);

    if (error) {
      console.error('[LendingAgentPortal] disburse error', error);
      toast.error('Could not record loan: ' + error.message);
      return;
    }

    toast.success(`Loan to ${borrower.identity?.full_name ?? borrower.ai_id} recorded.`);
    // Reload loans
    const { data } = await (supabase
      .from('lending_agent_loans' as any)
      .select('*')
      .eq('lender_agent_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50) as any);
    if (data) setLoans(data as Loan[]);
    refetchBalances();
    setShowLoanForm(false);
    setPrincipal(''); setDueDate(''); setPurpose('');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[94vh] overflow-y-auto rounded-t-2xl px-4 pb-8 pt-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-500 to-primary flex items-center justify-center">
              <Banknote className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground tracking-tight">Lending Agent</p>
              <p className="text-[10px] text-muted-foreground">Lend to Welile users from your wallet</p>
            </div>
          </div>
          <Badge className="bg-amber-500/15 text-amber-700 border-0 text-[10px] font-bold">
            Peer Lending
          </Badge>
        </div>

        {/* Eligibility banner */}
        {trustLoading || agreementLoading ? (
          <Skeleton className="h-32 w-full rounded-xl mb-4" />
        ) : !eligible ? (
          <Card className="border-amber-500/40 bg-amber-500/5 mb-4">
            <CardContent className="p-4 flex items-start gap-3">
              <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-bold">Locked — Trust Score too low</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  You need a Welile Trust Score of at least <span className="font-bold text-foreground">{LENDING_AGENT_MIN_TRUST_SCORE}</span> (Good tier) to unlock the Lending Agent role.
                </p>
                <p className="text-xs">
                  Your score: <span className="font-bold">{trustScore}/100</span> · {snapshot?.tier ?? 'New'}
                </p>
                <p className="text-[11px] text-muted-foreground pt-1">
                  Boost your score by collecting rent on time, onboarding tenants & landlords, and growing your portfolio.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : !isAccepted ? (
          <Card className="border-primary/30 bg-primary/5 mb-4">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold">Sign the Lending Agent Agreement</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    You qualify (score {trustScore}/100). Read & accept the terms to start lending. Welile takes a <span className="font-bold text-foreground">1% platform fee</span> per loan. <span className="font-bold text-amber-700">Welile does NOT vouch your peer loans</span> — you bear the credit risk.
                  </p>
                </div>
              </div>
              <Button size="sm" className="w-full" onClick={() => setShowAgreement(true)}>
                <FileText className="h-4 w-4 mr-1.5" />
                Read & Sign Agreement
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Lending capacity */}
            <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-primary/5 mb-4">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Lendable Pool</p>
                  <Badge variant="outline" className="text-[10px]">
                    Score {trustScore}
                  </Badge>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{formatUGX(lendablePool)}</p>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                  <span><Wallet className="h-3 w-3 inline mr-1" />Withdrawable: {formatUGX(withdrawableBalance)}</span>
                  <span>· Commission: {formatUGX(commissionBalance)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Borrower lookup */}
            <div className="space-y-2 mb-4">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Lookup Borrower by AI ID
              </Label>
              <div className="flex gap-2">
                <Input
                  value={aiIdInput}
                  onChange={(e) => setAiIdInput(e.target.value.toUpperCase())}
                  placeholder="WEL-XXXXXX"
                  className="h-10 text-sm font-mono"
                  onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                />
                <Button onClick={handleLookup} disabled={borrowerLoading} className="h-10">
                  {borrowerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Borrower card */}
            {activeAiId && borrowerLoading && (
              <Skeleton className="h-40 w-full rounded-xl mb-4" />
            )}
            {borrowerError && (
              <Card className="border-destructive/30 bg-destructive/5 mb-4">
                <CardContent className="p-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <p className="text-xs">{borrowerError}</p>
                </CardContent>
              </Card>
            )}
            {borrower && !borrowerLoading && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
                <Card className="border-primary/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {borrower.identity?.full_name ?? borrower.ai_id}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-[9px] uppercase text-muted-foreground">Score</p>
                        <p className="text-base font-bold">{borrower.trust.score}</p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-[9px] uppercase text-muted-foreground">Tier</p>
                        <p className="text-xs font-bold capitalize">{borrower.trust.tier}</p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-[9px] uppercase text-muted-foreground">Cash flow / mo</p>
                        <p className="text-xs font-bold">{formatUGX(borrower.cash_flow_capacity?.monthly_avg ?? 0)}</p>
                      </div>
                    </div>

                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 flex items-start gap-2">
                      <Info className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
                      <p className="text-[10px] leading-relaxed">
                        <span className="font-bold">Welile does NOT vouch this loan.</span> You bear 100% of the credit risk. Decide based on borrower's score, cash flow, and history.
                      </p>
                    </div>

                    {!showLoanForm ? (
                      <Button size="sm" className="w-full" onClick={() => setShowLoanForm(true)}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        Disburse Loan
                      </Button>
                    ) : (
                      <div className="space-y-2 p-3 rounded-lg bg-background border">
                        <div>
                          <Label className="text-xs">Principal (UGX) *</Label>
                          <Input
                            type="number"
                            value={principal}
                            onChange={(e) => setPrincipal(e.target.value)}
                            placeholder="500000"
                            className="h-9 text-sm"
                          />
                          {principal && Number(principal) > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              + 1% fee ({formatUGX(Math.round(Number(principal) * PLATFORM_FEE_PCT))}) = total deduction {formatUGX(Number(principal) + Math.round(Number(principal) * PLATFORM_FEE_PCT))}
                            </p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Interest % (per cycle)</Label>
                            <Input
                              type="number"
                              value={interestRate}
                              onChange={(e) => setInterestRate(e.target.value)}
                              min={0}
                              className="h-9 text-sm"
                            />
                            <p className="text-[9px] text-muted-foreground mt-0.5">Any rate allowed</p>
                          </div>
                          <div>
                            <Label className="text-xs">Due date</Label>
                            <Input
                              type="date"
                              value={dueDate}
                              onChange={(e) => setDueDate(e.target.value)}
                              className="h-9 text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Loan purpose</Label>
                          <Textarea
                            value={purpose}
                            onChange={(e) => setPurpose(e.target.value)}
                            rows={2}
                            placeholder="e.g. school fees, business stock"
                            className="text-sm resize-none"
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowLoanForm(false)}>
                            Cancel
                          </Button>
                          <Button size="sm" className="flex-1" onClick={handleDisburse} disabled={submitting}>
                            {submitting && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                            Confirm & Record
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* My published offers */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Megaphone className="h-3.5 w-3.5" /> My Loan Offers
                </Label>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setShowOfferForm((v) => !v)}>
                  <Plus className="h-3 w-3 mr-1" /> New Offer
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Published offers are visible to <span className="font-semibold">any user</span>, who can then request a loan from you.
              </p>

              {showOfferForm && (
                <Card className="border-primary/30">
                  <CardContent className="p-3 space-y-2">
                    <div>
                      <Label className="text-xs">Title *</Label>
                      <Input value={offerForm.title} onChange={(e) => setOfferForm({ ...offerForm, title: e.target.value })} className="h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Description</Label>
                      <Textarea value={offerForm.description} onChange={(e) => setOfferForm({ ...offerForm, description: e.target.value })} rows={2} className="text-sm resize-none" placeholder="Who is this for, terms, etc." />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Min amount (UGX)</Label>
                        <Input type="number" value={offerForm.min_amount} onChange={(e) => setOfferForm({ ...offerForm, min_amount: e.target.value })} className="h-9 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Max amount (UGX)</Label>
                        <Input type="number" value={offerForm.max_amount} onChange={(e) => setOfferForm({ ...offerForm, max_amount: e.target.value })} className="h-9 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Interest %</Label>
                        <Input type="number" value={offerForm.interest_rate} onChange={(e) => setOfferForm({ ...offerForm, interest_rate: e.target.value })} min={0} className="h-9 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Min days</Label>
                        <Input type="number" value={offerForm.min_duration} onChange={(e) => setOfferForm({ ...offerForm, min_duration: e.target.value })} min={1} className="h-9 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Max days</Label>
                        <Input type="number" value={offerForm.max_duration} onChange={(e) => setOfferForm({ ...offerForm, max_duration: e.target.value })} min={1} className="h-9 text-sm" />
                      </div>
                    </div>
                    <Button size="sm" className="w-full" onClick={handleCreateOffer} disabled={savingOffer}>
                      {savingOffer && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                      Publish Offer
                    </Button>
                  </CardContent>
                </Card>
              )}

              {offers.length === 0 && !showOfferForm ? (
                <Card className="border-dashed">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">No offers yet. Publish one so users can request loans from you.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {offers.map((offer) => (
                    <Card key={offer.id} className="border-border/60">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-bold truncate">{offer.title}</p>
                          <div className="flex items-center gap-2">
                            <Switch checked={offer.active} onCheckedChange={(c) => toggleOffer(offer.id, c)} />
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteOffer(offer.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {formatUGX(offer.min_amount_ugx)} – {formatUGX(offer.max_amount_ugx)} · {offer.interest_rate_pct}% · {offer.min_duration_days}-{offer.max_duration_days} days
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Incoming loan requests */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Inbox className="h-3.5 w-3.5" /> Loan Requests
                </Label>
                <Badge variant="outline" className="text-[10px]">
                  {requests.filter((r) => r.status === 'pending').length} pending
                </Badge>
              </div>
              {requests.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">No loan requests yet.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {requests.map((req) => {
                    const statusColor =
                      req.status === 'approved' ? 'bg-emerald-500/15 text-emerald-700' :
                      req.status === 'declined' ? 'bg-destructive/15 text-destructive' :
                      'bg-amber-500/15 text-amber-700';
                    return (
                      <Card key={req.id} className="border-border/60">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-bold truncate">{req.borrower_display_name ?? req.borrower_ai_id ?? 'User'}</p>
                            <Badge className={`${statusColor} border-0 text-[9px] font-bold capitalize`}>{req.status}</Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {formatUGX(req.requested_amount_ugx)}{req.requested_duration_days ? ` · ${req.requested_duration_days} days` : ''}{req.interest_rate_pct != null ? ` · ${req.interest_rate_pct}%` : ''}
                          </p>
                          {req.purpose && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{req.purpose}</p>}
                          {req.status === 'pending' && (
                            <div className="flex gap-2 mt-2">
                              <Button size="sm" variant="outline" className="flex-1 h-8 text-[11px]" disabled={decidingId === req.id} onClick={() => handleDeclineRequest(req)}>
                                <X className="h-3 w-3 mr-1" /> Decline
                              </Button>
                              <Button size="sm" className="flex-1 h-8 text-[11px]" disabled={decidingId === req.id} onClick={() => handleApproveRequest(req)}>
                                {decidingId === req.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                                Approve & Disburse
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            {/* My loans list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  My Loans
                </Label>
                <Badge variant="outline" className="text-[10px]">{loans.length}</Badge>
              </div>
              {loansLoading ? (
                <Skeleton className="h-20 w-full rounded-xl" />
              ) : loans.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-6 text-center">
                    <TrendingUp className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">
                      No loans disbursed yet. Look up a borrower above to get started.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {loans.map((loan) => {
                    const statusColor =
                      loan.status === 'repaid' ? 'bg-emerald-500/15 text-emerald-700' :
                      loan.status === 'defaulted' ? 'bg-destructive/15 text-destructive' :
                      loan.status === 'partially_repaid' ? 'bg-amber-500/15 text-amber-700' :
                      'bg-primary/15 text-primary';
                    return (
                      <Card key={loan.id} className="border-border/60">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-sm font-bold truncate">
                              {loan.borrower_display_name ?? loan.borrower_ai_id}
                            </p>
                            <Badge className={`${statusColor} border-0 text-[9px] font-bold capitalize`}>
                              {loan.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">
                              {formatUGX(loan.principal_ugx)} @ {loan.interest_rate_pct ?? 0}%
                            </span>
                            <span className="text-muted-foreground">
                              Repaid {formatUGX(loan.amount_repaid_ugx)}
                            </span>
                          </div>
                          {loan.expected_repayment_date && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Due {new Date(loan.expected_repayment_date).toLocaleDateString()}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        <LendingAgentAgreementModal
          isOpen={showAgreement}
          onClose={() => setShowAgreement(false)}
          onAccept={handleAccept}
        />
      </SheetContent>
    </Sheet>
  );
}

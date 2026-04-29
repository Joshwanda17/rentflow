import { useState, useEffect, useRef } from 'react';
import { useCurrency } from '@/hooks/useCurrency';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, Phone, Calendar, Clock, Hash, AlertCircle, History, Building2, Banknote, Upload, Receipt, Copy, ShieldAlert, ClipboardPaste, Camera, X, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import OperationalFloatTenantAllocator, {
  encodeAllocationsNote,
  decodeAllocationsFromNote,
  type TenantAllocation,
} from './OperationalFloatTenantAllocator';
import DepositReferenceMatcher, { type MatchResult } from './DepositReferenceMatcher';
import AllocationEditDiffPanel from './AllocationEditDiffPanel';

/**
 * Extract a Mobile Money / bank reference from arbitrary SMS text.
 * Looks for the first matching token by priority:
 *   1. MTN MoMo "MP" + 8-14 digits
 *   2. Airtel "TID" + 6-15 digits
 *   3. Generic bank "FT" + 8-14 chars
 * Returns the uppercased token or null if nothing recognisable was found.
 */
function extractTidFromText(raw: string): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/\s+/g, ' ');
  const mtn = s.match(/\bMP\d{6,16}\b/);
  if (mtn) return mtn[0];
  const airtel = s.match(/\bTID\d{4,18}\b/);
  if (airtel) return airtel[0];
  const bank = s.match(/\bFT[A-Z0-9]{6,18}\b/);
  if (bank) return bank[0];
  return null;
}

type DepositChannel = 'momo' | 'bank' | 'agent_cash' | 'cash';
type DepositPurpose = 'operational_float' | 'personal_deposit' | 'partnership_deposit' | 'personal_rent_repayment' | 'other';

interface DepositFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletBalance?: number;
  /** Pre-select a deposit purpose (e.g. 'operational_float' for agents). */
  defaultPurpose?: DepositPurpose;
  /** Restrict the purpose grid to only these options. */
  allowedPurposes?: DepositPurpose[];
  /** Hide the purpose grid behind a "Change purpose" link. */
  lockPurpose?: boolean;
  /**
   * Force a mandatory purpose-choice screen BEFORE the channel/form.
   * When true: no defaultPurpose is applied, and the user must explicitly
   * pick a purpose (from allowedPurposes) before continuing. Eliminates
   * the "tap-through and mis-bucket" failure mode for agents.
   */
  requirePurposeChoice?: boolean;
  /**
   * Edit mode: when set, the dialog loads the given pending deposit
   * request, prefills every field (including the per-tenant allocation
   * breakdown decoded from `notes`), and the submit handler issues an
   * UPDATE instead of an INSERT. Only `status='pending'` rows are
   * editable — anything reviewed/approved/rejected falls back to a
   * read-only toast and closes.
   */
  editRequestId?: string | null;
  /**
   * Optional handoff from the dashboard "Collect from receipt/reference"
   * entry point. When supplied, the dialog opens straight on the
   * Operational Float form with the matched amount, per-tenant
   * allocations, reference, and channel pre-applied — no need for the
   * agent to re-paste the TID into the in-form matcher.
   */
  prefillFromMatch?: MatchResult | null;
}

const DEPOSIT_PURPOSES: { id: DepositPurpose; label: string; emoji: string; desc: string }[] = [
  { id: 'operational_float', emoji: '🏘️', label: 'Operational Float', desc: 'Cash collected from tenants in the field' },
  { id: 'personal_deposit', emoji: '💰', label: 'Personal Deposit', desc: 'Your own money top-up' },
  { id: 'partnership_deposit', emoji: '🤝', label: 'Supporter Wallet Top-Up', desc: 'Top up your supporter wallet. Funds stay in your wallet until you choose to fund tenants or build a portfolio.' },
  { id: 'personal_rent_repayment', emoji: '🏠', label: 'Personal Rent Repayment', desc: 'Paying your own rent' },
  { id: 'other', emoji: '📝', label: 'Other', desc: 'Specify your own reason' },
];

const MERCHANT_CODES = {
  mtn: '090777',
  airtel: '4380664',
};

const MERCHANT_NAME = 'WELILE TECHNOLOGIES LIMITTED';

const BANK_DETAILS = {
  bankName: 'Equity Bank Uganda',
  branch: 'Entebbe Branch',
  accountName: 'WELILE TECHNOLOGIES LIMITED',
  accountNumber: '1046203375259',
  currency: 'UGX',
  swiftCode: 'EQBLUGKA',
};

const QUICK_AMOUNTS = [50000, 100000, 250000, 500000];

/** Deposit limits in UGX (raw, never formatted). Mirrored in the UI hint
 *  under the amount input so users see exactly what's enforced. */
const MIN_DEPOSIT = 500;
const MAX_DEPOSIT = 1_000_000_000;

export default function DepositFlow({ open, onOpenChange, defaultPurpose, allowedPurposes, lockPurpose, requirePurposeChoice, editRequestId, prefillFromMatch }: DepositFlowProps) {
  const navigate = useNavigate();
  /**
   * Universal purpose-capture rule: if a caller didn't pre-select a purpose
   * AND didn't explicitly request the gate, we still force the gate. This
   * guarantees EVERY dashboard (tenant, agent, supporter, landlord, …)
   * captures an explicit deposit purpose — never an empty / inferred one.
   * Callers that pin a purpose via `defaultPurpose` (e.g. supporter top-up)
   * keep their existing skip-the-gate behaviour.
   */
  const mustChoosePurpose = requirePurposeChoice || !defaultPurpose;
  const [step, setStep] = useState<'purpose' | 'channel' | 'form' | 'submitting' | 'success'>(
    mustChoosePurpose ? 'purpose' : 'channel'
  );
  const [channel, setChannel] = useState<DepositChannel>('momo');
  const [momoProvider, setMomoProvider] = useState<'mtn' | 'airtel'>('mtn');
  const [amount, setAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [agentName, setAgentName] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [transactionTime, setTransactionTime] = useState('');
  const [reason, setReason] = useState('');
  const [depositPurpose, setDepositPurpose] = useState<DepositPurpose | ''>(
    mustChoosePurpose ? '' : (defaultPurpose ?? '')
  );
  const [showPurposeGrid, setShowPurposeGrid] = useState<boolean>(!lockPurpose);
  const [bankSlipFile, setBankSlipFile] = useState<File | null>(null);
  // Object URL for the local slip preview thumbnail. Revoked on cleanup
  // so we don't leak blob memory across multiple re-uploads.
  const [bankSlipPreview, setBankSlipPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tidError, setTidError] = useState('');
  /**
   * Per-tenant breakdown for an Operational Float deposit. The agent
   * collected one bulk amount in the field, dropped it at the merchant
   * code under one TID, and now needs to tell us *which tenants* it came
   * from. Empty for non-op-float deposits.
   */
  const [tenantAllocations, setTenantAllocations] = useState<TenantAllocation[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  /**
   * Edit-mode snapshot of the per-tenant breakdown as it was when the
   * dialog opened. Used purely for the in-form "Original vs Updated"
   * diff panel so the agent can eyeball every change before saving.
   * Reset to [] for fresh deposits and on close.
   */
  const [originalAllocations, setOriginalAllocations] = useState<TenantAllocation[]>([]);
  const [originalAmount, setOriginalAmount] = useState<number | null>(null);
  // Audit: capture the exact moment the user picked the purpose + which UI surface asked them.
  const [purposeChosenAt, setPurposeChosenAt] = useState<string | null>(null);
  const [purposeEntryPoint, setPurposeEntryPoint] = useState<'gate' | 'default' | 'in_form'>(
    mustChoosePurpose ? 'gate' : (defaultPurpose ? 'default' : 'in_form')
  );
  /**
   * Edit-mode bookkeeping. `editLoading` flips on while we hydrate the
   * existing row from `deposit_requests`; the dialog shows a small
   * "Loading…" state to avoid flashing an empty form. We snapshot the
   * original allocations payload so handleSubmit can re-encode notes the
   * same way it was created (and so we can detect "nothing changed").
   */
  // Either the parent supplied an edit target (UserDepositRequests "Edit
  // allocations" button) OR the in-form Reference Matcher discovered a
  // pending deposit and asked us to flip into edit mode for that row.
  const [matchedEditId, setMatchedEditId] = useState<string | null>(null);
  const activeEditId = editRequestId ?? matchedEditId;
  const isEditMode = !!activeEditId;
  const [editLoading, setEditLoading] = useState(false);

  /**
   * Edit-mode fallback bookkeeping.
   *
   * When the Reference Matcher tells us "I found a pending deposit, flip
   * into edit mode for it", we stash two things:
   *
   *   • `pendingMatchFallbackRef` — the ref / amount / provider hint that
   *     should be applied IF the hydrator can't actually open the row
   *     (deleted, already approved, network blip, RLS).
   *   • `preEditSnapshotRef` — the agent's in-progress allocations,
   *     amount and TID, captured at the instant we requested the flip.
   *     If the flip fails we restore this so the agent doesn't lose
   *     their work — we just pre-fill the reference and amount on top
   *     of what they already had.
   */
  const pendingMatchFallbackRef = useRef<{
    reference: string;
    amount: number;
    providerHint?: 'mtn' | 'airtel' | 'bank';
  } | null>(null);
  const preEditSnapshotRef = useRef<{
    allocations: typeof tenantAllocations;
    amount: string;
    transactionId: string;
    receiptNumber: string;
  } | null>(null);

  /**
   * Restore the agent's in-progress state and pre-fill ref + amount from
   * the stashed match. Used when edit-mode hydration fails for any
   * reason. Idempotent — safe to call once per failed flip.
   */
  const applyMatchFallback = (failureReason: string) => {
    const fallback = pendingMatchFallbackRef.current;
    const snapshot = preEditSnapshotRef.current;
    pendingMatchFallbackRef.current = null;
    preEditSnapshotRef.current = null;
    if (!fallback) return false;

    // Drop edit mode so the form treats this as a fresh deposit again.
    setMatchedEditId(null);

    // Restore the agent's previous allocations + entered amount/ref.
    if (snapshot) {
      setTenantAllocations(snapshot.allocations);
      if (snapshot.amount) setAmount(snapshot.amount);
      if (snapshot.transactionId) setTransactionId(snapshot.transactionId);
      if (snapshot.receiptNumber) setReceiptNumber(snapshot.receiptNumber);
    }

    // Pre-fill amount only if the agent hadn't typed one — never clobber
    // a number they already entered.
    const hadAmount = !!(snapshot?.amount && parseFloat(snapshot.amount) > 0);
    if (!hadAmount && fallback.amount > 0) {
      setAmount(String(fallback.amount));
    }

    // Pre-fill the reference into the right field for the active channel.
    if (fallback.providerHint === 'mtn' || fallback.providerHint === 'airtel') {
      setChannel('momo');
      setMomoProvider(fallback.providerHint);
      setTransactionId(fallback.reference);
    } else if (fallback.providerHint === 'bank') {
      setChannel('bank');
      setTransactionId(fallback.reference);
    } else {
      // Unknown provider — leave channel as-is and put the ref in the
      // currently-active field so the agent sees it.
      setTransactionId(fallback.reference);
    }

    toast.message('Kept your current allocations', {
      description: `${failureReason} — pre-filled the reference (${fallback.reference})${fallback.amount > 0 && !hadAmount ? ` and amount (${fallback.amount.toLocaleString()})` : ''} so you can continue.`,
      duration: 6000,
    });
    return true;
  };

  /**
   * Generate / clean up a preview blob URL whenever the slip file changes.
   * PDFs don't render in <img>, so we just keep the filename badge for those.
   */
  useEffect(() => {
    if (!bankSlipFile || !bankSlipFile.type.startsWith('image/')) {
      setBankSlipPreview(null);
      return;
    }
    const url = URL.createObjectURL(bankSlipFile);
    setBankSlipPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [bankSlipFile]);

  // Resolve the current user once so the allocator can scope its tenant
  // search without each render hitting auth.getUser().
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setCurrentUserId(data?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Read the clipboard, extract the first valid TID from the pasted text,
   * and apply it to the input. Falls back gracefully on browsers that
   * deny clipboard-read (Safari without user gesture, etc).
   */
  const handlePasteTid = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast.error('Clipboard is empty');
        return;
      }
      const tid = extractTidFromText(text);
      if (!tid) {
        // Still let the user try the raw text — they may have copied
        // exactly the TID without surrounding SMS context.
        const trimmed = text.trim().split(/\s+/)[0].toUpperCase();
        setTransactionId(trimmed);
        if (channel === 'momo') validateTid(trimmed);
        toast.warning('No standard TID detected — pasted raw text instead');
        return;
      }
      setTransactionId(tid);
      if (channel === 'momo') validateTid(tid);
      toast.success(`Pasted ${tid}`);
    } catch {
      toast.error('Could not read clipboard. Paste manually instead.');
    }
  };

  /** Copy a single value to the clipboard with a confirmation toast. */
  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Copied ${label}`);
    } catch {
      toast.error('Failed to copy');
    }
  };

  // Re-apply default when dialog re-opens
  useEffect(() => {
    if (open && mustChoosePurpose) {
      // Force a fresh choice every time the dialog opens
      setStep('purpose');
      setDepositPurpose('');
      setReason('');
      setShowPurposeGrid(false);
      setPurposeChosenAt(null);
      setPurposeEntryPoint('gate');
      return;
    }
    if (open && defaultPurpose) {
      setDepositPurpose(defaultPurpose);
      const purposeLabel = DEPOSIT_PURPOSES.find(p => p.id === defaultPurpose)?.label;
      if (purposeLabel && defaultPurpose !== 'other') setReason(purposeLabel);
      setShowPurposeGrid(!lockPurpose);
      setPurposeChosenAt(new Date().toISOString());
      setPurposeEntryPoint('default');
    }
  }, [open, defaultPurpose, lockPurpose, mustChoosePurpose]);

  /**
   * Handoff hydration from the dashboard "Collect from receipt/reference"
   * entry. The dashboard already ran the matcher, so we land on the
   * Operational Float form with everything pre-applied — amount, per-tenant
   * allocations, channel/provider, and the pasted reference.
   *
   * Runs only on dialog open transitions to avoid clobbering edits the
   * agent makes after landing on the form.
   */
  useEffect(() => {
    if (!open || !prefillFromMatch || editRequestId) return;
    const m = prefillFromMatch;
    setDepositPurpose('operational_float');
    setReason('Operational Float');
    setShowPurposeGrid(false);
    setStep('form');
    setPurposeChosenAt(new Date().toISOString());
    setPurposeEntryPoint('default');
    if (m.amount > 0) setAmount(String(m.amount));
    if (m.allocations?.length) setTenantAllocations(m.allocations);
    if (m.providerHint === 'mtn' || m.providerHint === 'airtel') {
      setChannel('momo');
      setMomoProvider(m.providerHint);
      if (m.reference) setTransactionId(m.reference);
    } else if (m.providerHint === 'bank') {
      setChannel('bank');
      if (m.reference) setTransactionId(m.reference);
    } else if (m.reference) {
      // Unknown provider — still attach the ref to the TID field as a
      // safe default so the agent doesn't have to re-type it.
      setTransactionId(m.reference);
    }
  }, [open, prefillFromMatch, editRequestId]);

  /**
   * Edit-mode hydration. When the dialog opens with an `editRequestId`,
   * load the existing pending row, decode the allocations tail off the
   * notes column, and prefill every field so the agent can adjust amounts
   * without re-typing the TID, date, channel, etc.
   *
   * Read-only safeguard: if the row is no longer pending (Financial Ops
   * already touched it) we surface a toast and close — editing an
   * approved/reviewed deposit would silently desync the ledger.
   */
  useEffect(() => {
    if (!open || !activeEditId) return;
    let cancelled = false;
    (async () => {
      setEditLoading(true);
      try {
        const { data, error } = await supabase
          .from('deposit_requests')
          .select('*')
          .eq('id', activeEditId)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          // Row vanished between the matcher's lookup and our hydrate
          // (deleted, RLS change). Try the keep-allocations fallback
          // before closing so the agent doesn't lose their work.
          if (!applyMatchFallback("Couldn't reopen that deposit")) {
            toast.error('Deposit request not found');
            onOpenChange(false);
          }
          return;
        }
        // Allow editing 'pending' (in-queue tweak) and 'rejected'
        // (resubmit after FinOps bounce). Anything else (approved /
        // reviewed) is locked — touching it would desync the ledger.
        if (data.status !== 'pending' && data.status !== 'rejected') {
          if (!applyMatchFallback('That deposit is already under review')) {
            toast.error('This deposit is already under review and can no longer be edited');
            onOpenChange(false);
          }
          return;
        }
        if (cancelled) return;

        // Hydrate succeeded — discard the fallback bookkeeping.
        pendingMatchFallbackRef.current = null;
        preEditSnapshotRef.current = null;

        // Channel + provider — derive from stored `provider` enum
        const prov = String(data.provider || '');
        if (prov === 'mtn' || prov === 'airtel') {
          setChannel('momo');
          setMomoProvider(prov);
        } else if (prov === 'bank_transfer') {
          setChannel('bank');
        } else if (prov === 'cash_deposit') {
          setChannel('cash');
        } else if (prov === 'agent_cash') {
          setChannel('agent_cash');
        }

        setAmount(String(data.amount ?? ''));

        // Reference: bank/momo go in transactionId, cash/agent_cash in receiptNumber (RCT-prefixed)
        const ref = String(data.transaction_id || '');
        if (prov === 'cash_deposit' || prov === 'agent_cash') {
          setReceiptNumber(ref.replace(/^RCT/i, ''));
        } else {
          setTransactionId(ref);
        }

        // Date / time
        if (data.transaction_date) {
          const d = new Date(data.transaction_date);
          setTransactionDate(d.toISOString().split('T')[0]);
          setTransactionTime(d.toTimeString().slice(0, 5));
        }

        // Purpose
        const audit = (data.purpose_audit ?? null) as { chosen_purpose?: string } | null;
        const purpose = (data.deposit_purpose ?? audit?.chosen_purpose ?? '') as DepositPurpose | '';
        if (purpose) {
          setDepositPurpose(purpose);
          const label = DEPOSIT_PURPOSES.find((p) => p.id === purpose)?.label;
          if (label && purpose !== 'other') setReason(label);
          setShowPurposeGrid(false);
          setStep('form');
        }

        // Decode allocations tail off notes; restore reason text from the
        // human-readable head if present (strip leading "Purpose: …" tag).
        const { cleanNote, allocations: decoded } = decodeAllocationsFromNote(data.notes);
        if (decoded && decoded.length) {
          setTenantAllocations(decoded);
          // Snapshot — must be a deep copy so later edits don't mutate
          // the "original" reference and quietly hide the diff.
          setOriginalAllocations(decoded.map((a) => ({ ...a })));
        }
        setOriginalAmount(Number(data.amount ?? 0));
        if (cleanNote) {
          // notes look like "Purpose: X | <reason> | Agent: Y | Bank slip: Z"
          const parts = cleanNote.split('|').map((s) => s.trim()).filter(Boolean);
          const reasonPart = parts.find(
            (p) => !/^purpose:/i.test(p) && !/^agent:/i.test(p) && !/^bank slip:/i.test(p),
          );
          if (reasonPart && (purpose === 'other' || !purpose)) {
            setReason(reasonPart);
          }
          const agentPart = parts.find((p) => /^agent:/i.test(p));
          if (agentPart) setAgentName(agentPart.replace(/^agent:\s*/i, ''));
        }
      } catch (err: any) {
        console.error('[DepositFlow] edit hydrate failed', err);
        if (!applyMatchFallback("Couldn't load that deposit")) {
          toast.error('Could not load deposit for editing', { description: err?.message });
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeEditId]);

  const validateTid = (value: string, provider?: 'mtn' | 'airtel') => {
    const upper = value.trim().toUpperCase();
    const prov = provider ?? momoProvider;
    if (!upper) { setTidError(''); return; }
    if (prov === 'mtn' && !upper.startsWith('MP')) {
      setTidError("MTN TIDs must start with 'MP' (e.g. MP39665905645)");
    } else if (prov === 'airtel' && !upper.startsWith('TID')) {
      setTidError("Airtel TIDs must start with 'TID' (e.g. TID144205097399)");
    } else {
      setTidError('');
    }
  };

  const isTidValid = () => {
    if (channel !== 'momo') return true;
    const upper = transactionId.trim().toUpperCase();
    if (!upper) return false;
    if (momoProvider === 'mtn') return upper.startsWith('MP');
    if (momoProvider === 'airtel') return upper.startsWith('TID');
    return true;
  };

  const { formatAmount: formatCurrency } = useCurrency();

  const getProviderLabel = () => {
    if (channel === 'momo') return momoProvider === 'mtn' ? 'MTN MoMo' : 'Airtel Money';
    if (channel === 'bank') return 'Bank Transfer';
    if (channel === 'cash') return 'Cash Deposit';
    return 'Agent Cash';
  };

  const getReferenceId = () => {
    if (channel === 'agent_cash' || channel === 'cash') return receiptNumber.trim() ? `RCT${receiptNumber.trim().toUpperCase()}` : '';
    return transactionId.trim().toUpperCase();
  };

  const validateForm = () => {
    const amt = parseFloat(amount);
    if (!amount || !Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a valid amount');
      return false;
    }
    if (amt < MIN_DEPOSIT) {
      toast.error(`Minimum deposit is ${formatCurrency(MIN_DEPOSIT)}`);
      return false;
    }
    if (amt > MAX_DEPOSIT) {
      toast.error(`Maximum deposit is ${formatCurrency(MAX_DEPOSIT)}`);
      return false;
    }
    if (channel === 'momo' && !transactionId.trim()) { toast.error('Enter the transaction ID'); return false; }
    if (channel === 'bank' && !transactionId.trim()) { toast.error('Enter the bank reference number'); return false; }
    if (channel === 'agent_cash' && !receiptNumber.trim()) { toast.error('Enter the receipt number'); return false; }
    if (channel === 'agent_cash' && !agentName.trim()) { toast.error('Enter the agent name'); return false; }
    if (channel === 'cash' && !receiptNumber.trim()) { toast.error('Enter the receipt number'); return false; }

    // TID format validation
    if (channel === 'momo') {
      const rawTid = transactionId.trim().toUpperCase();
      if (momoProvider === 'mtn' && !rawTid.startsWith('MP')) {
        toast.error("MTN TIDs must start with 'MP' (e.g. MP39665905645)");
        return false;
      }
      if (momoProvider === 'airtel' && !rawTid.startsWith('TID')) {
        toast.error("Airtel TIDs must start with 'TID' (e.g. TID144205097399)");
        return false;
      }
    }
    if (!transactionDate) { toast.error('Select the transaction date'); return false; }
    if (!transactionTime) { toast.error('Enter the transaction time'); return false; }
    if (!depositPurpose) { toast.error('Select the deposit purpose'); return false; }
    if (depositPurpose === 'other' && !reason.trim()) { toast.error('Enter the reason for this deposit'); return false; }

    // Operational Float deposits MUST carry a tenant breakdown so Financial
    // Ops can reconcile the bulk drop. Skip when no allocations were made
    // (legacy / no tenants linked yet) — the agent can still submit, but if
    // they DID start a breakdown it has to balance.
    if (depositPurpose === 'operational_float' && tenantAllocations.length > 0) {
      const sum = tenantAllocations.reduce((s, a) => s + (a.amount || 0), 0);
      const total = parseFloat(amount);
      if (tenantAllocations.some((a) => !a.amount || a.amount <= 0)) {
        toast.error('Each tenant in the breakdown needs an amount greater than 0');
        return false;
      }
      if (Math.abs(sum - total) > 1) {
        toast.error(
          `Tenant breakdown (UGX ${sum.toLocaleString()}) must equal deposit total (UGX ${total.toLocaleString()})`,
        );
        return false;
      }
    }

    const txDate = new Date(`${transactionDate}T${transactionTime}`);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (txDate > now) { toast.error('Transaction date cannot be in the future'); return false; }
    if (txDate < sevenDaysAgo) { toast.error('Transaction must be within the last 7 days'); return false; }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);
    setStep('submitting');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Please log in'); setStep('form'); return; }

      const txDateTime = new Date(`${transactionDate}T${transactionTime}`);
      const normalizedRef = getReferenceId();

      // Upload bank slip if provided
      let bankSlipUrl: string | null = null;
      if (channel === 'bank' && bankSlipFile) {
        const ext = bankSlipFile.name.split('.').pop();
        const path = `bank-slips/${user.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('deposit-proofs')
          .upload(path, bankSlipFile, { upsert: true });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('deposit-proofs').getPublicUrl(path);
          bankSlipUrl = urlData?.publicUrl || null;
        }
      }

      const providerValue = channel === 'momo' ? momoProvider : channel === 'bank' ? 'bank_transfer' : channel === 'cash' ? 'cash_deposit' : 'agent_cash';
      const purposeLabel = DEPOSIT_PURPOSES.find(p => p.id === depositPurpose)?.label || depositPurpose;
      const baseNotes = [
        `Purpose: ${purposeLabel}`,
        reason.trim() ? reason.trim() : '',
        channel === 'agent_cash' ? `Agent: ${agentName.trim()}` : '',
        bankSlipUrl ? `Bank slip: ${bankSlipUrl}` : '',
      ].filter(Boolean).join(' | ');

      // For Operational Float drops, append the per-tenant breakdown to
      // notes as a structured tail. Financial Ops parses this and shows a
      // tenant-by-tenant table at approval time.
      const notes =
        depositPurpose === 'operational_float' && tenantAllocations.length > 0
          ? encodeAllocationsNote(baseNotes, tenantAllocations)
          : baseNotes;

      if (isEditMode && activeEditId) {
        // UPDATE — restricted by RLS to the owner's own pending row.
        // Status is intentionally NOT touched; the row stays 'pending' so
        // Financial Ops still owns the next move. We do, however, stamp
        // an `edited_at`-style breadcrumb into purpose_audit so reviewers
        // can see the row was reopened by the agent.
        const { error: updError } = await supabase
          .from('deposit_requests')
          .update({
            amount: parseFloat(amount),
            provider: providerValue,
            transaction_id: normalizedRef,
            transaction_date: txDateTime.toISOString(),
            notes,
            deposit_purpose: depositPurpose,
            purpose_audit: {
              chosen_purpose: depositPurpose,
              chosen_at: purposeChosenAt ?? new Date().toISOString(),
              chosen_by: user.id,
              entry_point: purposeEntryPoint,
              required_choice: !!requirePurposeChoice,
              last_edited_at: new Date().toISOString(),
            },
          } as any)
          .eq('id', activeEditId)
          .eq('status', 'pending'); // hard guard: never overwrite a reviewed row
        if (updError) throw updError;
        toast.success('Deposit updated — Financial Ops will see your changes');
      } else {
        const { error: depositError } = await supabase
          .from('deposit_requests')
          .insert({
            user_id: user.id,
            amount: parseFloat(amount),
            status: 'pending',
            provider: providerValue,
            transaction_id: normalizedRef,
            transaction_date: txDateTime.toISOString(),
            notes,
            deposit_purpose: depositPurpose,
            purpose_audit: {
              chosen_purpose: depositPurpose,
              chosen_at: purposeChosenAt ?? new Date().toISOString(),
              chosen_by: user.id,
              entry_point: purposeEntryPoint,
              required_choice: !!requirePurposeChoice,
            },
          } as any);

        if (depositError) throw depositError;

        toast.success('Deposit submitted for verification');
      }
      setStep('success');
    } catch (error: any) {
      console.error('Deposit error:', error);
      toast.error('Failed to submit deposit', {
        description: error?.message || 'Please try again or contact support.',
      });
      setStep('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep(mustChoosePurpose ? 'purpose' : 'channel');
    setChannel('momo');
    setMomoProvider('mtn');
    setAmount('');
    setTransactionId('');
    setReceiptNumber('');
    setAgentName('');
    setTransactionDate('');
    setTransactionTime('');
    setReason('');
    setDepositPurpose(mustChoosePurpose ? '' : (defaultPurpose ?? ''));
    setShowPurposeGrid(!lockPurpose);
    setBankSlipFile(null);
    setTenantAllocations([]);
    setOriginalAllocations([]);
    setOriginalAmount(null);
    setMatchedEditId(null);
    onOpenChange(false);
  };

  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {/*
        Mobile-first dialog shell.
        On phones: full screen (no rounded corners, no margins) so everything
        the user reads/taps is at thumb-friendly distance and the keyboard
        doesn't squash the form. On tablet/desktop: classic centered card.
        The body becomes a scroll region between a sticky header (title +
        step + back) and a sticky footer (the primary action) — never
        chase a button hidden below the fold.
      */}
      <DialogContent className="p-0 gap-0 sm:max-w-md w-screen h-svh sm:h-auto sm:max-h-[90vh] sm:rounded-2xl rounded-none overflow-hidden flex flex-col">
        {/* Sticky header */}
        <DialogHeader className="px-4 py-3 border-b bg-background sticky top-0 z-10 space-y-0">
          <div className="flex items-center gap-3">
            {/* Step-aware back: only shown when there's somewhere to go back to. */}
            {step === 'form' && (
              <button
                type="button"
                onClick={() => setStep('channel')}
                aria-label="Back"
                className="-ml-1 h-9 w-9 rounded-full flex items-center justify-center hover:bg-muted active:scale-95 transition"
              >
                <span className="text-lg leading-none">‹</span>
              </button>
            )}
            {step === 'channel' && mustChoosePurpose && depositPurpose && (
              <button
                type="button"
                onClick={() => setStep('purpose')}
                aria-label="Back"
                className="-ml-1 h-9 w-9 rounded-full flex items-center justify-center hover:bg-muted active:scale-95 transition"
              >
                <span className="text-lg leading-none">‹</span>
              </button>
            )}
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold leading-tight">
                {isEditMode ? 'Edit deposit' : 'Deposit to wallet'}
              </DialogTitle>
              {/* Tiny step caption — plain language, no jargon. */}
              {!editLoading && step !== 'submitting' && step !== 'success' && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {step === 'purpose'
                    ? 'Step 1 of 3 · What is this for?'
                    : step === 'channel'
                      ? `Step ${mustChoosePurpose ? '2' : '1'} of ${mustChoosePurpose ? '3' : '2'} · How are you paying?`
                      : `Step ${mustChoosePurpose ? '3' : '2'} of ${mustChoosePurpose ? '3' : '2'} · Enter details`}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>
        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">

        {editLoading ? (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground text-sm">Loading deposit details…</p>
          </div>
        ) : step === 'success' ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-success/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold">
              {isEditMode ? 'Changes Saved!' : 'Request Submitted!'}
            </h3>
            <p className="text-muted-foreground text-sm">
              {isEditMode
                ? 'Financial Ops will see your updated allocations on their next review.'
                : 'Your deposit is being verified.'}
            </p>
            <div className="space-y-2">
              <Button onClick={handleClose} className="w-full">Done</Button>
              <Button variant="outline" className="w-full" onClick={() => { handleClose(); navigate('/deposit-history'); }}>
                <History className="h-4 w-4 mr-2" /> View History
              </Button>
            </div>
          </div>
        ) : step === 'submitting' ? (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">{isEditMode ? 'Saving changes…' : 'Submitting...'}</p>
          </div>
        ) : step === 'purpose' ? (
          /* ─── Mandatory Purpose Choice (agents) ─── */
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-lg border border-warning/30">
              <ShieldAlert className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-foreground">Choose what this deposit is for</p>
                <p className="text-xs text-muted-foreground">
                  Operational Float (company cash) and Personal Deposit (your own money) land in different wallet buckets and follow different rules. Pick carefully — you cannot change this after submission.
                </p>
              </div>
            </div>
            <div className="grid gap-2.5">
              {DEPOSIT_PURPOSES
                .filter((p) => !allowedPurposes || allowedPurposes.includes(p.id))
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setDepositPurpose(p.id);
                      if (p.id !== 'other') setReason(p.label);
                      else setReason('');
                      setShowPurposeGrid(false);
                      setPurposeChosenAt(new Date().toISOString());
                      setPurposeEntryPoint('gate');
                      setStep('channel');
                    }}
                    className="flex items-center gap-3 p-4 min-h-[76px] rounded-2xl border-2 border-border text-left transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.98] touch-manipulation"
                  >
                    <span className="text-3xl shrink-0">{p.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-base leading-tight">{p.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
                    </div>
                    <span aria-hidden className="text-muted-foreground text-lg">›</span>
                  </button>
                ))}
            </div>
          </div>
        ) : step === 'channel' ? (
          /* ─── Channel Selection ─── */
          <div className="space-y-3">
            {mustChoosePurpose && depositPurpose && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50 text-xs">
                <span className="text-base">{DEPOSIT_PURPOSES.find(p => p.id === depositPurpose)?.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{DEPOSIT_PURPOSES.find(p => p.id === depositPurpose)?.label}</p>
                  <p className="text-muted-foreground text-xs">Tap back at the top to change.</p>
                </div>
              </div>
            )}
            <div className="grid gap-2.5">
              {[
                { id: 'agent_cash' as DepositChannel, provider: null, icon: Banknote, label: 'Cash with agent', desc: 'Pay cash to a Welile agent', tone: 'border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500' },
                { id: 'momo' as DepositChannel, provider: 'mtn' as const, icon: Phone, label: 'MTN MoMo', desc: 'Pay via MTN Mobile Money', tone: 'border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5 hover:border-[hsl(var(--warning))]' },
                { id: 'momo' as DepositChannel, provider: 'airtel' as const, icon: Phone, label: 'Airtel Money', desc: 'Pay via Airtel Money', tone: 'border-destructive/40 bg-destructive/5 hover:border-destructive' },
                { id: 'bank' as DepositChannel, provider: null, icon: Building2, label: 'Bank transfer', desc: 'Equity Bank Uganda', tone: 'border-blue-500/40 bg-blue-500/5 hover:border-blue-500' },
              ].map((ch, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setChannel(ch.id);
                    if (ch.provider) setMomoProvider(ch.provider);
                    setStep('form');
                  }}
                  className={`flex items-center gap-3 p-4 min-h-[76px] rounded-2xl border-2 text-left transition-all active:scale-[0.98] touch-manipulation ${ch.tone}`}
                >
                  <div className="w-11 h-11 rounded-xl bg-background flex items-center justify-center shrink-0 shadow-sm">
                    <ch.icon className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-base leading-tight">{ch.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ch.desc}</p>
                  </div>
                  <span aria-hidden className="text-muted-foreground text-lg">›</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ─── Form ─── */
          <div className="space-y-4 w-full max-w-full pb-2">
            {/* Selected method chip — quieter than a back link, since the
                sticky header already handles back navigation. */}
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground font-medium">
                {getProviderLabel()}
              </span>
            </div>

            {/* ─── MoMo Instructions (Tab-Based) ─── */}
            {channel === 'momo' && (
              <div className="space-y-3">
                {/* Provider Tabs */}
                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setMomoProvider('mtn'); validateTid(transactionId, 'mtn'); }}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 transition-all font-semibold text-sm ${momoProvider === 'mtn' ? 'border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 shadow-sm' : 'border-border hover:border-[hsl(var(--warning))]/50'}`}
                  >
                    <div className="w-7 h-7 rounded-full bg-[hsl(var(--warning))] flex items-center justify-center text-[hsl(var(--warning-foreground))] font-bold text-[9px]">MTN</div>
                    MTN MoMo
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMomoProvider('airtel'); validateTid(transactionId, 'airtel'); }}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 transition-all font-semibold text-sm ${momoProvider === 'airtel' ? 'border-destructive bg-destructive/10 shadow-sm' : 'border-border hover:border-destructive/50'}`}
                  >
                    <div className="w-7 h-7 rounded-full bg-destructive flex items-center justify-center text-destructive-foreground font-bold text-[9px]">AIR</div>
                    Airtel Money
                  </button>
                </div>

                {/* Merchant ID — prominent with copy */}
                <div className="p-3 bg-muted/60 rounded-xl text-center space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Merchant ID</p>
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-2xl font-mono font-bold tracking-widest">{MERCHANT_CODES[momoProvider]}</p>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(MERCHANT_CODES[momoProvider]);
                          toast.success(`Copied ${MERCHANT_CODES[momoProvider]}`);
                        } catch { toast.error('Failed to copy'); }
                      }}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                  <p className="text-xs text-primary font-medium">{MERCHANT_NAME}</p>
                </div>

                {/* Timeline Steps */}
                <div className="pl-3">
                  {(momoProvider === 'mtn' ? [
                    'Dial *165*3#',
                    'Choose "Pay with MoMo"',
                    `Enter Merchant ID: ${MERCHANT_CODES.mtn}`,
                    'Enter amount & confirm with PIN',
                  ] : [
                    'Dial *185*9#',
                    'Select "Pay Merchant"',
                    `Enter Merchant ID: ${MERCHANT_CODES.airtel}`,
                    'Enter amount & confirm with PIN',
                  ]).map((s, i, arr) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className="flex flex-col items-center">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${momoProvider === 'mtn' ? 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]' : 'bg-destructive text-destructive-foreground'}`}>
                          {i + 1}
                        </div>
                        {i < arr.length - 1 && <div className="w-px h-4 bg-border" />}
                      </div>
                      <p className="text-xs text-muted-foreground pt-0.5 pb-2">{s}</p>
                    </div>
                  ))}
                </div>

                {/* Pay Now USSD Button */}
                {amount && parseFloat(amount) > 0 && (
                  <Button
                    type="button"
                    className={`w-full h-11 font-semibold ${momoProvider === 'mtn' ? 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] hover:bg-[hsl(var(--warning))]/90' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}`}
                    onClick={() => {
                      const dialString = momoProvider === 'mtn'
                        ? `tel:*165*3*${amount}%23`
                        : `tel:*185*9%23`;
                      window.location.href = dialString;
                      setTimeout(() => {
                        toast.info(`Merchant ID: ${MERCHANT_CODES[momoProvider]}`, {
                          duration: 10000,
                          action: {
                            label: 'Copy',
                            onClick: () => navigator.clipboard.writeText(MERCHANT_CODES[momoProvider]),
                          },
                        });
                      }, 500);
                    }}
                  >
                    <Phone className="h-4 w-4 mr-2" />
                    Pay Now via {momoProvider === 'mtn' ? 'MTN' : 'Airtel'}
                  </Button>
                )}
              </div>
            )}

            {/* ─── Bank Instructions ─── */}
            {channel === 'bank' && (
              <div className="p-4 bg-blue-500/5 rounded-xl border border-blue-500/20 space-y-2">
                <h4 className="font-semibold text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-600" /> Bank Details</h4>
                <div className="grid gap-1.5 text-xs">
                  {[
                    ['Bank', BANK_DETAILS.bankName],
                    ['Branch', BANK_DETAILS.branch],
                    ['Account Name', BANK_DETAILS.accountName],
                    ['Account No.', BANK_DETAILS.accountNumber],
                    ['Currency', BANK_DETAILS.currency],
                    ['SWIFT Code', BANK_DETAILS.swiftCode],
                  ].map(([label, value]) => (
                    <div key={label} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-2">
                      <span className="text-muted-foreground shrink-0">{label}</span>
                      <div className="flex items-center gap-1.5 min-w-0 sm:justify-end">
                        <span className="font-mono font-semibold sm:text-right break-all">{value}</span>
                        <button
                          type="button"
                          aria-label={`Copy ${label}`}
                          onClick={() => copyValue(String(value), label)}
                          className="p-1 rounded hover:bg-blue-500/10 text-muted-foreground hover:text-blue-600 transition-colors shrink-0"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── Agent Cash Instructions ─── */}
            {channel === 'agent_cash' && (
              <div className="p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/20">
                <h4 className="font-medium text-xs mb-1 flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5 text-emerald-600" /> Agent Cash Deposit
                </h4>
                <p className="text-xs text-muted-foreground">
                  Enter the receipt number from the physical receipt your agent gave you.
                </p>
              </div>
            )}

            {/* ─── Cash Deposit Instructions ─── */}
            {channel === 'cash' && (
              <div className="p-3 bg-violet-500/5 rounded-lg border border-violet-500/20">
                <h4 className="font-medium text-xs mb-1 flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5 text-violet-600" /> Cash Deposit
                </h4>
                <p className="text-xs text-muted-foreground">
                  Enter the receipt number you received when you deposited cash.
                </p>
              </div>
            )}

            {/* ─── Amount ─── */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">How much?</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm pointer-events-none">UGX</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={MIN_DEPOSIT}
                  max={MAX_DEPOSIT}
                  aria-invalid={
                    !!amount &&
                    Number.isFinite(parseFloat(amount)) &&
                    (parseFloat(amount) < MIN_DEPOSIT || parseFloat(amount) > MAX_DEPOSIT)
                  }
                  className="text-2xl font-bold tabular-nums h-14 pl-14 pr-3"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Between {formatCurrency(MIN_DEPOSIT)} and {formatCurrency(MAX_DEPOSIT)}
              </p>
              {!!amount && Number.isFinite(parseFloat(amount)) && parseFloat(amount) > 0 && parseFloat(amount) < MIN_DEPOSIT && (
                <p className="text-xs text-destructive font-medium">
                  Minimum is {formatCurrency(MIN_DEPOSIT)}
                </p>
              )}
              {!!amount && Number.isFinite(parseFloat(amount)) && parseFloat(amount) > MAX_DEPOSIT && (
                <p className="text-xs text-destructive font-medium">
                  Maximum is {formatCurrency(MAX_DEPOSIT)}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {QUICK_AMOUNTS.map((amt) => (
                  <Button
                    key={amt}
                    type="button"
                    variant={amount === String(amt) ? 'default' : 'outline'}
                    className="text-sm h-11 font-medium"
                    onClick={() => setAmount(String(amt))}
                  >
                    {formatCurrency(amt)}
                  </Button>
                ))}
              </div>
            </div>

            {/* ─── Reference / TID / Receipt ─── */}
            {channel !== 'agent_cash' && channel !== 'cash' ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5" />
                    {channel === 'bank' ? 'Bank Reference Number' : 'Transaction ID'} <span className="text-destructive">*</span>
                  </Label>
                  <button
                    type="button"
                    onClick={handlePasteTid}
                    className="text-xs font-semibold text-primary inline-flex items-center gap-1 hover:underline underline-offset-2"
                  >
                    <ClipboardPaste className="h-3 w-3" />
                    Paste from SMS
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="text"
                    placeholder={
                      channel === 'bank'
                        ? 'e.g. FT24123456789'
                        : momoProvider === 'mtn'
                          ? 'e.g. MP39665905645'
                          : 'e.g. TID144205097399'
                    }
                    value={transactionId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTransactionId(val);
                      if (channel === 'momo') validateTid(val);
                    }}
                    className={`font-mono text-sm pr-9 ${channel === 'momo' && tidError ? 'border-destructive focus:ring-destructive' : channel === 'momo' && transactionId.trim() && !tidError ? 'border-emerald-500 focus:ring-emerald-500' : ''}`}
                  />
                  {transactionId.trim() && (
                    <button
                      type="button"
                      aria-label="Copy transaction ID"
                      onClick={() => copyValue(transactionId.trim().toUpperCase(), 'TID')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {channel === 'momo' && tidError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {tidError}
                  </p>
                )}
                {channel === 'momo' && transactionId.trim() && !tidError && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Valid TID format
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {channel === 'bank'
                    ? 'Find this on your bank receipt or transfer confirmation'
                    : 'Enter the exact TID from your payment confirmation SMS — or tap "Paste from SMS" above'}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5" /> Receipt Number *
                  </Label>
                  <div className="flex items-center rounded-lg border border-border overflow-hidden">
                    <span className="px-2.5 py-2 bg-muted text-muted-foreground font-mono text-xs font-semibold border-r border-border select-none">
                      RCT
                    </span>
                    <Input
                      type="text"
                      placeholder="e.g. WEL-00001 or leave blank for auto"
                      value={receiptNumber}
                      onChange={(e) => setReceiptNumber(e.target.value)}
                      className="font-mono border-0 focus:ring-0 rounded-l-none text-sm"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {channel === 'agent_cash' ? 'From the physical receipt the agent gave you' : 'From your cash deposit receipt'}
                  </p>
                </div>
                {channel === 'agent_cash' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Agent Name *</Label>
                    <Input placeholder="Name of the agent who received cash" value={agentName} onChange={(e) => setAgentName(e.target.value)} className="h-10 text-sm" />
                  </div>
                )}
              </>
            )}

            {/* ─── Bank slip upload (optional) ─── */}
            {channel === 'bank' && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5" /> Bank Deposit Slip (optional)
                </Label>

                {!bankSlipFile ? (
                  // Two side-by-side actions: open the camera (mobile) or
                  // pick from gallery / files. Camera capture is a no-op on
                  // desktop and falls back to the file picker.
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col items-center justify-center gap-1 h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/60 hover:bg-primary/5 cursor-pointer transition-colors">
                      <Camera className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Take photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => setBankSlipFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <label className="flex flex-col items-center justify-center gap-1 h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/60 hover:bg-primary/5 cursor-pointer transition-colors">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Pick from gallery</span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => setBankSlipFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-2 rounded-lg border border-border bg-muted/30">
                    {bankSlipPreview ? (
                      <img
                        src={bankSlipPreview}
                        alt="Bank slip preview"
                        className="h-16 w-16 rounded object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded bg-background border border-border flex items-center justify-center shrink-0">
                        <Upload className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{bankSlipFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(bankSlipFile.size / 1024).toFixed(0)} KB · {bankSlipFile.type || 'file'}
                      </p>
                      <p className="text-xs text-emerald-600 mt-0.5">Ready to attach</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Remove slip"
                      onClick={() => setBankSlipFile(null)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Helps Financial Ops verify your deposit faster. Image or PDF, up to ~5 MB.
                </p>
              </div>
            )}

            {/* ─── Date & Time ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Date</Label>
                <Input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} min={sevenDaysAgo} max={today} className="h-10 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Time</Label>
                <Input type="time" value={transactionTime} onChange={(e) => setTransactionTime(e.target.value)} className="h-10 text-xs" />
              </div>
            </div>

            {/* ─── Deposit Purpose ─── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="text-xs flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> Deposit Purpose *</Label>
                {lockPurpose && depositPurpose && (
                  <button
                    type="button"
                    onClick={() => setShowPurposeGrid((s) => !s)}
                    className="text-xs text-primary font-medium underline-offset-2 hover:underline"
                  >
                    {showPurposeGrid ? 'Hide options' : 'Change purpose'}
                  </button>
                )}
              </div>
              {lockPurpose && depositPurpose && !showPurposeGrid && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl border-2 border-primary bg-primary/10">
                  <span className="text-base shrink-0">{DEPOSIT_PURPOSES.find(p => p.id === depositPurpose)?.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-xs">{DEPOSIT_PURPOSES.find(p => p.id === depositPurpose)?.label}</p>
                    <p className="text-xs text-muted-foreground break-words">
                      {DEPOSIT_PURPOSES.find(p => p.id === depositPurpose)?.desc}
                    </p>
                  </div>
                </div>
              )}
              {(showPurposeGrid || !lockPurpose) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DEPOSIT_PURPOSES.filter(p => !allowedPurposes || allowedPurposes.includes(p.id)).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setDepositPurpose(p.id);
                      if (p.id !== 'other') setReason(p.label);
                      else setReason('');
                      if (lockPurpose) setShowPurposeGrid(false);
                      setPurposeChosenAt(new Date().toISOString());
                      setPurposeEntryPoint((prev) => (prev === 'gate' ? 'gate' : 'in_form'));
                    }}
                    className={`flex items-start gap-2 p-2.5 rounded-xl border-2 text-left transition-all text-xs ${
                      depositPurpose === p.id
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <span className="text-base shrink-0">{p.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold break-words">{p.label}</p>
                      <p className="text-xs text-muted-foreground break-words line-clamp-2">{p.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              )}
              {depositPurpose === 'operational_float' && (
                <div className="flex items-start gap-2 p-2 bg-primary/5 rounded-lg border border-primary/20">
                  <AlertCircle className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    This deposit will be credited as <span className="font-semibold text-primary">Company Operations Float</span> — restricted to landlord disbursements only. Not withdrawable as personal funds.
                  </p>
                </div>
              )}
              {depositPurpose === 'operational_float' && currentUserId && (
                <>
                  {!isEditMode && (
                    <DepositReferenceMatcher
                      agentId={currentUserId}
                      currentAmount={parseFloat(amount) || 0}
                      highlight={
                        // Lump-sum path: agent typed an amount but
                        // hasn't started tagging tenants yet. Make the
                        // auto-build CTA the obvious next step.
                        (parseFloat(amount) || 0) > 0 &&
                        tenantAllocations.length === 0
                      }
                      onApplyMatch={(m: MatchResult) => {
                        // Path A: matched a pending deposit row → flip
                        // the dialog into edit mode for that row. The
                        // hydrator effect will repopulate every field.
                        if (m.editDepositId) {
                          // Snapshot the agent's in-progress work + stash
                          // the match so we can restore + pre-fill if the
                          // hydrator fails (row gone, already approved,
                          // network blip, etc.).
                          preEditSnapshotRef.current = {
                            allocations: tenantAllocations.map(a => ({ ...a })),
                            amount,
                            transactionId,
                            receiptNumber,
                          };
                          pendingMatchFallbackRef.current = {
                            reference: m.reference,
                            amount: m.amount,
                            providerHint: m.providerHint,
                          };
                          if (m.reference) setTransactionId(m.reference);
                          if (m.providerHint === 'mtn' || m.providerHint === 'airtel') {
                            setChannel('momo');
                            setMomoProvider(m.providerHint);
                          } else if (m.providerHint === 'bank') {
                            setChannel('bank');
                          }
                          setMatchedEditId(m.editDepositId);
                          return;
                        }
                        // Path B: matched a bundle of unattached
                        // collections → prefill the form with the sum,
                        // the allocations, and the pasted reference.
                        if (m.amount > 0) setAmount(String(m.amount));
                        if (m.allocations.length) setTenantAllocations(m.allocations);
                        if (m.reference) {
                          if (channel === 'momo') {
                            setTransactionId(m.reference);
                            validateTid(m.reference);
                          } else if (channel === 'bank') {
                            setTransactionId(m.reference);
                          } else {
                            setReceiptNumber(m.reference.replace(/^RCT/i, ''));
                          }
                        }
                        if (m.providerHint === 'mtn' || m.providerHint === 'airtel') {
                          setChannel('momo');
                          setMomoProvider(m.providerHint);
                          validateTid(m.reference, m.providerHint);
                        } else if (m.providerHint === 'bank') {
                          setChannel('bank');
                        }
                      }}
                    />
                  )}
                  <OperationalFloatTenantAllocator
                    agentId={currentUserId}
                    totalAmount={parseFloat(amount) || 0}
                    allocations={tenantAllocations}
                    onChange={setTenantAllocations}
                  />
                  {/*
                    Edit-mode diff panel — surfaces the original
                    per-tenant amounts (as captured when the dialog
                    opened) next to the in-progress edits, so the agent
                    can eyeball every change before saving. Hidden for
                    fresh deposits and when nothing has actually moved.
                  */}
                  {isEditMode && (
                    <AllocationEditDiffPanel
                      original={originalAllocations}
                      updated={tenantAllocations}
                      originalAmount={originalAmount}
                      updatedAmount={parseFloat(amount) || 0}
                    />
                  )}
                  {(() => {
                    const total = parseFloat(amount) || 0;
                    const sum = tenantAllocations.reduce((s, a) => s + (a.amount || 0), 0);
                    const diff = total - sum;
                    if (tenantAllocations.length === 0 || total <= 0) return null;
                    if (Math.abs(diff) <= 1) {
                      return (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-success/30 bg-success/10">
                          <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                          <p className="text-xs text-success-foreground">
                            Breakdown balanced — UGX {sum.toLocaleString()} across {tenantAllocations.length} tenant{tenantAllocations.length === 1 ? '' : 's'}.
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-start gap-2 p-2.5 rounded-lg border border-destructive/30 bg-destructive/10">
                        <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                        <div className="text-xs text-destructive space-y-0.5">
                          <p className="font-semibold">
                            Breakdown does not match deposit total — submission blocked.
                          </p>
                          <p>
                            Allocated <span className="font-semibold">UGX {sum.toLocaleString()}</span> of{' '}
                            <span className="font-semibold">UGX {total.toLocaleString()}</span>.{' '}
                            {diff > 0
                              ? <>You still need to allocate <span className="font-semibold">UGX {diff.toLocaleString()}</span>.</>
                              : <>You are over by <span className="font-semibold">UGX {Math.abs(diff).toLocaleString()}</span> — reduce a tenant's amount.</>}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
              {depositPurpose === 'other' && (
                <Input placeholder="Specify your reason..." value={reason} onChange={(e) => setReason(e.target.value)} className="h-10 text-sm" />
              )}
            </div>

            {/* ─── Warning ─── */}
            <div className="flex items-start gap-2 p-2.5 bg-warning/10 rounded-lg border border-warning/20">
              <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">Ensure all details match your {channel === 'momo' ? 'SMS' : channel === 'bank' ? 'bank receipt' : 'physical receipt'}. Incorrect info delays verification.</p>
            </div>

          </div>
        )}
        {/* /scroll body */}
        </div>
        {/* Sticky footer — primary action lives here only on the form
            step. Other steps are big tap-target grids (Choose purpose /
            Choose method) which act as their own CTAs. */}
        {step === 'form' && !editLoading && (() => {
          const total = parseFloat(amount) || 0;
          const sum = tenantAllocations.reduce((s, a) => s + (a.amount || 0), 0);
          const opsAllocBlocked =
            depositPurpose === 'operational_float' &&
            tenantAllocations.length > 0 &&
            (Math.abs(total - sum) > 1 || tenantAllocations.some((a) => !a.amount || a.amount <= 0));
          const blocked =
            isSubmitting || (channel === 'momo' && !isTidValid()) || opsAllocBlocked;
          return (
            <div className="sticky bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button
                onClick={handleSubmit}
                disabled={blocked}
                className="w-full h-12 text-base font-semibold"
                size="lg"
              >
                {isSubmitting
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {isEditMode ? 'Saving…' : 'Submitting…'}</>
                  : opsAllocBlocked
                    ? 'Fix tenant breakdown to continue'
                    : isEditMode
                      ? 'Save changes'
                      : 'Confirm deposit'}
              </Button>
              {total > 0 && !blocked && (
                <p className="text-center text-xs text-muted-foreground mt-1.5">
                  Depositing <span className="font-semibold text-foreground">{formatCurrency(total)}</span>
                </p>
              )}
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}

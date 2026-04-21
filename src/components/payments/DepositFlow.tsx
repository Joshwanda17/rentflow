import { useState, useEffect } from 'react';
import { useCurrency } from '@/hooks/useCurrency';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, Phone, Calendar, Clock, Hash, AlertCircle, History, Building2, Banknote, Upload, Receipt, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
}

const DEPOSIT_PURPOSES: { id: DepositPurpose; label: string; emoji: string; desc: string }[] = [
  { id: 'operational_float', emoji: '🏘️', label: 'Operational Float', desc: 'Cash collected from tenants in the field' },
  { id: 'personal_deposit', emoji: '💰', label: 'Personal Deposit', desc: 'Your own money top-up' },
  { id: 'partnership_deposit', emoji: '🤝', label: 'Partnership Deposit', desc: 'Money from or for a supporter/partner' },
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

export default function DepositFlow({ open, onOpenChange, defaultPurpose, allowedPurposes, lockPurpose }: DepositFlowProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'channel' | 'form' | 'submitting' | 'success'>('channel');
  const [channel, setChannel] = useState<DepositChannel>('momo');
  const [momoProvider, setMomoProvider] = useState<'mtn' | 'airtel'>('mtn');
  const [amount, setAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [agentName, setAgentName] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [transactionTime, setTransactionTime] = useState('');
  const [reason, setReason] = useState('');
  const [depositPurpose, setDepositPurpose] = useState<DepositPurpose | ''>(defaultPurpose ?? '');
  const [showPurposeGrid, setShowPurposeGrid] = useState<boolean>(!lockPurpose);
  const [bankSlipFile, setBankSlipFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tidError, setTidError] = useState('');

  // Re-apply default when dialog re-opens
  useEffect(() => {
    if (open && defaultPurpose) {
      setDepositPurpose(defaultPurpose);
      const purposeLabel = DEPOSIT_PURPOSES.find(p => p.id === defaultPurpose)?.label;
      if (purposeLabel && defaultPurpose !== 'other') setReason(purposeLabel);
      setShowPurposeGrid(!lockPurpose);
    }
  }, [open, defaultPurpose, lockPurpose]);

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
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter a valid amount'); return false; }
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

      // Duplicate check
      const { data: existing } = await supabase
        .from('deposit_requests')
        .select('id')
        .filter('transaction_id', 'eq', normalizedRef);
      if (existing && existing.length > 0) {
        toast.error('This reference has already been used');
        setStep('form');
        setIsSubmitting(false);
        return;
      }

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
      const notes = [
        `Purpose: ${purposeLabel}`,
        reason.trim() ? reason.trim() : '',
        channel === 'agent_cash' ? `Agent: ${agentName.trim()}` : '',
        bankSlipUrl ? `Bank slip: ${bankSlipUrl}` : '',
      ].filter(Boolean).join(' | ');

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
        } as any);

      if (depositError) throw depositError;

      toast.success('Deposit submitted for verification');
      setStep('success');
    } catch (error: any) {
      console.error('Deposit error:', error);
      toast.error(error.message || 'Failed to submit deposit');
      setStep('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep('channel');
    setChannel('momo');
    setMomoProvider('mtn');
    setAmount('');
    setTransactionId('');
    setReceiptNumber('');
    setAgentName('');
    setTransactionDate('');
    setTransactionTime('');
    setReason('');
    setDepositPurpose(defaultPurpose ?? '');
    setShowPurposeGrid(!lockPurpose);
    setBankSlipFile(null);
    onOpenChange(false);
  };

  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            Deposit to Wallet
          </DialogTitle>
        </DialogHeader>

        {step === 'success' ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-success/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold">Request Submitted!</h3>
            <p className="text-muted-foreground text-sm">Your deposit is being verified.</p>
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
            <p className="text-muted-foreground">Submitting...</p>
          </div>
        ) : step === 'channel' ? (
          /* ─── Channel Selection ─── */
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Choose how you want to deposit</p>
            <div className="grid gap-3">
              {[
                { id: 'agent_cash' as DepositChannel, provider: null, icon: Banknote, label: 'Cash with Agent', desc: 'Pay cash to a Welile agent near you', color: 'border-emerald-500 bg-emerald-500/5' },
                { id: 'momo' as DepositChannel, provider: 'mtn' as const, icon: Phone, label: 'MTN MoMo', desc: 'Pay via MTN Mobile Money', color: 'border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/5' },
                { id: 'momo' as DepositChannel, provider: 'airtel' as const, icon: Phone, label: 'Airtel Money', desc: 'Pay via Airtel Money', color: 'border-destructive bg-destructive/5' },
                { id: 'bank' as DepositChannel, provider: null, icon: Building2, label: 'Bank Transfer', desc: 'Equity Bank Uganda deposit', color: 'border-blue-500 bg-blue-500/5' },
              ].map((ch, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setChannel(ch.id);
                    if (ch.provider) setMomoProvider(ch.provider);
                    setStep('form');
                  }}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all hover:shadow-md active:scale-[0.98] touch-manipulation ${ch.color}`}
                >
                  <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center shrink-0">
                    <ch.icon className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{ch.label}</p>
                    <p className="text-xs text-muted-foreground">{ch.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ─── Form ─── */
          <div className="space-y-4">
            {/* Back to channel */}
            <button onClick={() => setStep('channel')} className="text-xs text-primary font-medium flex items-center gap-1">
              ← Change deposit method ({getProviderLabel()})
            </button>

            {/* ─── MoMo Instructions (Tab-Based) ─── */}
            {channel === 'momo' && (
              <div className="space-y-3">
                {/* Provider Tabs */}
                <div className="grid grid-cols-2 gap-2">
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
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Merchant ID</p>
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
                  <p className="text-[10px] text-primary font-medium">{MERCHANT_NAME}</p>
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
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${momoProvider === 'mtn' ? 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]' : 'bg-destructive text-destructive-foreground'}`}>
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
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono font-semibold text-right">{value}</span>
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
              <Label className="text-xs">Amount (UGX)</Label>
              <Input type="number" placeholder="Enter amount" value={amount} onChange={(e) => setAmount(e.target.value)} min="500" className="text-lg font-semibold h-11" />
              <div className="flex flex-wrap gap-1.5">
                {QUICK_AMOUNTS.map((amt) => (
                  <Button key={amt} type="button" variant={amount === String(amt) ? 'default' : 'outline'} size="sm" className="text-xs h-7" onClick={() => setAmount(String(amt))}>
                    {formatCurrency(amt)}
                  </Button>
                ))}
              </div>
            </div>

            {/* ─── Reference / TID / Receipt ─── */}
            {channel !== 'agent_cash' && channel !== 'cash' ? (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" />
                  {channel === 'bank' ? 'Bank Reference Number' : 'Transaction ID'} <span className="text-destructive">*</span>
                </Label>
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
                  className={`font-mono text-sm ${channel === 'momo' && tidError ? 'border-destructive focus:ring-destructive' : channel === 'momo' && transactionId.trim() && !tidError ? 'border-emerald-500 focus:ring-emerald-500' : ''}`}
                />
                {channel === 'momo' && tidError && (
                  <p className="text-[10px] text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {tidError}
                  </p>
                )}
                {channel === 'momo' && transactionId.trim() && !tidError && (
                  <p className="text-[10px] text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Valid TID format
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  {channel === 'bank'
                    ? 'Find this on your bank receipt or transfer confirmation'
                    : 'Enter the exact TID from your payment confirmation SMS'}
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
                  <p className="text-[10px] text-muted-foreground">
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
                <Label className="text-xs flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" /> Bank Deposit Slip (optional)</Label>
                <Input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setBankSlipFile(e.target.files?.[0] || null)}
                  className="h-10 text-xs"
                />
                {bankSlipFile && <p className="text-[10px] text-emerald-600">📎 {bankSlipFile.name}</p>}
              </div>
            )}

            {/* ─── Date & Time ─── */}
            <div className="grid grid-cols-2 gap-2">
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
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> Deposit Purpose *</Label>
                {lockPurpose && depositPurpose && (
                  <button
                    type="button"
                    onClick={() => setShowPurposeGrid((s) => !s)}
                    className="text-[10px] text-primary font-medium underline-offset-2 hover:underline"
                  >
                    {showPurposeGrid ? 'Hide options' : 'Change purpose'}
                  </button>
                )}
              </div>
              {lockPurpose && depositPurpose && !showPurposeGrid && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl border-2 border-primary bg-primary/10">
                  <span className="text-base">{DEPOSIT_PURPOSES.find(p => p.id === depositPurpose)?.emoji}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-xs">{DEPOSIT_PURPOSES.find(p => p.id === depositPurpose)?.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {DEPOSIT_PURPOSES.find(p => p.id === depositPurpose)?.desc}
                    </p>
                  </div>
                </div>
              )}
              {(showPurposeGrid || !lockPurpose) && (
              <div className="grid grid-cols-2 gap-2">
                {DEPOSIT_PURPOSES.filter(p => !allowedPurposes || allowedPurposes.includes(p.id)).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setDepositPurpose(p.id);
                      if (p.id !== 'other') setReason(p.label);
                      else setReason('');
                      if (lockPurpose) setShowPurposeGrid(false);
                    }}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-left transition-all text-xs ${
                      depositPurpose === p.id
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <span className="text-base">{p.emoji}</span>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{p.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{p.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              )}
              {depositPurpose === 'operational_float' && (
                <div className="flex items-start gap-2 p-2 bg-primary/5 rounded-lg border border-primary/20">
                  <AlertCircle className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground">
                    This deposit will be credited as <span className="font-semibold text-primary">Company Operations Float</span> — restricted to landlord disbursements only. Not withdrawable as personal funds.
                  </p>
                </div>
              )}
              {depositPurpose === 'other' && (
                <Input placeholder="Specify your reason..." value={reason} onChange={(e) => setReason(e.target.value)} className="h-10 text-sm" />
              )}
            </div>

            {/* ─── Warning ─── */}
            <div className="flex items-start gap-2 p-2.5 bg-warning/10 rounded-lg border border-warning/20">
              <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground">Ensure all details match your {channel === 'momo' ? 'SMS' : channel === 'bank' ? 'bank receipt' : 'physical receipt'}. Incorrect info delays verification.</p>
            </div>

            <Button onClick={handleSubmit} disabled={isSubmitting || (channel === 'momo' && !isTidValid())} className="w-full h-11" size="lg">
              {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting...</> : 'Submit Deposit Request'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

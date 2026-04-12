import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';
import { Loader2, Search, User, Wallet, PiggyBank, CheckCircle, ArrowRight, Copy, UserPlus, Info } from 'lucide-react';
import { PRICE_PER_SHARE, TOTAL_SHARES, POOL_PERCENT } from '@/components/angel-pool/constants';
import { cn } from '@/lib/utils';
import { usePhoneDuplicateCheck } from '@/hooks/usePhoneDuplicateCheck';

interface AgentAngelPoolInvestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Step = 'search' | 'amount' | 'preview' | 'success';

interface InvestorResult {
  id: string;
  full_name: string;
  phone: string;
  walletBalance: number;
}

interface InvestmentResult {
  reference_id: string;
  shares: number;
  actual_amount: number;
  pool_ownership_percent: number;
  company_ownership_percent: number;
  commission: number;
  investor_new_balance: number;
}

export function AgentAngelPoolInvestDialog({ open, onOpenChange, onSuccess }: AgentAngelPoolInvestDialogProps) {
  const [step, setStep] = useState<Step>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedInvestor, setSelectedInvestor] = useState<InvestorResult | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [investmentReference, setInvestmentReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<InvestmentResult | null>(null);

  // Registration state
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regNotes, setRegNotes] = useState('');
  const [registering, setRegistering] = useState(false);

  const { isDuplicate, isChecking, duplicateMessage } = usePhoneDuplicateCheck(regPhone);

  const reset = () => {
    setStep('search');
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setSelectedInvestor(null);
    setAmount('');
    setPaymentMethod('cash');
    setInvestmentReference('');
    setSubmitting(false);
    setResult(null);
    setShowRegister(false);
    setRegName('');
    setRegPhone('');
    setRegNotes('');
    setRegistering(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    setSearching(true);
    setHasSearched(true);
    setShowRegister(false);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .or(`full_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
        .limit(10);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (err) {
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const selectInvestor = async (profile: any) => {
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', profile.id)
      .single();

    setSelectedInvestor({
      id: profile.id,
      full_name: profile.full_name || 'Unknown',
      phone: profile.phone || '',
      walletBalance: wallet?.balance ?? 0,
    });
    setStep('amount');
  };

  const handleRegister = async () => {
    if (!regName.trim() || regName.trim().length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    const cleanedPhone = regPhone.replace(/\D/g, '');
    if (cleanedPhone.length < 9) {
      toast.error('Enter a valid phone number');
      return;
    }
    if (isDuplicate) {
      toast.error('This phone number is already registered');
      return;
    }

    setRegistering(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('register-proxy-funder', {
        body: {
          full_name: regName.trim(),
          phone: regPhone.trim(),
          agent_id: user.id,
          notes: regNotes.trim() || 'Registered during Angel Pool investment',
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`${data.full_name} registered successfully!`);

      // Auto-select the newly created investor
      await selectInvestor({
        id: data.funder_id,
        full_name: data.full_name,
        phone: data.phone,
      });
    } catch (err: any) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  const parsedAmount = Number(amount) || 0;
  const shares = Math.floor(parsedAmount / PRICE_PER_SHARE);
  const actualAmount = shares * PRICE_PER_SHARE;
  const poolPercent = (shares / TOTAL_SHARES) * 100;
  const companyPercent = (shares / TOTAL_SHARES) * POOL_PERCENT;
  const commission = Math.floor(actualAmount * 0.01);

  const canProceed = shares > 0 && selectedInvestor && actualAmount <= selectedInvestor.walletBalance;

  const handleSubmit = async () => {
    if (!selectedInvestor || !canProceed) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('agent-angel-pool-invest', {
        body: {
          investor_id: selectedInvestor.id,
          amount: actualAmount,
          payment_method: paymentMethod,
          investment_reference: investmentReference || undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult(data);
      setStep('success');
      toast.success('Angel Pool investment completed!');
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || 'Investment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWhatsAppShare = () => {
    if (!result || !selectedInvestor) return;
    const msg = encodeURIComponent(
      `✅ Angel Pool Investment Confirmed!\n\n` +
      `Investor: ${selectedInvestor.full_name}\n` +
      `Amount: UGX ${result.actual_amount.toLocaleString()}\n` +
      `Shares: ${result.shares}\n` +
      `Pool Ownership: ${result.pool_ownership_percent.toFixed(4)}%\n` +
      `Company Equity: ${result.company_ownership_percent.toFixed(4)}%\n` +
      `Reference: ${result.reference_id}\n\n` +
      `Welcome to the Welile Angel Pool! 🦄`
    );
    window.open(`https://wa.me/${selectedInvestor.phone.replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  const regPhoneClean = regPhone.replace(/\D/g, '');
  const canRegister = regName.trim().length >= 2 && regPhoneClean.length >= 9 && !isDuplicate && !isChecking;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto px-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-emerald-500" />
            {step === 'search' && (showRegister ? 'Register New Investor' : 'Select Investor')}
            {step === 'amount' && 'Investment Details'}
            {step === 'preview' && 'Confirm Investment'}
            {step === 'success' && 'Investment Complete'}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Search */}
        {step === 'search' && !showRegister && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Search by name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={searching} size="icon" variant="outline">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectInvestor(p)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/60 transition-colors text-left"
                >
                  <div className="p-2 rounded-lg bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.full_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{p.phone}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
              {searchResults.length === 0 && hasSearched && !searching && (
                <p className="text-center text-sm text-muted-foreground py-2">No results found</p>
              )}
            </div>

            {/* Register New Investor button */}
            <button
              onClick={() => setShowRegister(true)}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-[#7718D1]/40 hover:bg-[#7718D1]/5 transition-colors text-[#7718D1] text-sm font-medium"
            >
              <UserPlus className="h-4 w-4" />
              Register New Investor
            </button>
          </div>
        )}

        {/* Step 1b: Inline Registration */}
        {step === 'search' && showRegister && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
              <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                This creates a no-smartphone account. The investor will receive updates via USSD/SMS.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. John Mukasa"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label>Phone Number <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. 0771234567"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                type="tel"
                maxLength={15}
              />
              {isChecking && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking...
                </p>
              )}
              {isDuplicate && duplicateMessage && (
                <p className="text-xs text-destructive">{duplicateMessage}</p>
              )}
              {regPhoneClean.length >= 9 && !isDuplicate && !isChecking && (
                <p className="text-xs text-emerald-600">✓ Phone available</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                placeholder="e.g. Referred by village chairman"
                value={regNotes}
                onChange={(e) => setRegNotes(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowRegister(false)} className="flex-1">
                Back to Search
              </Button>
              <Button
                onClick={handleRegister}
                disabled={!canRegister || registering}
                className="flex-1 bg-[#7718D1] hover:bg-[#6514B5]"
              >
                {registering ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Register
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Amount */}
        {step === 'amount' && selectedInvestor && (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/40 p-3">
              <div className="flex items-center gap-2 mb-1">
                <User className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">{selectedInvestor.full_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Wallet: <span className="font-semibold text-foreground">{formatUGX(selectedInvestor.walletBalance)}</span>
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Investment Amount (UGX)</Label>
              <Input
                type="number"
                placeholder={`Min ${PRICE_PER_SHARE.toLocaleString()}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric"
              />
              {parsedAmount > 0 && shares > 0 && (
                <p className="text-xs text-muted-foreground">
                  = {shares} shares × UGX {PRICE_PER_SHARE.toLocaleString()} = {formatUGX(actualAmount)}
                </p>
              )}
              {parsedAmount > 0 && selectedInvestor.walletBalance < actualAmount && (
                <p className="text-xs text-destructive">Insufficient wallet balance</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-3 gap-2">
                {['cash', 'momo', 'bank'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={cn(
                      "py-2 px-3 rounded-lg text-xs font-medium border transition-colors capitalize",
                      paymentMethod === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    {m === 'momo' ? 'Mobile Money' : m}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod !== 'cash' && (
              <div className="space-y-2">
                <Label>Payment Reference (optional)</Label>
                <Input
                  placeholder="Transaction ID or reference"
                  value={investmentReference}
                  onChange={(e) => setInvestmentReference(e.target.value)}
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('search')} className="flex-1">Back</Button>
              <Button onClick={() => setStep('preview')} disabled={!canProceed} className="flex-1">
                Preview <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && selectedInvestor && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Investor</span>
                <span className="font-medium">{selectedInvestor.full_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">{formatUGX(actualAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shares</span>
                <span className="font-semibold">{shares.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pool Ownership</span>
                <span>{poolPercent.toFixed(4)}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Company Equity</span>
                <span>{companyPercent.toFixed(4)}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payment</span>
                <span className="capitalize">{paymentMethod === 'momo' ? 'Mobile Money' : paymentMethod}</span>
              </div>
              <hr className="border-border" />
              <div className="flex justify-between text-sm">
                <span className="text-emerald-600 font-medium">Your Commission (1%)</span>
                <span className="font-bold text-emerald-600">{formatUGX(commission)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('amount')} className="flex-1">Back</Button>
              <Button onClick={handleSubmit} disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Confirm
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 'success' && result && selectedInvestor && (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-emerald-500" />
            </div>
            <div>
              <p className="font-bold text-lg">Investment Confirmed!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {result.shares} shares allocated to {selectedInvestor.full_name}
              </p>
            </div>

            <div className="rounded-xl bg-muted/40 p-3 space-y-2 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reference</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-medium">{result.reference_id}</span>
                  <button onClick={() => { navigator.clipboard.writeText(result.reference_id); toast.success('Copied!'); }}>
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">{formatUGX(result.actual_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shares</span>
                <span>{result.shares}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-600">Commission Earned</span>
                <span className="font-bold text-emerald-600">{formatUGX(result.commission)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleWhatsAppShare} className="flex-1">
                📱 Share via WhatsApp
              </Button>
              <Button onClick={handleClose} className="flex-1">Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

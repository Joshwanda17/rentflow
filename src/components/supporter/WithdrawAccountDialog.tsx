import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatUGX } from '@/lib/rentCalculations';
import { ArrowDownToLine, Phone, Building2, Banknote, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { UGANDA_BANKS } from '@/lib/ugandaBanks';

type PayoutMode = 'cash' | 'mtn' | 'airtel' | 'bank';

interface WithdrawAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  accountId: string;
  accountBalance: number;
  onWithdraw: (accountId: string, amount: number, payoutDetails?: PayoutDetails) => Promise<void>;
}

export interface PayoutDetails {
  mode: PayoutMode;
  momoNumber?: string;
  momoName?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
}

const PAYOUT_OPTIONS: { value: PayoutMode; label: string; icon: string; color: string }[] = [
  { value: 'mtn', label: 'MTN MoMo', icon: '📱', color: 'border-yellow-400 bg-yellow-400/10' },
  { value: 'airtel', label: 'Airtel Money', icon: '📱', color: 'border-red-400 bg-red-400/10' },
  { value: 'bank', label: 'Bank', icon: '🏦', color: 'border-blue-400 bg-blue-400/10' },
  { value: 'cash', label: 'Cash', icon: '💵', color: 'border-green-400 bg-green-400/10' },
];

export function WithdrawAccountDialog({
  open,
  onOpenChange,
  accountName,
  accountId,
  accountBalance,
  onWithdraw,
}: WithdrawAccountDialogProps) {
  const [amount, setAmount] = useState(10000);
  const [loading, setLoading] = useState(false);
  const [payoutMode, setPayoutMode] = useState<PayoutMode | null>(null);
  const [momoNumber, setMomoNumber] = useState('');
  const [momoName, setMomoName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');

  const isPayoutValid = () => {
    if (!payoutMode) return false;
    if (payoutMode === 'mtn' || payoutMode === 'airtel')
      return momoNumber.trim().length >= 9 && momoName.trim().length >= 2;
    if (payoutMode === 'bank')
      return !!bankName && bankAccountName.trim().length >= 2 && bankAccountNumber.trim().length >= 5;
    return true;
  };

  const maxAmount = accountBalance;
  const canWithdraw = accountBalance > 0 && amount > 0 && amount <= accountBalance && isPayoutValid();

  const handleWithdraw = async () => {
    if (!canWithdraw) return;
    setLoading(true);
    try {
      const details: PayoutDetails = { mode: payoutMode! };
      if (payoutMode === 'mtn' || payoutMode === 'airtel') {
        details.momoNumber = momoNumber.trim();
        details.momoName = momoName.trim();
      } else if (payoutMode === 'bank') {
        details.bankName = bankName;
        details.bankAccountName = bankAccountName.trim();
        details.bankAccountNumber = bankAccountNumber.trim();
      }
      await onWithdraw(accountId, amount, details);
      resetAndClose();
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setPayoutMode(null);
    setMomoNumber('');
    setMomoName('');
    setBankName('');
    setBankAccountName('');
    setBankAccountNumber('');
    setAmount(10000);
    onOpenChange(false);
  };

  const handleSelect = (mode: PayoutMode) => {
    setPayoutMode(prev => (prev === mode ? null : mode));
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) resetAndClose(); else onOpenChange(val); }}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto p-0" stable>
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            Withdraw from {accountName}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-5">
          {/* Balance bar */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
            <span className="text-xs text-muted-foreground font-medium">Available</span>
            <span className="text-lg font-black text-foreground">{formatUGX(accountBalance)}</span>
          </div>

          {/* ── PAYOUT METHOD ── */}
          <div className="space-y-2.5">
            <Label className="text-sm font-bold">How do you want your money?</Label>
            <div className="grid grid-cols-4 gap-2">
              {PAYOUT_OPTIONS.map((opt) => {
                const selected = payoutMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-3 min-h-[72px] transition-all active:scale-95 ${
                      selected
                        ? `${opt.color} ring-2 ring-primary shadow-md`
                        : 'border-border bg-card hover:border-muted-foreground/30'
                    }`}
                  >
                    {selected && (
                      <CheckCircle2 className="absolute top-1 right-1 h-3.5 w-3.5 text-primary" />
                    )}
                    <span className="text-xl leading-none">{opt.icon}</span>
                    <span className="text-[10px] font-bold mt-1.5 text-center leading-tight">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── INLINE DETAILS (expand below selected card) ── */}
          <AnimatePresence mode="wait">
            {payoutMode && (
              <motion.div
                key={payoutMode}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 pt-1">
                  {(payoutMode === 'mtn' || payoutMode === 'airtel') && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">
                          {payoutMode === 'mtn' ? 'MTN' : 'Airtel'} Number
                        </Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="tel"
                            inputMode="tel"
                            placeholder="e.g. 0770 123 456"
                            value={momoNumber}
                            onChange={(e) => setMomoNumber(e.target.value)}
                            className="h-11 pl-10"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Registered Name</Label>
                        <Input
                          placeholder="e.g. JOHN DOE"
                          value={momoName}
                          onChange={(e) => setMomoName(e.target.value)}
                          className="h-11"
                        />
                      </div>
                    </>
                  )}

                  {payoutMode === 'bank' && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Bank</Label>
                        <Select value={bankName} onValueChange={setBankName}>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Select bank…" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {UGANDA_BANKS.map((b) => (
                              <SelectItem key={b} value={b}>{b}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Account Holder</Label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="e.g. JOHN DOE"
                            value={bankAccountName}
                            onChange={(e) => setBankAccountName(e.target.value)}
                            className="h-11 pl-10"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Account Number</Label>
                        <div className="relative">
                          <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="e.g. 9030012345678"
                            value={bankAccountNumber}
                            onChange={(e) => setBankAccountNumber(e.target.value)}
                            className="h-11 pl-10"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {payoutMode === 'cash' && (
                    <div className="p-3 rounded-xl bg-success/5 border border-success/20">
                      <p className="text-xs font-bold mb-1">💵 Cash Collection</p>
                      <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground text-[11px]">
                        <li>Submit your request below</li>
                        <li>A manager will approve it</li>
                        <li>Visit the nearest agent shop with your ID</li>
                      </ol>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── AMOUNT (always visible, but disabled if no balance) ── */}
          {accountBalance > 0 && isPayoutValid() && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3 border-t border-border pt-4"
            >
              <Label className="text-sm font-bold">Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">UGX</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={amount.toLocaleString()}
                  onChange={(e) => {
                    const v = parseInt(e.target.value.replace(/,/g, '')) || 0;
                    setAmount(Math.max(0, Math.min(v, maxAmount)));
                  }}
                  className="pl-12 text-lg font-bold h-12 text-center"
                />
              </div>
              <Slider
                value={[amount]}
                onValueChange={([v]) => setAmount(v)}
                min={1000}
                max={maxAmount}
                step={1000}
                className="py-1"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>UGX 1,000</span>
                <button type="button" onClick={() => setAmount(maxAmount)} className="text-primary font-bold hover:underline">
                  Withdraw All
                </button>
              </div>

              {amount > accountBalance && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Exceeds balance
                </div>
              )}
            </motion.div>
          )}

          {/* Zero balance notice */}
          {accountBalance <= 0 && isPayoutValid() && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              <span className="text-muted-foreground">
                Payout method saved! Fund your account first to withdraw.
              </span>
            </motion.div>
          )}

          {/* ── ACTION BUTTON ── */}
          <div className="pt-1">
            {canWithdraw ? (
              <Button
                onClick={handleWithdraw}
                disabled={loading}
                className="w-full h-12 gap-2 rounded-xl font-bold text-sm bg-gradient-to-r from-primary to-primary/80"
              >
                {loading ? 'Processing…' : (
                  <>
                    <ArrowDownToLine className="h-4 w-4" />
                    Withdraw {formatUGX(amount)}
                  </>
                )}
              </Button>
            ) : accountBalance <= 0 && isPayoutValid() ? (
              <Button
                onClick={resetAndClose}
                className="w-full h-12 gap-2 rounded-xl font-bold text-sm"
              >
                <CheckCircle2 className="h-4 w-4" />
                Save Payout Method
              </Button>
            ) : (
              <Button disabled className="w-full h-12 rounded-xl font-bold text-sm opacity-50">
                {!payoutMode ? 'Select a payout method above' : !isPayoutValid() ? 'Complete payout details' : 'Enter amount'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

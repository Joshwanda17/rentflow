import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { formatUGX } from '@/lib/rentCalculations';
import { Wallet, ArrowRight, AlertCircle, ArrowDownToLine, Phone, Building2, Banknote, CheckCircle2, ChevronLeft } from 'lucide-react';
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

const PAYOUT_OPTIONS: { value: PayoutMode; label: string; icon: string; desc: string }[] = [
  { value: 'mtn', label: 'MTN Mobile Money', icon: '📱', desc: 'Receive via MTN MoMo' },
  { value: 'airtel', label: 'Airtel Money', icon: '📱', desc: 'Receive via Airtel Money' },
  { value: 'bank', label: 'Bank Transfer', icon: '🏦', desc: 'Direct bank deposit' },
  { value: 'cash', label: 'Cash at Agent Shop', icon: '💵', desc: 'Collect cash at agent location' },
];

export function WithdrawAccountDialog({ 
  open, 
  onOpenChange, 
  accountName, 
  accountId, 
  accountBalance,
  onWithdraw 
}: WithdrawAccountDialogProps) {
  const [step, setStep] = useState<'payout' | 'amount'>('payout');
  const [amount, setAmount] = useState(10000);
  const [loading, setLoading] = useState(false);

  // Payout state
  const [payoutMode, setPayoutMode] = useState<PayoutMode | null>(null);
  const [momoNumber, setMomoNumber] = useState('');
  const [momoName, setMomoName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');

  const isPayoutValid = () => {
    if (!payoutMode) return false;
    if (payoutMode === 'mtn' || payoutMode === 'airtel') {
      return momoNumber.trim().length >= 9 && momoName.trim().length >= 2;
    }
    if (payoutMode === 'bank') {
      return !!bankName && bankAccountName.trim().length >= 2 && bankAccountNumber.trim().length >= 5;
    }
    return true; // cash
  };

  const handleWithdraw = async () => {
    if (amount <= 0 || amount > accountBalance || !isPayoutValid()) return;
    
    setLoading(true);
    try {
      const payoutDetails: PayoutDetails = { mode: payoutMode! };
      if (payoutMode === 'mtn' || payoutMode === 'airtel') {
        payoutDetails.momoNumber = momoNumber.trim();
        payoutDetails.momoName = momoName.trim();
      } else if (payoutMode === 'bank') {
        payoutDetails.bankName = bankName;
        payoutDetails.bankAccountName = bankAccountName.trim();
        payoutDetails.bankAccountNumber = bankAccountNumber.trim();
      }
      await onWithdraw(accountId, amount, payoutDetails);
      // Reset
      setStep('payout');
      setAmount(10000);
      setPayoutMode(null);
      setMomoNumber('');
      setMomoName('');
      setBankName('');
      setBankAccountName('');
      setBankAccountNumber('');
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setStep('payout');
    }
    onOpenChange(val);
  };

  const maxAmount = accountBalance;
  const isAmountValid = amount > 0 && amount <= accountBalance && accountBalance > 0;

  const payoutLabel = payoutMode
    ? PAYOUT_OPTIONS.find(o => o.value === payoutMode)?.label ?? ''
    : '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" stable>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            {step === 'payout' ? 'Choose Payout Method' : 'Withdraw Funds'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          {/* Account Info */}
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
            <p className="text-xs text-muted-foreground">Withdrawing from</p>
            <p className="font-bold text-lg">{accountName}</p>
            <p className="text-sm text-muted-foreground">Balance: <span className="font-bold text-foreground">{formatUGX(accountBalance)}</span></p>
          </div>

          {/* ═══════════ STEP 1: PAYOUT METHOD ═══════════ */}
          {step === 'payout' && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <Label className="text-sm font-bold">How do you want to receive your money?</Label>
              <div className="grid grid-cols-2 gap-2">
                {PAYOUT_OPTIONS.map((opt) => (
                  <Card
                    key={opt.value}
                    className={`p-3 cursor-pointer transition-all text-center ${
                      payoutMode === opt.value
                        ? 'ring-2 ring-primary border-primary bg-primary/5'
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => setPayoutMode(opt.value)}
                  >
                    <span className="text-2xl">{opt.icon}</span>
                    <p className="text-xs font-bold mt-1">{opt.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
                  </Card>
                ))}
              </div>

              {/* Payout details form */}
              <AnimatePresence mode="wait">
                {payoutMode && (
                  <motion.div
                    key={payoutMode}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-3"
                  >
                    {(payoutMode === 'mtn' || payoutMode === 'airtel') && (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-xs">
                            {payoutMode === 'mtn' ? 'MTN' : 'Airtel'} Mobile Money Number
                          </Label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="tel"
                              placeholder="e.g. 0770123456"
                              value={momoNumber}
                              onChange={(e) => setMomoNumber(e.target.value)}
                              className="h-11 pl-10"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Registered Name</Label>
                          <Input
                            type="text"
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
                        <div className="space-y-1.5">
                          <Label className="text-xs">Bank Name</Label>
                          <Select value={bankName} onValueChange={setBankName}>
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select your bank..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {UGANDA_BANKS.map(b => (
                                <SelectItem key={b} value={b}>{b}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Account Holder Name</Label>
                          <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="text"
                              placeholder="e.g. JOHN DOE"
                              value={bankAccountName}
                              onChange={(e) => setBankAccountName(e.target.value)}
                              className="h-11 pl-10"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Account Number</Label>
                          <div className="relative">
                            <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="text"
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
                      <Card className="p-3 bg-success/5 border-success/20">
                        <p className="text-xs font-bold text-foreground mb-1">💵 Cash at Agent Shop</p>
                        <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground text-[11px]">
                          <li>Your request will be reviewed by a manager</li>
                          <li>Once approved, you'll be notified</li>
                          <li>Visit the nearest agent shop with your ID to collect</li>
                        </ol>
                      </Card>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ═══════════ STEP 2: AMOUNT (only if balance > 0) ═══════════ */}
          {step === 'amount' && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              {/* Selected payout summary */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-success/10 border border-success/20">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <span className="text-sm font-bold text-foreground">Payout: {payoutLabel}</span>
                <button
                  type="button"
                  onClick={() => setStep('payout')}
                  className="ml-auto text-xs text-primary hover:underline"
                >
                  Change
                </button>
              </div>

              {accountBalance > 0 ? (
                <>
                  {/* Amount Input */}
                  <div className="space-y-3">
                    <Label>Amount to Withdraw</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                        UGX
                      </span>
                      <Input
                        type="text"
                        value={amount.toLocaleString()}
                        onChange={(e) => {
                          const value = parseInt(e.target.value.replace(/,/g, '')) || 0;
                          setAmount(Math.max(0, Math.min(value, maxAmount)));
                        }}
                        className="pl-12 text-lg font-bold h-12 text-center"
                      />
                    </div>
                    
                    <Slider
                      value={[amount]}
                      onValueChange={([value]) => setAmount(value)}
                      min={1000}
                      max={maxAmount}
                      step={1000}
                      className="py-2"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>UGX 1,000</span>
                      <button 
                        type="button"
                        onClick={() => setAmount(accountBalance)}
                        className="text-primary font-medium hover:underline"
                      >
                        Max
                      </button>
                      <span>{formatUGX(maxAmount)}</span>
                    </div>
                  </div>

                  {amount > accountBalance && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>Insufficient account balance</span>
                    </div>
                  )}

                  {/* Transfer Preview */}
                  <AnimatePresence mode="wait">
                    {isAmountValid && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                          <div className="flex items-center gap-2 mb-1">
                            <Wallet className="h-4 w-4 text-primary" />
                            <span className="text-xs font-bold text-primary">{payoutLabel}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground truncate">{accountName}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-lg font-black text-primary">{formatUGX(amount)}</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span className="text-muted-foreground">Your payout method is set! Fund your account to make a withdrawal.</span>
                </div>
              )}
            </motion.div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step === 'payout' ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (accountBalance > 0) {
                    setStep('amount');
                  } else {
                    // Just save payout and close
                    handleOpenChange(false);
                  }
                }}
                disabled={!isPayoutValid()}
                className="gap-2 bg-gradient-to-r from-primary to-primary/80"
              >
                {accountBalance > 0 ? (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Save Payout Method
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('payout')} disabled={loading}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button 
                onClick={handleWithdraw} 
                disabled={!isAmountValid || loading}
                className="gap-2 bg-gradient-to-r from-primary to-primary/80"
              >
                {loading ? (
                  'Processing...'
                ) : (
                  <>
                    <ArrowDownToLine className="h-4 w-4" />
                    Withdraw
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

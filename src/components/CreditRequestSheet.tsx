import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import {
  ArrowRight, ArrowLeft, Send, Loader2, CheckCircle2,
  Zap, Phone, MapPin, User, Home, TrendingUp, Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { calculateCreditRepayment, formatUGX } from '@/lib/creditFeeCalculations';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { hapticTap } from '@/lib/haptics';

interface CreditRequestSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  creditLimit: number;
}

type Step = 'summary' | 'details' | 'confirm';

export function CreditRequestSheet({ open, onOpenChange, userId, creditLimit }: CreditRequestSheetProps) {
  const [step, setStep] = useState<Step>('summary');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  // Repayment preferences
  const [durationDays, setDurationDays] = useState(30);
  const [frequency, setFrequency] = useState('daily');

  // Verification details
  const [borrowerPhone, setBorrowerPhone] = useState('');
  const [borrowerMmName, setBorrowerMmName] = useState('');
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [electricityMeter, setElectricityMeter] = useState('');
  const [waterMeter, setWaterMeter] = useState('');
  const [locationAddress, setLocationAddress] = useState('');

  const repayment = calculateCreditRepayment(creditLimit, durationDays);

  const frequencyAmount =
    frequency === 'daily' ? repayment.dailyRepayment :
    frequency === 'weekly' ? repayment.weeklyRepayment :
    repayment.monthlyRepayment;

  const isDetailsValid =
    borrowerPhone.length >= 9 &&
    borrowerMmName.trim().length > 1 &&
    landlordName.trim().length > 1 &&
    landlordPhone.length >= 9 &&
    (electricityMeter.trim().length > 0 || waterMeter.trim().length > 0);

  const handleSubmit = async () => {
    if (submitting || submitted) return;
    hapticTap();
    setSubmitting(true);

    try {
      // Create the loan record
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + durationDays);

      const { data: loan, error: loanError } = await supabase
        .from('user_loans')
        .insert({
          borrower_id: userId,
          lender_id: userId,
          amount: creditLimit,
          interest_rate: Number(repayment.platformFeePercent),
          total_repayment: repayment.totalRepayment,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pending',
          repayment_frequency: frequency,
        })
        .select('id')
        .single();

      if (loanError) throw loanError;

      // Get location
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        // location optional
      }

      // Save verification details
      const { error: detailsError } = await supabase
        .from('credit_request_details' as any)
        .insert({
          loan_id: loan.id,
          borrower_id: userId,
          borrower_phone: borrowerPhone,
          borrower_mm_name: borrowerMmName,
          landlord_name: landlordName,
          landlord_phone: landlordPhone,
          electricity_meter_number: electricityMeter || null,
          water_meter_number: waterMeter || null,
          location_address: locationAddress || null,
          location_latitude: lat || null,
          location_longitude: lng || null,
          repayment_frequency: frequency,
          duration_days: durationDays,
          platform_fee_rate: 5,
          platform_fee_amount: repayment.platformFee,
          total_with_fees: repayment.totalRepayment,
        } as any);

      if (detailsError) throw detailsError;

      setSubmitted(true);
      toast({
        title: '✅ Credit Request Sent!',
        description: 'An agent will contact you to verify your details. Funders can now see your request.',
      });
    } catch (err: any) {
      toast({ title: 'Request Failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      onOpenChange(false);
      // Reset after close animation
      setTimeout(() => {
        setStep('summary');
        setSubmitted(false);
      }, 300);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl overflow-y-auto pb-8">
        <SheetHeader className="text-left pb-2">
          <SheetTitle className="text-lg font-bold">
            {step === 'summary' && '📊 Repayment Plan'}
            {step === 'details' && '🔒 Verification Details'}
            {step === 'confirm' && (submitted ? '✅ Request Sent' : '📋 Confirm & Submit')}
          </SheetTitle>
        </SheetHeader>

        <AnimatePresence mode="wait">
          {step === 'summary' && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 mt-2"
            >
              {/* Amount */}
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 text-center">
                <p className="text-xs text-muted-foreground">Credit Amount</p>
                <p className="text-2xl font-bold text-primary">{formatUGX(creditLimit)}</p>
              </div>

              {/* Duration slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Repayment Period</span>
                  <Badge variant="secondary">{durationDays} days</Badge>
                </div>
                <Slider
                  value={[durationDays]}
                  onValueChange={([v]) => setDurationDays(v)}
                  min={7}
                  max={90}
                  step={1}
                  className="py-2"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>7 days</span>
                  <span>90 days max</span>
                </div>
              </div>

              {/* Frequency */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Repayment Frequency</Label>
                <RadioGroup value={frequency} onValueChange={setFrequency} className="grid grid-cols-3 gap-2">
                  {(['daily', 'weekly', 'monthly'] as const).map((f) => (
                    <Label
                      key={f}
                      className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl border-2 cursor-pointer text-xs font-semibold transition-colors ${
                        frequency === f
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-muted bg-muted/30 text-muted-foreground'
                      }`}
                    >
                      <RadioGroupItem value={f} className="sr-only" />
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              {/* Breakdown */}
              <div className="space-y-2 p-3 rounded-xl bg-muted/50">
                <Row label="Credit Amount" value={formatUGX(creditLimit)} />
                <Row label={`Platform Fee (5% compound, ${repayment.platformFeePercent}%)`} value={`+ ${formatUGX(repayment.platformFee)}`} highlight />
                <Separator />
                <Row label="Total Repayment" value={formatUGX(repayment.totalRepayment)} bold />
                <Row
                  label={`${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Payment`}
                  value={formatUGX(frequencyAmount)}
                  bold
                  highlight
                />
              </div>

              {/* Benefits */}
              <div className="space-y-1.5 p-3 rounded-xl bg-green-500/5 border border-green-500/20">
                <p className="text-xs font-bold text-green-700 flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Benefits of Repaying as Agreed
                </p>
                <ul className="text-[11px] text-muted-foreground space-y-1 ml-5 list-disc">
                  <li>Increase your credit access up to <strong>UGX 30,000,000</strong></li>
                  <li>Faster approvals on future requests</li>
                  <li>Priority matching with funders</li>
                  <li>Lower platform fees over time</li>
                </ul>
              </div>

              {/* Agent note */}
              <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <p className="text-[11px] text-muted-foreground">
                  <Shield className="h-3.5 w-3.5 inline mr-1 text-blue-500" />
                  An agent will visit you to verify your details. The 5% platform fee is paid to the agent daily as you repay.
                  Funders may add their own interest on top of the 5% platform fee.
                </p>
              </div>

              <Button onClick={() => { hapticTap(); setStep('details'); }} className="w-full gap-2 rounded-xl h-12 font-bold">
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {step === 'details' && (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3 mt-2"
            >
              <p className="text-xs text-muted-foreground">
                Provide your details for agent verification. An agent will visit to confirm.
              </p>

              {/* Borrower info */}
              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-1"><Phone className="h-3 w-3" /> Your Phone Number</Label>
                <Input
                  placeholder="0771234567"
                  value={borrowerPhone}
                  onChange={(e) => setBorrowerPhone(e.target.value)}
                  maxLength={15}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-1"><User className="h-3 w-3" /> Mobile Money Registered Name</Label>
                <Input
                  placeholder="Name shown when receiving MM"
                  value={borrowerMmName}
                  onChange={(e) => setBorrowerMmName(e.target.value)}
                  maxLength={100}
                />
              </div>

              <Separator />

              {/* Landlord info */}
              <p className="text-xs font-bold flex items-center gap-1"><Home className="h-3.5 w-3.5" /> Landlord Information</p>

              <div className="space-y-2">
                <Label className="text-xs">Landlord Full Name</Label>
                <Input
                  placeholder="As shown on phone/MM"
                  value={landlordName}
                  onChange={(e) => setLandlordName(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Landlord Phone Number</Label>
                <Input
                  placeholder="0771234567"
                  value={landlordPhone}
                  onChange={(e) => setLandlordPhone(e.target.value)}
                  maxLength={15}
                />
              </div>

              {/* Utility meters */}
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1"><Zap className="h-3 w-3 text-yellow-500" /> UEDCL/UMEME Meter Number</Label>
                <Input
                  placeholder="Electricity meter number"
                  value={electricityMeter}
                  onChange={(e) => setElectricityMeter(e.target.value)}
                  maxLength={30}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1">💧 NWSC Water Meter Number</Label>
                <Input
                  placeholder="Water meter number"
                  value={waterMeter}
                  onChange={(e) => setWaterMeter(e.target.value)}
                  maxLength={30}
                />
              </div>

              {/* Location */}
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3 text-red-500" /> Landlord Location / Address</Label>
                <Input
                  placeholder="Area, village, or address"
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                  maxLength={200}
                />
              </div>

              <p className="text-[10px] text-muted-foreground">
                📍 Your GPS location will be captured automatically when you submit.
                Must match landlord's registered location.
              </p>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => { hapticTap(); setStep('summary'); }} className="flex-1 gap-1 rounded-xl h-11">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={() => { hapticTap(); setStep('confirm'); }}
                  disabled={!isDetailsValid}
                  className="flex-1 gap-1 rounded-xl h-11 font-bold"
                >
                  Review <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 'confirm' && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3 mt-2"
            >
              {submitted ? (
                <div className="text-center py-8 space-y-3">
                  <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                  <p className="font-bold text-lg">Credit Request Submitted!</p>
                  <p className="text-sm text-muted-foreground">
                    An agent will contact you at <strong>{borrowerPhone}</strong> to verify your details and visit your location.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Once verified, funders will see your request and can choose to fund it.
                  </p>
                  <Button onClick={handleClose} className="rounded-xl mt-4">Close</Button>
                </div>
              ) : (
                <>
                  {/* Summary card */}
                  <div className="space-y-2 p-3 rounded-xl bg-muted/50 text-sm">
                    <Row label="Amount" value={formatUGX(creditLimit)} bold />
                    <Row label="Duration" value={`${durationDays} days`} />
                    <Row label="Frequency" value={frequency} />
                    <Row label="Platform Fee" value={formatUGX(repayment.platformFee)} highlight />
                    <Separator />
                    <Row label="Total Repayment" value={formatUGX(repayment.totalRepayment)} bold />
                    <Row label={`Per ${frequency === 'daily' ? 'Day' : frequency === 'weekly' ? 'Week' : 'Month'}`} value={formatUGX(frequencyAmount)} bold highlight />
                  </div>

                  {/* Verification summary */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-muted/50 text-xs">
                    <p className="font-bold text-sm">Verification Info</p>
                    <p>📱 Your Phone: <strong>{borrowerPhone}</strong></p>
                    <p>💳 MM Name: <strong>{borrowerMmName}</strong></p>
                    <p>🏠 Landlord: <strong>{landlordName}</strong> ({landlordPhone})</p>
                    {electricityMeter && <p>⚡ UMEME: <strong>{electricityMeter}</strong></p>}
                    {waterMeter && <p>💧 NWSC: <strong>{waterMeter}</strong></p>}
                    {locationAddress && <p>📍 Location: <strong>{locationAddress}</strong></p>}
                  </div>

                  <p className="text-[10px] text-muted-foreground text-center">
                    By submitting, you agree that an agent will visit to verify these details.
                    Funders may add their own interest on top of the 5% platform fee.
                  </p>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { hapticTap(); setStep('details'); }} className="flex-1 gap-1 rounded-xl h-11">
                      <ArrowLeft className="h-4 w-4" /> Edit
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="flex-1 gap-2 rounded-xl h-12 font-bold bg-green-600 hover:bg-green-700 text-white"
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Submit Request</>}
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-xs ${bold ? 'font-bold' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`text-xs ${bold ? 'font-bold' : ''} ${highlight ? 'text-primary' : ''}`}>{value}</span>
    </div>
  );
}

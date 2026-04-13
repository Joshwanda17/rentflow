import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, ArrowRight, ArrowLeft, Check, Share2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatUGX } from '@/lib/rentCalculations';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { generatePromissoryNotePDF } from '@/lib/promissoryNotePdf';

interface PromissoryNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'details' | 'schedule' | 'review';

export function PromissoryNoteDialog({ open, onOpenChange }: PromissoryNoteDialogProps) {
  const [step, setStep] = useState<Step>('details');
  const [submitting, setSubmitting] = useState(false);
  const [createdNote, setCreatedNote] = useState<any>(null);

  // Form fields
  const [partnerName, setPartnerName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [contributionType, setContributionType] = useState<'monthly' | 'once_off'>('once_off');
  const [deductionDay, setDeductionDay] = useState('1');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setStep('details');
    setPartnerName('');
    setWhatsappNumber('');
    setPhoneNumber('');
    setEmail('');
    setAmount('');
    setContributionType('once_off');
    setDeductionDay('1');
    setNotes('');
    setCreatedNote(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) resetForm();
    onOpenChange(v);
  };

  const canProceedDetails = partnerName.trim().length >= 2 && whatsappNumber.trim().length >= 10 && Number(amount) > 0;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const payload: any = {
        agent_id: user.id,
        partner_name: partnerName.trim(),
        whatsapp_number: whatsappNumber.trim(),
        phone_number: phoneNumber.trim() || null,
        email: email.trim() || null,
        amount: Number(amount),
        contribution_type: contributionType,
        notes: notes.trim() || null,
      };

      if (contributionType === 'monthly') {
        payload.deduction_day = Number(deductionDay);
        // Set next deduction date to the next occurrence of this day
        const now = new Date();
        const nextDate = new Date(now.getFullYear(), now.getMonth(), Number(deductionDay));
        if (nextDate <= now) nextDate.setMonth(nextDate.getMonth() + 1);
        payload.next_deduction_date = nextDate.toISOString().split('T')[0];
      }

      const { data, error } = await supabase
        .from('promissory_notes')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      setCreatedNote(data);
      toast.success('Promissory note created successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create note');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSharePDF = async () => {
    if (!createdNote) return;
    try {
      toast.info('Generating PDF...');
      const activationLink = `${getPublicOrigin()}/activate?token=${createdNote.activation_token}`;
      const pdfBlob = await generatePromissoryNotePDF({
        partnerName,
        amount: Number(amount),
        contributionType,
        deductionDay: contributionType === 'monthly' ? Number(deductionDay) : undefined,
        activationLink,
        createdAt: createdNote.created_at,
      });

      const file = new File([pdfBlob], `Welile_Promissory_Note_${partnerName.replace(/\s+/g, '_')}.pdf`, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: 'Welile Investment Promissory Note',
          text: `🤝 Hi ${partnerName}, here is your Welile Investment Promissory Note. Activate your account and start earning 15% returns!`,
          files: [file],
        });
      } else {
        // Fallback: download
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('PDF downloaded!');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        toast.error('Failed to generate PDF');
      }
    }
  };

  const handleShareLink = async () => {
    if (!createdNote) return;
    const activationLink = `${getPublicOrigin()}/activate?token=${createdNote.activation_token}`;
    const shareText = `🤝 Hi ${partnerName}, activate your Welile investment account and start earning 15% ROI! ${activationLink}`;
    if (navigator.share) {
      navigator.share({ title: 'Welile Investment', text: shareText, url: activationLink }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(activationLink);
      toast.success('Activation link copied!');
    }
  };

  const steps: { key: Step; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'review', label: 'Review' },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent stable className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {createdNote ? 'Note Created!' : 'Promissory Note'}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        {!createdNote && (
          <div className="flex items-center justify-center gap-2 py-2">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <div className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold',
                  step === s.key ? 'bg-primary text-primary-foreground' :
                  steps.findIndex(x => x.key === step) > i ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                )}>
                  {steps.findIndex(x => x.key === step) > i ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                {i < steps.length - 1 && <div className="w-6 h-0.5 bg-muted" />}
              </div>
            ))}
          </div>
        )}

        {/* Success state */}
        {createdNote ? (
          <div className="space-y-4">
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center space-y-2">
              <div className="text-3xl">🎉</div>
              <p className="text-sm font-medium">Promissory note for <span className="text-primary">{partnerName}</span> created!</p>
              <p className="text-lg font-bold text-primary">{formatUGX(Number(amount))}</p>
              <p className="text-xs text-muted-foreground">
                {contributionType === 'monthly' ? `Monthly on day ${deductionDay}` : 'Once-off payment'}
              </p>
            </div>

            <div className="grid gap-2">
              <Button onClick={handleSharePDF} className="gap-2 bg-primary hover:bg-primary/90">
                <FileText className="h-4 w-4" />
                Share Branded PDF
              </Button>
              <Button variant="outline" onClick={handleShareLink} className="gap-2">
                <Share2 className="h-4 w-4" />
                Share Activation Link
              </Button>
              <Button variant="ghost" onClick={() => handleClose(false)} className="text-xs">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Step 1: Partner Details */}
            {step === 'details' && (
              <div className="space-y-3">
                <div>
                  <Label>Partner Full Name *</Label>
                  <Input value={partnerName} onChange={e => setPartnerName(e.target.value)} placeholder="e.g. John Mukasa" className="mt-1" />
                </div>
                <div>
                  <Label>WhatsApp Number *</Label>
                  <Input value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="+256..." type="tel" className="mt-1" />
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <Input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+256..." type="tel" className="mt-1" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" type="email" className="mt-1" />
                </div>
                <div>
                  <Label>Promised Amount (UGX) *</Label>
                  <Input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 500000" type="text" inputMode="numeric" className="mt-1" />
                  {Number(amount) > 0 && (
                    <p className="text-xs text-primary mt-1 font-medium">{formatUGX(Number(amount))}</p>
                  )}
                </div>
                <Button onClick={() => setStep('schedule')} disabled={!canProceedDetails} className="w-full gap-2">
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Step 2: Schedule */}
            {step === 'schedule' && (
              <div className="space-y-3">
                <div>
                  <Label>Contribution Type *</Label>
                  <Select value={contributionType} onValueChange={(v: 'monthly' | 'once_off') => setContributionType(v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once_off">Once-off Payment</SelectItem>
                      <SelectItem value="monthly">Monthly Contribution</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {contributionType === 'monthly' && (
                  <div>
                    <Label>Deduction Day of Month *</Label>
                    <Select value={deductionDay} onValueChange={setDeductionDay}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 28 }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>
                            Day {i + 1}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Auto-deduction will run on this day each month when the partner has sufficient wallet balance.
                    </p>
                  </div>
                )}

                <div>
                  <Label>Notes (optional)</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional details about this commitment..." className="mt-1" rows={3} />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('details')} className="gap-2">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button onClick={() => setStep('review')} className="flex-1 gap-2">
                    Review <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Review & Submit */}
            {step === 'review' && (
              <div className="space-y-3">
                <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Partner</span>
                    <span className="font-medium">{partnerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">WhatsApp</span>
                    <span className="font-medium">{whatsappNumber}</span>
                  </div>
                  {phoneNumber && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phone</span>
                      <span className="font-medium">{phoneNumber}</span>
                    </div>
                  )}
                  {email && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email</span>
                      <span className="font-medium">{email}</span>
                    </div>
                  )}
                  <hr className="border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-bold text-primary">{formatUGX(Number(amount))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">{contributionType === 'monthly' ? `Monthly (Day ${deductionDay})` : 'Once-off'}</span>
                  </div>
                  {contributionType === 'monthly' && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ROI (15%/month)</span>
                      <span className="font-medium text-emerald-600">{formatUGX(Number(amount) * 0.15)}/mo</span>
                    </div>
                  )}
                  {notes && (
                    <>
                      <hr className="border-border" />
                      <p className="text-xs text-muted-foreground">{notes}</p>
                    </>
                  )}
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-center">
                  <p>This promissory note will be sent to <strong>Partner Operations</strong> for tracking.</p>
                  <p className="mt-1">A branded PDF and activation link will be generated for sharing.</p>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('schedule')} className="gap-2">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button onClick={handleSubmit} disabled={submitting} className="flex-1 gap-2">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Submit Note
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

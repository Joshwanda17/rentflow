import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Check, Share2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { generatePromissoryNotePDF } from '@/lib/promissoryNotePdf';

interface PromissoryNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PromissoryNoteDialog({ open, onOpenChange }: PromissoryNoteDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [createdNote, setCreatedNote] = useState<any>(null);

  const [partnerName, setPartnerName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [contributionType, setContributionType] = useState<'monthly' | 'once_off'>('once_off');
  const [deductionDay, setDeductionDay] = useState('1');

  const resetForm = () => {
    setPartnerName('');
    setWhatsappNumber('');
    setPhoneNumber('');
    setEmail('');
    setAmount('');
    setContributionType('once_off');
    setDeductionDay('1');
    setCreatedNote(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) resetForm();
    onOpenChange(v);
  };

  const isValid = partnerName.trim().length >= 2 && whatsappNumber.trim().length >= 10 && Number(amount) > 0;

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
      };

      if (contributionType === 'monthly') {
        payload.deduction_day = Number(deductionDay);
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
      toast.success('Promissory note created!');
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

      const file = new File([pdfBlob], `Welile_Note_${partnerName.replace(/\s+/g, '_')}.pdf`, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: 'Welile Investment Promissory Note',
          text: `🤝 Hi ${partnerName}, here is your Welile Investment Promissory Note. Activate your account and start earning 15% returns!`,
          files: [file],
        });
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('PDF downloaded!');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') toast.error('Failed to generate PDF');
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

  const parsedAmount = Number(amount) || 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent stable className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {createdNote ? 'Note Created!' : 'Quick Promissory Note'}
          </DialogTitle>
        </DialogHeader>

        {createdNote ? (
          <div className="space-y-4">
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center space-y-2">
              <div className="text-3xl">🎉</div>
              <p className="text-sm font-medium">Note for <span className="text-primary">{partnerName}</span> created!</p>
              <p className="text-lg font-bold text-primary">{formatUGX(parsedAmount)}</p>
              <p className="text-xs text-muted-foreground">
                {contributionType === 'monthly' ? `Monthly on day ${deductionDay}` : 'Once-off'} · Your commission: <span className="text-primary font-semibold">{formatUGX(parsedAmount * 0.02)}</span>
              </p>
            </div>
            <div className="grid gap-2">
              <Button onClick={handleSharePDF} className="gap-2 bg-primary hover:bg-primary/90">
                <FileText className="h-4 w-4" /> Share Branded PDF
              </Button>
              <Button variant="outline" onClick={handleShareLink} className="gap-2">
                <Share2 className="h-4 w-4" /> Share Activation Link
              </Button>
              <Button variant="ghost" onClick={() => handleClose(false)} className="text-xs">Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Partner Name *</Label>
              <Input value={partnerName} onChange={e => setPartnerName(e.target.value)} placeholder="Full name" className="mt-0.5 h-9" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">WhatsApp *</Label>
                <Input value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="+256..." type="tel" className="mt-0.5 h-9" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+256..." type="tel" className="mt-0.5 h-9" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" type="email" className="mt-0.5 h-9" />
            </div>

            <div>
              <Label className="text-xs">Promised Amount (UGX) *</Label>
              <Input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 500000" inputMode="numeric" className="mt-0.5 h-9" />
              {parsedAmount > 0 && (
                <div className="flex justify-between mt-1 text-[11px]">
                  <span className="text-primary font-medium">{formatUGX(parsedAmount)}</span>
                  <span className="text-emerald-600 font-medium">Your 2%: {formatUGX(parsedAmount * 0.02)}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Type *</Label>
                <Select value={contributionType} onValueChange={(v: 'monthly' | 'once_off') => setContributionType(v)}>
                  <SelectTrigger className="mt-0.5 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once_off">Once-off</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {contributionType === 'monthly' && (
                <div>
                  <Label className="text-xs">Day of month</Label>
                  <Select value={deductionDay} onValueChange={setDeductionDay}>
                    <SelectTrigger className="mt-0.5 h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>Day {i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Quick earnings preview */}
            {parsedAmount > 0 && (
              <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5 text-[11px] space-y-0.5">
                <div className="font-semibold text-primary text-xs">💰 Earnings Preview</div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Partner earns (15%/mo)</span>
                  <span className="font-medium text-emerald-600">{formatUGX(parsedAmount * 0.15)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Your commission (2%)</span>
                  <span className="font-bold text-primary">{formatUGX(parsedAmount * 0.02)}</span>
                </div>
              </div>
            )}

            <Button onClick={handleSubmit} disabled={!isValid || submitting} className="w-full gap-2">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Create & Share Note
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

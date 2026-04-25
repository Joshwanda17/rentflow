import { useState } from 'react';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CreditCard, ShieldCheck, FileDown, FileJson, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface NfcCardSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'form' | 'submitting' | 'success';

interface CardPayload {
  version: number;
  issuer: string;
  card_id: string;
  user_id: string;
  pinless_limit: number;
  issued_at: string;
  hmac_signature: string;
}

export function NfcCardSetupDialog({ open, onOpenChange }: NfcCardSetupDialogProps) {
  const [step, setStep] = useState<Step>('form');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinlessLimit, setPinlessLimit] = useState('50000');
  const [card, setCard] = useState<CardPayload | null>(null);

  const reset = () => {
    setStep('form');
    setPin('');
    setConfirmPin('');
    setPinlessLimit('50000');
    setCard(null);
  };

  const handleClose = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const handleSubmit = async () => {
    if (!/^\d{4,6}$/.test(pin)) {
      toast.error('PIN must be 4 to 6 digits');
      return;
    }
    if (pin !== confirmPin) {
      toast.error('PINs do not match');
      return;
    }
    const limit = Number(pinlessLimit);
    if (!Number.isFinite(limit) || limit < 0) {
      toast.error('Enter a valid pinless limit');
      return;
    }

    setStep('submitting');
    try {
      const { data, error } = await supabase.functions.invoke('setup-nfc-card', {
        body: { pin, pinless_limit: limit },
      });
      if (error) throw error;
      if (!data?.success || !data?.card) throw new Error('Invalid response');
      setCard(data.card as CardPayload);
      setStep('success');
      toast.success('Card configured successfully');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to setup card');
      setStep('form');
    }
  };

  const downloadJson = () => {
    if (!card) return;
    const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `welile-card-${card.card_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async () => {
    if (!card) return;
    try {
      const qrPayload = JSON.stringify(card);
      const qrDataUrl = await QRCode.toDataURL(qrPayload, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 600,
      });

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('Welile NFC Card', pageWidth / 2, 22, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text('Scan or write this payload to your physical NFC card', pageWidth / 2, 30, { align: 'center' });

      const qrSize = 90;
      doc.addImage(qrDataUrl, 'PNG', (pageWidth - qrSize) / 2, 40, qrSize, qrSize);

      let y = 145;
      doc.setTextColor(0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Card ID', 20, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(card.card_id, 20, y + 5);

      y += 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Pinless Limit', 20, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`UGX ${card.pinless_limit.toLocaleString()}`, 20, y + 5);

      y += 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Issued At', 20, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(new Date(card.issued_at).toLocaleString(), 20, y + 5);

      y += 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('HMAC Signature', 20, y);
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      const sig = card.hmac_signature;
      const sigLines = doc.splitTextToSize(sig, pageWidth - 40);
      doc.text(sigLines, 20, y + 5);

      y += 5 + sigLines.length * 3 + 10;
      doc.setDrawColor(220);
      doc.line(20, y, pageWidth - 20, y);
      y += 6;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        'Keep this document secure. Anyone with this QR code or signature can write a duplicate card.',
        pageWidth / 2,
        y,
        { align: 'center', maxWidth: pageWidth - 40 }
      );

      doc.save(`welile-card-${card.card_id}.pdf`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate PDF');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Setup NFC Card
          </DialogTitle>
          <DialogDescription>
            Configure a contactless card linked to your wallet.
          </DialogDescription>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-3 flex gap-2 text-xs">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-muted-foreground">
                  Your PIN is required for transactions above the pinless limit. We never store your PIN — only a hashed version.
                </p>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="nfc-pin">Card PIN (4–6 digits)</Label>
              <Input
                id="nfc-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nfc-pin-confirm">Confirm PIN</Label>
              <Input
                id="nfc-pin-confirm"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nfc-limit">Pinless Withdrawal Limit (UGX)</Label>
              <Input
                id="nfc-limit"
                type="number"
                min={0}
                step={1000}
                value={pinlessLimit}
                onChange={(e) => setPinlessLimit(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Withdrawals at or below this amount won't require a PIN.
              </p>
            </div>

            <Button onClick={handleSubmit} className="w-full" size="lg">
              Generate Card
            </Button>
          </div>
        )}

        {step === 'submitting' && (
          <div className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Securing your card…</p>
          </div>
        )}

        {step === 'success' && card && (
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center gap-2 py-2">
              <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
              <h3 className="font-bold text-lg">Card Ready</h3>
              <p className="text-xs text-muted-foreground">
                Download the JSON file to write your physical NFC card, and the PDF for your records.
              </p>
            </div>

            <Card className="border-border/60">
              <CardContent className="p-3 space-y-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Card ID</span>
                  <span className="font-mono break-all text-right">{card.card_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pinless Limit</span>
                  <span className="font-semibold">UGX {card.pinless_limit.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Signature</span>
                  <span className="font-mono text-[10px] break-all text-right">…{card.hmac_signature.slice(-12)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={downloadJson} variant="outline" className="gap-2">
                <FileJson className="h-4 w-4" />
                JSON
              </Button>
              <Button onClick={downloadPdf} className="gap-2">
                <FileDown className="h-4 w-4" />
                QR PDF
              </Button>
            </div>

            <Button variant="ghost" className="w-full" onClick={() => handleClose(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
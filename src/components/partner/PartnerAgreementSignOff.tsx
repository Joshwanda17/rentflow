import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { buildPartnerReference } from '@/lib/partnerReference';
import { numberToWords } from '@/lib/numberToWords';
import { generatePartnershipAgreementPDF } from '@/lib/partnershipAgreementPdf';
import AgreementHtmlPreview, { type AgreementPreviewData } from './AgreementHtmlPreview';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Download, Mail, Upload, Phone, Calendar, FileSignature, X, CheckCircle2 } from 'lucide-react';

export interface SignOffPartner {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function PartnerAgreementSignOff({
  open,
  onOpenChange,
  partner,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  partner: SignOffPartner | null;
}) {
  const { toast } = useToast();

  // Editable / confirmable partner fields
  const [amount, setAmount] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [address, setAddress] = useState('');
  const [payoutMode, setPayoutMode] = useState<'bank' | 'momo'>('bank');
  const [bankName, setBankName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [momoProvider, setMomoProvider] = useState('');
  const [momoNumber, setMomoNumber] = useState('');
  const [momoName, setMomoName] = useState('');
  const [kinName, setKinName] = useState('');
  const [kinContact, setKinContact] = useState('');

  // Welile counter-signature fields
  const [repName, setRepName] = useState('');
  const [repPosition, setRepPosition] = useState('');
  const [repContact, setRepContact] = useState('');
  const [agreementDate, setAgreementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [welileSig, setWelileSig] = useState<string | undefined>();
  const [partnerSig, setPartnerSig] = useState<string | undefined>();

  const [loadingDetails, setLoadingDetails] = useState(false);
  const [busy, setBusy] = useState<null | 'download' | 'email'>(null);

  const welileSigInput = useRef<HTMLInputElement>(null);
  const partnerSigInput = useRef<HTMLInputElement>(null);

  // Load whatever we already have on file when the sheet opens.
  useEffect(() => {
    if (!open || !partner) return;
    let cancelled = false;
    setLoadingDetails(true);
    (async () => {
      try {
        const [{ data: prof }, { data: method }] = await Promise.all([
          supabase.from('profiles').select('landmark').eq('id', partner.id).maybeSingle(),
          supabase
            .from('saved_payout_methods')
            .select('*')
            .eq('user_id', partner.id)
            .order('is_default', { ascending: false })
            .order('last_used_at', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (cancelled) return;
        setAddress(prof?.landmark || '');
        if (method) {
          if (method.payout_mode === 'momo') {
            setPayoutMode('momo');
            setMomoProvider(method.momo_provider || '');
            setMomoNumber(method.momo_number || '');
            setMomoName(method.momo_name || '');
          } else {
            setPayoutMode('bank');
            setBankName(method.bank_name || '');
            setBankAccountName(method.bank_account_name || '');
            setBankAccountNumber(method.bank_account_number || '');
          }
        }
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, partner]);

  // Reset volatile sign-off fields whenever a different partner is opened.
  useEffect(() => {
    if (!open) return;
    setAmount('');
    setPartnerId('');
    setKinName('');
    setKinContact('');
    setRepName('');
    setRepPosition('');
    setRepContact('');
    setWelileSig(undefined);
    setPartnerSig(undefined);
    setAgreementDate(new Date().toISOString().slice(0, 10));
  }, [open, partner?.id]);

  const amountNum = Number((amount || '').replace(/,/g, '')) || 0;
  const dateObj = useMemo(() => {
    const d = new Date(agreementDate);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [agreementDate]);

  const previewData: AgreementPreviewData = useMemo(() => ({
    partnerName: partner?.full_name || '',
    partnerId,
    partnerAddress: address,
    partnerPhone: partner?.phone || '',
    partnerEmail: partner?.email || '',
    partnershipAmount: amountNum,
    payoutMode,
    bankName,
    bankAccountName,
    bankAccountNumber,
    momoProvider,
    momoNumber,
    momoName,
    kinName,
    kinContact,
    agreementDate: dateObj,
    welileRepName: repName,
    welileRepPosition: repPosition,
    welileRepContact: repContact,
    welileSignatureDataUrl: welileSig,
    partnerSignatureDataUrl: partnerSig,
  }), [partner, partnerId, address, amountNum, payoutMode, bankName, bankAccountName, bankAccountNumber, momoProvider, momoNumber, momoName, kinName, kinContact, dateObj, repName, repPosition, repContact, welileSig, partnerSig]);

  const buildBlob = () => generatePartnershipAgreementPDF(previewData);

  const validate = (): string | null => {
    if (amountNum < 50000) return 'Enter a valid partnership amount (min UGX 50,000).';
    if (!repName.trim()) return 'Enter the Welile representative name to counter-sign.';
    if (!welileSig) return 'Upload the Welile representative signature.';
    return null;
  };

  const onSig = async (file: File | undefined, set: (v: string) => void) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please upload an image (PNG/JPG).', variant: 'destructive' });
      return;
    }
    try { set(await fileToDataUrl(file)); } catch { /* noop */ }
  };

  const handleDownload = async () => {
    const err = validate();
    if (err) { toast({ title: 'Almost there', description: err, variant: 'destructive' }); return; }
    setBusy('download');
    try {
      const blob = await buildBlob();
      const ref = buildPartnerReference(partner!.id, partner!.created_at);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `partnership-agreement-${ref}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: 'Could not generate PDF', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleSaveEmail = async () => {
    const err = validate();
    if (err) { toast({ title: 'Almost there', description: err, variant: 'destructive' }); return; }
    if (!partner?.email) {
      toast({ title: 'No email on file', description: 'This partner has no email address to send to.', variant: 'destructive' });
      return;
    }
    setBusy('email');
    try {
      const blob = await buildBlob();
      const ref = buildPartnerReference(partner.id, partner.created_at);
      const objectPath = `${partner.id}/partnership-agreement-signed-${ref}.pdf`;
      const { error: upErr } = await supabase.storage
        .from('partner-agreements')
        .upload(objectPath, blob, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from('partner-agreements')
        .createSignedUrl(objectPath, 60 * 60 * 24 * 365);

      const payoutSummary = payoutMode === 'momo'
        ? [momoProvider, momoNumber].filter(Boolean).join(' ') || 'Mobile Money'
        : [bankName, bankAccountNumber].filter(Boolean).join(' ') || 'Bank Transfer';

      const { error: emailErr } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'tenant-partnership-agreement',
          recipientEmail: partner.email,
          templateData: {
            partner_name: partner.full_name || 'Partner',
            partner_email: partner.email,
            partner_reference: ref,
            partnership_amount: `UGX ${amountNum.toLocaleString('en-US')}`,
            partnership_amount_words: numberToWords(amountNum),
            monthly_return: '15%',
            payout_summary: payoutSummary,
            agreement_download_url: signed?.signedUrl || 'https://welilereceipts.com',
            company_name: 'WELILE TECHNOLOGIES LTD',
          },
        },
      });
      if (emailErr) throw emailErr;
      toast({ title: 'Signed agreement sent', description: `Emailed to ${partner.email}.` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Could not send', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  if (!partner) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-6xl w-[97vw] h-[94vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-4 w-4 text-primary" /> Partnership Agreement — Sign-off
          </DialogTitle>
          <DialogDescription className="text-xs">
            Confirm the partner's details, counter-sign on behalf of Welile, then download or email the executed PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[380px_1fr]">
          {/* LEFT — details + sign-off form */}
          <div className="border-r overflow-y-auto p-4 space-y-4 bg-muted/20">
            {/* Partner card */}
            <div className="rounded-xl bg-background border p-3 space-y-1">
              <p className="text-sm font-bold">{partner.full_name || 'Unknown partner'}</p>
              <p className="text-[11px] font-mono text-muted-foreground">
                Ref: {buildPartnerReference(partner.id, partner.created_at)}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{partner.phone || '—'}</span>
                {partner.email && <span className="truncate">{partner.email}</span>}
              </div>
            </div>

            {loadingDetails && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading details on file…
              </p>
            )}

            {/* Partner confirmable details */}
            <section className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Partner details</p>
              <Field label="Partnership amount (UGX)" required>
                <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ''))} placeholder="e.g. 1,500,000" />
              </Field>
              <Field label="National ID / Passport No.">
                <Input value={partnerId} onChange={(e) => setPartnerId(e.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Residential address">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Village / district / landmark" />
              </Field>
            </section>

            <Separator />

            {/* Payout */}
            <section className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Payout channel</p>
              <Select value={payoutMode} onValueChange={(v) => setPayoutMode(v as 'bank' | 'momo')}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank account</SelectItem>
                  <SelectItem value="momo">Mobile money</SelectItem>
                </SelectContent>
              </Select>
              {payoutMode === 'bank' ? (
                <>
                  <Field label="Bank name"><Input value={bankName} onChange={(e) => setBankName(e.target.value)} /></Field>
                  <Field label="Account name"><Input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} /></Field>
                  <Field label="Account number"><Input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} /></Field>
                </>
              ) : (
                <>
                  <Field label="Provider"><Input value={momoProvider} onChange={(e) => setMomoProvider(e.target.value)} placeholder="MTN / Airtel" /></Field>
                  <Field label="Mobile money number"><Input value={momoNumber} onChange={(e) => setMomoNumber(e.target.value)} /></Field>
                  <Field label="Registered name"><Input value={momoName} onChange={(e) => setMomoName(e.target.value)} /></Field>
                </>
              )}
            </section>

            <Separator />

            {/* Next of kin */}
            <section className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Next of kin</p>
              <Field label="Name"><Input value={kinName} onChange={(e) => setKinName(e.target.value)} /></Field>
              <Field label="Contact"><Input value={kinContact} onChange={(e) => setKinContact(e.target.value)} /></Field>
            </section>

            <Separator />

            {/* Welile counter-signature */}
            <section className="space-y-2">
              <p className="text-xs font-semibold text-primary">Sign off — on behalf of Welile</p>
              <Field label="Representative name" required>
                <Input value={repName} onChange={(e) => setRepName(e.target.value)} placeholder="Full name" />
              </Field>
              <Field label="Position">
                <Input value={repPosition} onChange={(e) => setRepPosition(e.target.value)} placeholder="e.g. Chief Operating Officer" />
              </Field>
              <Field label="Contact">
                <Input value={repContact} onChange={(e) => setRepContact(e.target.value)} placeholder="Phone / email" />
              </Field>
              <Field label="Agreement date">
                <div className="relative">
                  <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input type="date" className="pl-7" value={agreementDate} onChange={(e) => setAgreementDate(e.target.value)} />
                </div>
              </Field>

              <SigUpload
                label="Welile signature"
                value={welileSig}
                required
                onPick={() => welileSigInput.current?.click()}
                onClear={() => setWelileSig(undefined)}
              />
              <input ref={welileSigInput} type="file" accept="image/*" className="hidden" onChange={(e) => onSig(e.target.files?.[0], setWelileSig)} />

              <SigUpload
                label="Partner signature (optional)"
                value={partnerSig}
                onPick={() => partnerSigInput.current?.click()}
                onClear={() => setPartnerSig(undefined)}
              />
              <input ref={partnerSigInput} type="file" accept="image/*" className="hidden" onChange={(e) => onSig(e.target.files?.[0], setPartnerSig)} />
            </section>

            <Separator />

            <div className="flex flex-col gap-2 pb-2">
              <Button onClick={handleDownload} disabled={!!busy} variant="outline" className="gap-1.5">
                {busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download signed PDF
              </Button>
              <Button onClick={handleSaveEmail} disabled={!!busy} className="gap-1.5">
                {busy === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Save &amp; email to partner
              </Button>
            </div>
          </div>

          {/* RIGHT — live preview */}
          <div className="overflow-y-auto bg-slate-100 p-3 sm:p-6">
            <div className="mx-auto max-w-[760px] bg-white shadow-lg rounded-sm">
              <AgreementHtmlPreview data={previewData} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}

function SigUpload({
  label, value, required, onPick, onClear,
}: {
  label: string; value?: string; required?: boolean; onPick: () => void; onClear: () => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </Label>
      {value ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-2">
          <img src={value} alt={label} className="h-10 max-w-[120px] object-contain" />
          <CheckCircle2 className="h-4 w-4 text-success" />
          <Button type="button" size="icon" variant="ghost" className="h-6 w-6 ml-auto" onClick={onClear}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={onPick}>
          <Upload className="h-3.5 w-3.5" /> Upload signature image
        </Button>
      )}
    </div>
  );
}
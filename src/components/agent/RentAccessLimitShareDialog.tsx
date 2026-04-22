import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Loader2, MessageCircle, Image as ImageIcon, FileText, Copy, CheckCircle2, ExternalLink,
  ArrowLeft, Eye, ShieldCheck,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { createShortLink } from '@/lib/createShortLink';
import { formatUGX } from '@/lib/rentCalculations';
import type { RentAccessLimitResult } from '@/lib/rentAccessLimit';
import { generateRentAccessLimitPdf, generateRentAccessLimitPng } from '@/lib/rentAccessLimitPdf';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  tenantName: string;
  tenantPhone: string;
  aiId?: string;
  result: RentAccessLimitResult;
}

function toIntlPhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('256')) return digits;
  if (digits.startsWith('0')) return '256' + digits.slice(1);
  return digits;
}

export function RentAccessLimitShareDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  tenantPhone,
  aiId,
  result,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pngLoading, setPngLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewing, setPreviewing] = useState(false);
  // Snapshot of the message at the moment the preview was built, so the send
  // action uses the exact text the user saw — even if shareUrl/result changes.
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);

  // Reset preview whenever the dialog closes / inputs change
  useEffect(() => {
    if (!open) {
      setPreviewing(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewBlob(null);
      setPreviewMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Build the WhatsApp / share short link as soon as the dialog opens
  useEffect(() => {
    if (!open || !user || shareUrl) return;
    let cancelled = false;
    (async () => {
      setLinkLoading(true);
      try {
        const url = await createShortLink(user.id, '/limit', { t: tenantId });
        if (!cancelled) setShareUrl(url);
      } catch {
        // Fallback: direct URL if short-link creation fails
        if (!cancelled) setShareUrl(`${window.location.origin}/limit/${tenantId}`);
      } finally {
        if (!cancelled) setLinkLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, tenantId, shareUrl]);

  const pct = result.netAdjustmentPct * 100;
  const message =
    `🏠 *Welile · Your Rent Access Limit*\n\n` +
    `Hi ${tenantName.split(' ')[0]}, your current rent access limit is:\n` +
    `*${formatUGX(result.limit)}*\n\n` +
    `📈 ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% from your daily payments\n` +
    `✅ On-time days: ${result.paidDays}\n` +
    `⚠️ Missed days: ${result.missedDays}\n\n` +
    `Pay today and earn *+${formatUGX(Math.abs(result.todayChange))}* more access tomorrow.\n` +
    (shareUrl ? `\nView live: ${shareUrl}` : '');

  const openWhatsApp = () => {
    const intl = toIntlPhone(tenantPhone);
    const url = intl
      ? `https://wa.me/${intl}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  /** Step 1 — generate the card image and show preview. */
  const buildPreview = async () => {
    setPngLoading(true);
    try {
      const blob = await generateRentAccessLimitPng({
        tenantName,
        tenantPhone,
        aiId,
        monthlyRent: result.base / 12,
        result,
        shareUrl,
      });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
      setPreviewMessage(message);
      setPreviewing(true);
    } catch (err: any) {
      toast({ title: 'Preview failed', description: err.message, variant: 'destructive' });
    } finally {
      setPngLoading(false);
    }
  };

  /** Step 2 — user confirmed the preview, actually send to WhatsApp. */
  const confirmAndShare = async () => {
    if (!previewBlob || !previewMessage) return;
    const file = new File(
      [previewBlob],
      `rent-access-${tenantName.replace(/\s+/g, '-').toLowerCase()}.png`,
      { type: 'image/png' },
    );
    const navAny = navigator as any;
    if (navAny.canShare && navAny.canShare({ files: [file] })) {
      try {
        await navAny.share({
          files: [file],
          title: 'Rent Access Limit',
          text: previewMessage,
        });
        toast({ title: 'Ready to share' });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        // fall through to download + WhatsApp web fallback
      }
    }
    // Fallback: download the image and open WhatsApp chat with the prefilled text
    const url = URL.createObjectURL(previewBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    // Open WhatsApp using the SNAPSHOT message (not the live `message`),
    // so the text matches exactly what the agent confirmed in the preview.
    const intl = toIntlPhone(tenantPhone);
    const waUrl = intl
      ? `https://wa.me/${intl}?text=${encodeURIComponent(previewMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(previewMessage)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    toast({
      title: 'Image saved',
      description: 'Attach it in the WhatsApp chat that just opened.',
    });
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const downloadPng = async () => {
    setPngLoading(true);
    try {
      const blob = await generateRentAccessLimitPng({
        tenantName,
        tenantPhone,
        aiId,
        monthlyRent: result.base / 12,
        result,
        shareUrl,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rent-access-${tenantName.replace(/\s+/g, '-').toLowerCase()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast({ title: 'Image saved', description: 'Share it on WhatsApp from your gallery.' });
    } catch (err: any) {
      toast({ title: 'Image generation failed', description: err.message, variant: 'destructive' });
    } finally {
      setPngLoading(false);
    }
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const blob = await generateRentAccessLimitPdf({
        tenantName,
        tenantPhone,
        aiId,
        monthlyRent: result.base / 12,
        result,
        shareUrl,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rent-access-certificate-${tenantName.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast({ title: 'Certificate downloaded' });
    } catch (err: any) {
      toast({ title: 'PDF generation failed', description: err.message, variant: 'destructive' });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {previewing && (
              <button
                type="button"
                onClick={() => setPreviewing(false)}
                className="h-7 w-7 -ml-1 rounded-md hover:bg-muted flex items-center justify-center"
                aria-label="Back to share options"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            {previewing ? 'Preview before sending' : 'Share Rent Access Limit'}
          </DialogTitle>
          <DialogDescription>
            {previewing
              ? `Confirm the card and message for ${tenantName.split(' ')[0]} look right.`
              : `Send ${tenantName.split(' ')[0]} their current limit and motivate daily payments.`}
          </DialogDescription>
        </DialogHeader>

        {previewing && previewUrl ? (
          <>
            {/* Image preview */}
            <div className="rounded-xl border bg-muted/30 p-2 flex items-center justify-center">
              <img
                src={previewUrl}
                alt="Rent access limit card preview"
                className="max-h-64 w-auto rounded-lg shadow-sm"
              />
            </div>
            {/* Message preview */}
            <div className="rounded-xl border bg-muted/40 p-3 text-xs whitespace-pre-line max-h-40 overflow-y-auto">
              {previewMessage ?? message}
            </div>

            {/* Snapshot indicator — proves the send action will use this exact text */}
            <div
              className="flex items-center gap-1.5 text-[11px] text-success font-medium"
              role="status"
              aria-live="polite"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {previewMessage
                ? 'Uses preview snapshot — sent text will match exactly'
                : 'Locking snapshot…'}
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Button
                onClick={confirmAndShare}
                disabled={!previewMessage || !previewBlob}
                className="h-12 rounded-xl gap-2 font-bold bg-success hover:bg-success/90 text-success-foreground"
                size="lg"
              >
                <MessageCircle className="h-5 w-5" /> Looks good — send on WhatsApp
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPreviewing(false)}
                  className="h-11 rounded-xl gap-2"
                >
                  <ArrowLeft className="h-4 w-4" /> Edit
                </Button>
                <Button
                  variant="outline"
                  onClick={copyMessage}
                  className="h-11 rounded-xl gap-2"
                >
                  {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  Copy text
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Message preview */}
            <div className="rounded-xl border bg-muted/40 p-3 text-xs whitespace-pre-line max-h-40 overflow-y-auto">
              {message}
            </div>

            {/* Link row */}
            <div className="flex items-center gap-2 rounded-xl bg-background border p-2.5 text-xs">
          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate flex-1 font-mono text-muted-foreground">
            {linkLoading ? 'Generating link…' : shareUrl ?? '—'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={copyMessage}
            disabled={!shareUrl}
            aria-label="Copy message with link"
          >
            {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </Button>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 gap-2">
              <Button
                onClick={buildPreview}
                disabled={pngLoading}
                className="h-12 rounded-xl gap-2 font-bold bg-success hover:bg-success/90 text-success-foreground"
                size="lg"
              >
                {pngLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Eye className="h-5 w-5" />}
                {pngLoading ? 'Preparing preview…' : 'Preview & send on WhatsApp'}
              </Button>
              <Button
                variant="outline"
                onClick={openWhatsApp}
                className="h-11 rounded-xl gap-2"
              >
                <MessageCircle className="h-4 w-4" /> Send text only
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={downloadPng}
                  disabled={pngLoading}
                  className="h-11 rounded-xl gap-2"
                >
                  {pngLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                  Save image
                </Button>
                <Button
                  variant="outline"
                  onClick={downloadPdf}
                  disabled={pdfLoading}
                  className="h-11 rounded-xl gap-2"
                >
                  {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  PDF
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, MessageCircle, Image as ImageIcon, FileText, Copy, CheckCircle2, ExternalLink } from 'lucide-react';
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

  /** One-tap: generate the card image AND open WhatsApp with the message. */
  const shareCardOnWhatsApp = async () => {
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
      const file = new File([blob], `rent-access-${tenantName.replace(/\s+/g, '-').toLowerCase()}.png`, {
        type: 'image/png',
      });
      // Prefer native share with the file attached (mobile WhatsApp picks this up directly)
      const navAny = navigator as any;
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        try {
          await navAny.share({
            files: [file],
            title: 'Rent Access Limit',
            text: message,
          });
          toast({ title: 'Ready to share' });
          return;
        } catch (err: any) {
          if (err?.name === 'AbortError') return;
          // fall through to download + WhatsApp web fallback
        }
      }
      // Fallback: download the image and open WhatsApp chat with the prefilled text
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      openWhatsApp();
      toast({
        title: 'Image saved',
        description: 'Attach it in the WhatsApp chat that just opened.',
      });
    } catch (err: any) {
      toast({ title: 'Share failed', description: err.message, variant: 'destructive' });
    } finally {
      setPngLoading(false);
    }
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
          <DialogTitle>Share Rent Access Limit</DialogTitle>
          <DialogDescription>
            Send {tenantName.split(' ')[0]} their current limit and motivate daily payments.
          </DialogDescription>
        </DialogHeader>

        {/* Preview snippet */}
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
            onClick={shareCardOnWhatsApp}
            disabled={pngLoading}
            className="h-12 rounded-xl gap-2 font-bold bg-success hover:bg-success/90 text-success-foreground"
            size="lg"
          >
            {pngLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageCircle className="h-5 w-5" />}
            {pngLoading ? 'Preparing card…' : 'Share card on WhatsApp'}
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
      </DialogContent>
    </Dialog>
  );
}

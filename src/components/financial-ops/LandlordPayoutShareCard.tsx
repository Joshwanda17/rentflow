import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, MessageCircle, Share2, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export interface LandlordPayoutShareData {
  amount: number;
  landlord_name: string;
  landlord_phone: string;
  mobile_money_provider: string;
  tenant_name: string | null;
  agent_name: string | null;
  agent_phone: string | null;
  momo_reference: string;
  paid_at: string; // ISO
}

function formatUGX(n: number) {
  return `UGX ${Number(n).toLocaleString()}`;
}

function formatWhatsAppNumber(phone: string): string {
  let cleaned = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('0')) cleaned = '256' + cleaned.slice(1);
  else if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
  return cleaned;
}

function buildAgentMessage(d: LandlordPayoutShareData): string {
  const lines = [
    `✅ *Welile — Landlord Paid*`,
    ``,
    `*${formatUGX(d.amount)}* sent to *${d.landlord_name}*`,
    `📱 ${d.mobile_money_provider}: ${d.landlord_phone}`,
    `🏠 Tenant: ${d.tenant_name || 'Unallocated'}`,
    `🧾 MoMo TID: ${d.momo_reference}`,
    `🕒 ${new Date(d.paid_at).toLocaleString('en-UG')}`,
    ``,
    `Please confirm with the landlord and upload the receipt in your Welile app.`,
  ];
  return lines.join('\n');
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: LandlordPayoutShareData | null;
}

export function LandlordPayoutShareCard({ open, onOpenChange, data }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<'png' | 'share' | null>(null);

  if (!data) return null;

  const renderImage = async () => {
    if (!cardRef.current) return null;
    const { toPng } = await import('html-to-image');
    return toPng(cardRef.current, { pixelRatio: 2, cacheBust: true, skipFonts: true });
  };

  const handleDownload = async () => {
    setBusy('png');
    try {
      const dataUrl = await renderImage();
      if (!dataUrl) return;
      const link = document.createElement('a');
      link.download = `welile-landlord-payout-${data.momo_reference}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Card downloaded');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to download card');
    } finally {
      setBusy(null);
    }
  };

  const handleNativeShare = async () => {
    setBusy('share');
    try {
      const dataUrl = await renderImage();
      if (!dataUrl) return;
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `welile-landlord-payout-${data.momo_reference}.png`, {
        type: 'image/png',
      });
      const text = buildAgentMessage(data);
      const nav = navigator as any;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text, title: 'Welile — Landlord Paid' });
        toast.success('Shared');
      } else {
        // Fallback: download + open WhatsApp with text
        const link = document.createElement('a');
        link.download = file.name;
        link.href = dataUrl;
        link.click();
        openWhatsAppText();
        toast.message('Image downloaded — attach it in WhatsApp');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(e?.message ?? 'Failed to share');
    } finally {
      setBusy(null);
    }
  };

  const openWhatsAppText = () => {
    const text = encodeURIComponent(buildAgentMessage(data));
    const phone = data.agent_phone ? formatWhatsAppNumber(data.agent_phone) : '';
    const base = phone ? `https://wa.me/${phone}` : `https://wa.me/`;
    window.open(`${base}?text=${text}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share payout with agent</DialogTitle>
          <DialogDescription>
            Send the agent a confirmation card on WhatsApp. Best results: tap "Share to WhatsApp" on mobile to attach the image directly.
          </DialogDescription>
        </DialogHeader>

        {/* Purple gradient card */}
        <div
          ref={cardRef}
          className="rounded-2xl p-5 text-white shadow-xl relative overflow-hidden"
          style={{
            background:
              'linear-gradient(135deg, #3d0066 0%, #7A00CC 55%, #1a0033 100%)',
          }}
        >
          <div
            aria-hidden
            className="absolute -top-10 -right-10 h-40 w-40 rounded-full"
            style={{ background: 'rgba(196,128,255,0.35)', filter: 'blur(30px)' }}
          />
          <div
            aria-hidden
            className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full"
            style={{ background: 'rgba(122,0,204,0.45)', filter: 'blur(40px)' }}
          />

          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] tracking-[0.2em] uppercase text-purple-200">
                  Welile · Landlord Paid
                </p>
                <p className="text-xs text-purple-100/80 mt-0.5">
                  {new Date(data.paid_at).toLocaleString('en-UG')}
                </p>
              </div>
              <div className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-purple-200">Amount sent</p>
              <p className="text-3xl font-bold leading-tight">{formatUGX(data.amount)}</p>
            </div>

            <div className="rounded-xl bg-white/10 border border-white/15 p-3 space-y-2 backdrop-blur-sm">
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-purple-200">Landlord</span>
                <span className="font-semibold text-right truncate">{data.landlord_name}</span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-purple-200">{data.mobile_money_provider}</span>
                <span className="font-mono font-semibold">{data.landlord_phone}</span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-purple-200">Tenant</span>
                <span className="font-semibold text-right truncate">
                  {data.tenant_name || 'Unallocated'}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-purple-200">MoMo TID</span>
                <span className="font-mono font-semibold text-right break-all">
                  {data.momo_reference}
                </span>
              </div>
              {data.agent_name && (
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-purple-200">Agent</span>
                  <span className="font-semibold text-right truncate">{data.agent_name}</span>
                </div>
              )}
            </div>

            <p className="text-[10px] text-purple-200/80 text-center pt-1">
              Powered by Welile · welilereceipts.com
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={handleNativeShare} disabled={busy !== null} className="gap-2">
            {busy === 'share' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Share to WhatsApp
          </Button>
          <Button onClick={handleDownload} variant="outline" disabled={busy !== null} className="gap-2">
            {busy === 'png' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PNG
          </Button>
        </div>
        <Button
          onClick={openWhatsAppText}
          variant="outline"
          className="w-full gap-2 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
        >
          <MessageCircle className="h-4 w-4" />
          Open WhatsApp chat{data.agent_phone ? ` · ${data.agent_phone}` : ''}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

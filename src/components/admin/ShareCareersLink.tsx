import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Share2, Copy, Check, MessageCircle, Facebook, Linkedin, Send, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { getPublicOrigin } from '@/lib/getPublicOrigin';

/**
 * Lets the person managing the Company Staff dashboard quickly share the
 * public careers / job application link to any platform so people can sign
 * up and apply.
 */
export default function ShareCareersLink() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = `${getPublicOrigin()}/careers`;
  const shareTitle = 'Join the Welile team — apply now';
  const shareText = `We're hiring at Welile! Apply for open roles (developers, sales, marketing, operations & more) and sign up here: ${shareUrl}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Careers link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        return;
      } catch {
        /* user cancelled or unsupported — fall through to dialog */
      }
    }
    setOpen(true);
  };

  const platforms = [
    {
      label: 'WhatsApp',
      icon: MessageCircle,
      color: 'text-green-600',
      href: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
    },
    {
      label: 'Facebook',
      icon: Facebook,
      color: 'text-blue-600',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    },
    {
      label: 'X (Twitter)',
      icon: Send,
      color: 'text-foreground',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
    },
    {
      label: 'LinkedIn',
      icon: Linkedin,
      color: 'text-sky-700',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
    },
    {
      label: 'Telegram',
      icon: Send,
      color: 'text-sky-500',
      href: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
    },
    {
      label: 'Email',
      icon: Mail,
      color: 'text-muted-foreground',
      href: `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareText)}`,
    },
  ];

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleNativeShare} className="gap-1.5 h-9">
        <Share2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Share Careers</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-primary" />
              Share Careers Link
            </DialogTitle>
            <DialogDescription>
              Share this link on any platform so people can sign up and apply for open roles.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input readOnly value={shareUrl} className="text-xs font-mono bg-muted/50 select-all" onFocus={(e) => e.target.select()} />
              <Button size="icon" variant={copied ? 'default' : 'outline'} onClick={handleCopy} className="shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {platforms.map((p) => (
                <a
                  key={p.label}
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 hover:bg-muted/50 transition-colors"
                >
                  <p.icon className={`h-5 w-5 ${p.color}`} />
                  <span className="text-[11px] font-medium text-foreground text-center leading-tight">{p.label}</span>
                </a>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
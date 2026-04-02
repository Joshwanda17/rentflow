import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { UserPlus, Copy, Share2, Check } from 'lucide-react';
import { toast } from 'sonner';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ShareSupporterRecruit() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: userId } = useQuery({
    queryKey: ['current-user-id'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id ?? null;
    },
    staleTime: Infinity,
  });

  // Build sanitized link — role is hardcoded, ref validated as UUID
  const buildLink = (): string | null => {
    if (!userId || !UUID_RE.test(userId)) return null;
    const params = new URLSearchParams();
    params.set('role', 'supporter');
    params.set('ref', userId);
    return `${window.location.origin}/auth?${params.toString()}`;
  };

  const shareUrl = buildLink();

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleShare = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join as a Supporter',
          text: 'Sign up as a Supporter on Welile',
          url: shareUrl,
        });
      } catch {
        // user cancelled
      }
    } else {
      // Fallback: WhatsApp
      const waUrl = `https://wa.me/?text=${encodeURIComponent(`Join as a Supporter on Welile: ${shareUrl}`)}`;
      window.open(waUrl, '_blank');
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Recruit Supporter
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent stable className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              Recruit a Supporter
            </DialogTitle>
            <DialogDescription>
              Share this link to register new users as Supporters under your referral. Only the Supporter role will be assigned.
            </DialogDescription>
          </DialogHeader>

          {shareUrl ? (
            <div className="space-y-3">
              <Input
                readOnly
                value={shareUrl}
                className="text-xs font-mono bg-muted/50 select-all"
                onFocus={(e) => e.target.select()}
              />
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-1.5"
                  size="sm"
                  onClick={handleCopy}
                  variant={copied ? 'default' : 'outline'}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy Link'}
                </Button>
                <Button
                  className="flex-1 gap-1.5"
                  size="sm"
                  onClick={handleShare}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Share
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center leading-tight">
                New users who sign up via this link will be registered as Supporters under your referral.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

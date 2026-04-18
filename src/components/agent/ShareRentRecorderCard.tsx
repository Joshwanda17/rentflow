import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useShortLink } from '@/hooks/useShortLink';
import { Button } from '@/components/ui/button';
import { MessageCircle, Copy, Check, ClipboardList, TrendingUp, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { hapticTap } from '@/lib/haptics';

/**
 * Prominent agent-dashboard card.
 * Shares a public, no-login rent-history recorder link via WhatsApp.
 * Anyone tapping the link can record their last 12 months of rent — no signup.
 */
export function ShareRentRecorderCard() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [submissionCount, setSubmissionCount] = useState<number | null>(null);

  const { shortUrl, isLoading } = useShortLink({
    targetPath: '/record-rent',
    targetParams: { a: user?.id || '' },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from('public_rent_history_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', user.id);
      if (!cancelled) setSubmissionCount(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const link = shortUrl;

  const message = `🏠 Record your rent. Unlock cash later.

Hi 👋 — I'm a Welile agent. If you've been paying rent, you can qualify for a *rent advance* (cash to cover rent when money is tight).

✨ No signup needed
✨ Takes 1 minute
✨ Just tap and tell us the months you paid

👉 Tap here:
${link}

The more months you record, the bigger your limit. 💰`;

  const handleWhatsApp = () => {
    if (!link) return;
    hapticTap();
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleCopy = async () => {
    if (!link) return;
    hapticTap();
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('Link copied — paste it anywhere!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (!link) return;
    hapticTap();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Record your rent — Welile', text: message, url: link });
        return;
      } catch {
        /* fall through */
      }
    }
    handleWhatsApp();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border-2 border-success/40 bg-gradient-to-br from-success/10 via-background to-primary/5 p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-success to-success/70 text-success-foreground shadow-md shrink-0">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-extrabold text-base leading-tight">Send rent recorder</h3>
            <span className="text-[10px] uppercase font-bold tracking-wider bg-success/20 text-success px-2 py-0.5 rounded-full">
              No signup
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-snug">
            Share on WhatsApp. Anyone taps it, records their rent, qualifies for advances. You earn from every active tenant.
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Records in" value={submissionCount === null ? '—' : String(submissionCount)} />
        <Stat label="Per record" value="UGX 500" tone="success" />
        <Stat label="Tap to send" value="📲" />
      </div>

      {/* Big WhatsApp CTA */}
      <Button
        onClick={handleWhatsApp}
        disabled={!link || isLoading}
        className="mt-3 w-full h-14 gap-2 bg-[#25D366] hover:bg-[#1fb855] text-white text-base font-extrabold rounded-xl shadow-md"
      >
        <MessageCircle className="h-5 w-5" />
        Share on WhatsApp
      </Button>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button onClick={handleCopy} variant="outline" disabled={!link} className="h-11 gap-2 text-xs font-bold">
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <Button onClick={handleNativeShare} variant="outline" disabled={!link} className="h-11 gap-2 text-xs font-bold">
          <TrendingUp className="h-4 w-4" />
          More apps
        </Button>
      </div>

      {link && (
        <p className="mt-2 text-[10px] text-center font-mono text-muted-foreground break-all">{link}</p>
      )}

      <div className="mt-3 flex items-start gap-2 rounded-xl bg-primary/5 border border-primary/15 p-2.5">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-foreground/80 leading-snug">
          <span className="font-bold">Pro tip:</span> Send to WhatsApp groups & status. Every verified record raises your team's collection volume.
        </p>
      </div>
    </motion.div>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' }) {
  return (
    <div
      className={`rounded-lg p-2 text-center border ${
        tone === 'success' ? 'bg-success/10 border-success/30' : 'bg-muted/30 border-border'
      }`}
    >
      <p className={`text-base font-extrabold leading-none ${tone === 'success' ? 'text-success' : 'text-foreground'}`}>
        {value}
      </p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1 font-bold">{label}</p>
    </div>
  );
}

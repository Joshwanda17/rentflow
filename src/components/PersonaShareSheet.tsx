import { useState } from 'react';
import { Share2, Copy, ExternalLink, Check, Home, Briefcase, Building2, HandCoins, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { PERSONA_SLUGS, type PersonaSlug } from '@/lib/roleRoutes';
import { cn } from '@/lib/utils';

const PERSONA_META: Record<PersonaSlug, { label: string; tagline: string; Icon: typeof Home; accent: string }> = {
  '/dashboard/tenant': {
    label: 'Tenant',
    tagline: 'Pay rent, build trust, unlock support',
    Icon: Home,
    accent: 'from-blue-500/20 to-blue-500/5 text-blue-600 dark:text-blue-400',
  },
  '/dashboard/agent': {
    label: 'Agent',
    tagline: 'Onboard tenants, earn commission',
    Icon: Briefcase,
    accent: 'from-emerald-500/20 to-emerald-500/5 text-emerald-600 dark:text-emerald-400',
  },
  '/dashboard/landlord': {
    label: 'Landlord',
    tagline: 'Track properties and on-time payouts',
    Icon: Building2,
    accent: 'from-amber-500/20 to-amber-500/5 text-amber-600 dark:text-amber-400',
  },
  '/dashboard/funder': {
    label: 'Funder',
    tagline: 'Fund rent pools, earn monthly returns',
    Icon: HandCoins,
    accent: 'from-violet-500/20 to-violet-500/5 text-violet-600 dark:text-violet-400',
  },
  '/dashboard/manager': {
    label: 'Manager',
    tagline: 'Operations and oversight tools',
    Icon: ShieldCheck,
    accent: 'from-rose-500/20 to-rose-500/5 text-rose-600 dark:text-rose-400',
  },
};

interface PersonaShareSheetProps {
  /** Used to highlight the current persona row. Defaults to no highlight. */
  currentSlug?: PersonaSlug | null;
  /** Optional override for the shareable origin (defaults to window.location.origin). */
  origin?: string;
}

/**
 * Floating share button + sheet that lists the canonical
 * `/dashboard/{role}` link for every persona.
 */
export default function PersonaShareSheet({ currentSlug = null, origin }: PersonaShareSheetProps) {
  const [open, setOpen] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<PersonaSlug | null>(null);
  const { toast } = useToast();

  const baseOrigin =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : '');

  const buildUrl = (slug: PersonaSlug) => `${baseOrigin}${slug}`;

  const handleCopy = async (slug: PersonaSlug) => {
    hapticTap();
    const url = buildUrl(slug);
    try {
      await navigator.clipboard.writeText(url);
      hapticSuccess();
      setCopiedSlug(slug);
      toast({ title: 'Link copied', description: url });
      setTimeout(() => setCopiedSlug((s) => (s === slug ? null : s)), 1800);
    } catch {
      toast({
        title: "Couldn't copy automatically",
        description: 'Long-press the link to copy it manually.',
        variant: 'destructive',
      });
    }
  };

  const handleNativeShare = async () => {
    hapticTap();
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: 'Welile Dashboards',
        text: 'Open the right Welile dashboard for your role:',
        url: baseOrigin || undefined,
      });
    } catch {
      // user cancelled — silent
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          aria-label="Share dashboard links"
          onClick={() => hapticTap()}
          className="fixed right-4 bottom-24 z-40 h-12 w-12 rounded-full shadow-lg shadow-primary/30 md:bottom-6"
        >
          <Share2 className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>Share dashboard links</SheetTitle>
          <SheetDescription>
            Each persona has its own dashboard URL. Copy or open any link below.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {PERSONA_SLUGS.map((slug) => {
            const meta = PERSONA_META[slug];
            const url = buildUrl(slug);
            const isCopied = copiedSlug === slug;
            const isCurrent = currentSlug === slug;
            return (
              <div
                key={slug}
                className={cn(
                  'rounded-2xl border bg-card p-3 transition-colors',
                  isCurrent ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border',
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br',
                      meta.accent,
                    )}
                  >
                    <meta.Icon className="h-5 w-5" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{meta.label} Dashboard</span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
                          You're here
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{meta.tagline}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs text-foreground/80">
                    {url}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => handleCopy(slug)}
                    aria-label={`Copy ${meta.label} dashboard link`}
                  >
                    {isCopied ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => {
                      hapticTap();
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }}
                    aria-label={`Open ${meta.label} dashboard in a new tab`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <Button
            variant="secondary"
            className="mt-4 w-full gap-2"
            onClick={handleNativeShare}
          >
            <Share2 className="h-4 w-4" />
            Share via…
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}

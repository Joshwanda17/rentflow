import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { generateWelileAiId } from '@/lib/welileAiId';

const DISMISS_KEY = 'welile_trust_banner_dismissed_at';
const SHOW_AGAIN_AFTER_MS = 24 * 60 * 60 * 1000; // 24h

interface TrustSnapshot {
  score: number;
  tier: string;
  data_points: number;
}

/**
 * Persistent dashboard banner that nudges users to grow their Welile Trust Score.
 * Auto-hides for tier=excellent users; reappears 24h after dismissal otherwise.
 */
export function TrustBoostBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<TrustSnapshot | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Hide if recently dismissed
  useEffect(() => {
    try {
      const last = localStorage.getItem(DISMISS_KEY);
      if (last && Date.now() - Number(last) < SHOW_AGAIN_AFTER_MS) {
        setDismissed(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!user || dismissed) return;
    let cancelled = false;
    (async () => {
      const aiId = generateWelileAiId(user.id);
      const { data, error } = await supabase.rpc('get_user_trust_profile', { p_ai_id: aiId });
      if (cancelled || error) return;
      const parsed = data as { trust?: TrustSnapshot; error?: string } | null;
      if (parsed?.trust) {
        setSnapshot({
          score: Number(parsed.trust.score) || 0,
          tier: parsed.trust.tier,
          data_points: parsed.trust.data_points,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [user, dismissed]);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setDismissed(true);
  };

  if (!user || dismissed || !snapshot) return null;
  if (snapshot.tier === 'excellent') return null; // already high — no nudge

  const aiId = generateWelileAiId(user.id);
  const isNew = snapshot.tier === 'new' || snapshot.data_points < 2;
  const ctaText = isNew ? 'Build your Welile Trust Score' : 'Boost your Welile Trust Score';
  const subText = isNew
    ? 'Add rent history, onboard your landlord, or enable GPS to unlock lender-grade trust.'
    : `You're at ${Math.round(snapshot.score)}/100. Tap to see what to do next for higher limits.`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
      >
        <Card className="bg-gradient-to-r from-primary/10 via-emerald-500/10 to-primary/5 border-primary/20 p-3 mb-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center text-primary shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{ctaText}</p>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{subText}</p>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => navigate(`/profile/${aiId}`)}
                >
                  See how <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
                <span className="text-[10px] text-muted-foreground">
                  Score: <span className="font-bold text-foreground">{Math.round(snapshot.score)}/100</span>
                </span>
              </div>
            </div>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="text-muted-foreground hover:text-foreground transition shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}

export default TrustBoostBanner;

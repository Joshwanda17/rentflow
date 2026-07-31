import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Megaphone, X, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const NOTICE_DISMISSED_KEY = 'agent-listing-rules-notice-dismissed-v1';

/**
 * Dismissible notice banner informing agents of the new house listing
 * rules that took effect June 2026.
 *
 * Rules surfaced:
 * 1. Every house listing now requires admin verification before it appears
 *    in the public marketplace.
 * 2. Agents earn UGX 2,000 ONLY after Landlord Ops verifies the listing
 *    (no instant reward on posting).
 * 3. If a listing is rejected by Landlord Ops, the agent is charged UGX 2,000.
 * 4. After 3 rejections an agent is automatically blocked from posting for 2 days.
 */
export default function AgentListingRulesNotice() {
  const [isDismissed, setIsDismissed] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(NOTICE_DISMISSED_KEY);
      setIsDismissed(dismissed === 'true');
    } catch {
      setIsDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    try {
      localStorage.setItem(NOTICE_DISMISSED_KEY, 'true');
    } catch { /* ignore */ }
    setIsDismissed(true);
  };

  if (isDismissed) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
      >
        <Card className="relative overflow-hidden border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 p-1.5 rounded-full hover:bg-muted/50 transition-colors z-10"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>

          <div className="p-4 pr-10">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 shrink-0">
                <Megaphone className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm text-amber-700 dark:text-amber-400">
                  New House Listing Rules — Please Read
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  A few important changes to how house listings work on Welile.
                </p>

                {!expanded && (
                  <Button
                    onClick={() => setExpanded(true)}
                    variant="link"
                    size="sm"
                    className="h-auto p-0 mt-1 text-xs gap-1 text-amber-700 dark:text-amber-400"
                  >
                    <Info className="h-3 w-3" />
                    Read the rules
                  </Button>
                )}

                {expanded && (
                  <motion.ul
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2 space-y-2 text-xs"
                  >
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-foreground">
                        <strong>UGX 2,000 on verification</strong> — There is no instant reward for posting. You earn UGX 2,000 only after Landlord Ops verifies your house listing.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-foreground">
                        <strong>UGX 2,000 charge</strong> — If Landlord Ops rejects your listing, you are charged UGX 2,000.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-foreground">
                        <strong>3 rejections = 2-day block</strong> — If your listings are rejected 3 times, you are blocked from posting for 2 days. You will see a countdown when you try to list again.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                      <span className="text-foreground">
                        <strong>Admin approval required</strong> — New listings no longer appear publicly until approved by Landlord Ops. You can still see and manage your own listings under "My Listings".
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                      <span className="text-foreground">
                        <strong>While blocked: zero earnings</strong> — If you are blocked from posting, you earn no listing rewards or commissions until the block is lifted.
                      </span>
                    </li>
                  </motion.ul>
                )}

                {expanded && (
                  <Button
                    onClick={() => setExpanded(false)}
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 mt-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Collapse
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}

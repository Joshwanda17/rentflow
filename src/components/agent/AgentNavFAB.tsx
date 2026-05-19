import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

type HistoryEntry = { path: string; label: string };

/**
 * Convert "/agent/tenants/abc-123" → "Tenants".
 * Keeps labels short, friendly, and stable for repeat visits.
 */
function labelFor(pathname: string): string {
  if (pathname === '/' || pathname === '/dashboard') return 'Home';
  const seg = pathname.split('/').filter(Boolean)[0] ?? '';
  if (!seg) return 'Home';
  // Drop UUID-ish trailing segments by only using the first segment.
  return seg
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 22);
}

/**
 * Global agent navigation aid: a thumb-zone Back + Home pill that follows the
 * agent across every screen so they can never get "lost" inside the app.
 *
 * - Mobile only (≤ md). Desktop already has its own nav.
 * - Visible only when `role === 'agent'` (or any agent variant).
 * - Hidden on the agent home (`/dashboard`) — nowhere to go back from there.
 * - Hidden whenever a Radix Dialog/Sheet/AlertDialog is open so it never
 *   competes with a modal's own footer (mirrors FloatingToolbar behaviour).
 * - Also wires an iOS-style swipe-from-left-edge gesture to trigger Back.
 */
export default function AgentNavFAB() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isAgent = role === 'agent';

  const onHome = location.pathname === '/' || location.pathname === '/dashboard';

  // Lightweight in-memory route history (most-recent last, max 5 unique entries).
  // Persisted to sessionStorage so a refresh doesn't strand the agent.
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const raw = sessionStorage.getItem('welile.agentNavHistory');
      return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    } catch {
      return [];
    }
  });
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAgent) return;
    if (lastPathRef.current === location.pathname) return;
    lastPathRef.current = location.pathname;
    setHistory((prev) => {
      const entry: HistoryEntry = { path: location.pathname, label: labelFor(location.pathname) };
      // Drop any existing occurrence of this path so it moves to the end.
      const next = prev.filter((e) => e.path !== entry.path);
      next.push(entry);
      // Keep last 6 (current + 5 history items).
      const trimmed = next.slice(-6);
      try {
        sessionStorage.setItem('welile.agentNavHistory', JSON.stringify(trimmed));
      } catch {
        /* ignore quota errors */
      }
      return trimmed;
    });
  }, [isAgent, location.pathname]);

  // Everything except the current page, oldest → newest.
  const crumbs = history.filter((e) => e.path !== location.pathname);

  // Hide whenever a modal/sheet/alertdialog is open.
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => {
    if (!isAgent) return;
    const check = () => {
      const open = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      );
      setModalOpen(Boolean(open));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state'],
    });
    return () => observer.disconnect();
  }, [isAgent]);

  // iOS-style swipe-from-left-edge → back
  useEffect(() => {
    if (!isAgent || onHome || modalOpen) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX <= 24) {
        startX = t.clientX;
        startY = t.clientY;
        tracking = true;
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dx > 70 && dy < 60) navigate(-1);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isAgent, onHome, modalOpen, navigate]);

  // Android hardware Back button handling (PWA / TWA / WebView).
  // The system back triggers a `popstate`. We intercept it so:
  //   1. If a modal/sheet/alertdialog is open → close it instead of navigating away.
  //   2. If we're on the agent home → require a second press within 2s to exit
  //      (prevents accidentally closing the installed app).
  //   3. Otherwise → let the browser perform the natural back navigation.
  const exitArmedRef = useRef(false);
  useEffect(() => {
    if (!isAgent) return;

    const pushGuard = () => {
      try {
        window.history.pushState({ welileNavGuard: true }, '');
      } catch {
        /* history API unavailable — ignore */
      }
    };

    // Seed a sentinel state on home so the very first hardware-back press
    // is captured by us rather than exiting the app.
    if (onHome) pushGuard();

    const onPop = () => {
      const modal = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      );
      if (modal) {
        // Re-push the sentinel we just consumed, then close the topmost modal
        // via the standard Escape handler that Radix listens for.
        pushGuard();
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
        );
        return;
      }

      if (onHome) {
        if (exitArmedRef.current) {
          // Second press within the window — allow the app to close naturally.
          return;
        }
        exitArmedRef.current = true;
        pushGuard();
        toast({ description: 'Press back again to exit', duration: 1800 });
        window.setTimeout(() => {
          exitArmedRef.current = false;
        }, 2000);
      }
      // Non-home, no modal: popstate already navigated back. Nothing to do.
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isAgent, onHome]);

  if (!isAgent || modalOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="agent-nav-fab"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        className={cn(
          'md:hidden fixed left-3 right-3 z-[60] flex flex-col items-start gap-2',
          // sit above the bottom safe area + above the WhatsApp FAB stack
          'bottom-[max(1rem,env(safe-area-inset-bottom))]',
        )}
      >
        {/* Recent screens — scrollable horizontal chip strip */}
        {!onHome && crumbs.length > 0 && (
          <nav
            aria-label="Recent screens"
            className={cn(
              'max-w-full overflow-x-auto no-scrollbar',
              'rounded-full bg-background/90 backdrop-blur border border-border shadow-md',
              'px-2 py-1',
            )}
          >
            <ol className="flex items-center gap-1 whitespace-nowrap">
              {crumbs.map((c, i) => (
                <li key={`${c.path}-${i}`} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => navigate(c.path)}
                    className={cn(
                      'h-9 px-3 rounded-full text-xs font-medium',
                      'text-muted-foreground hover:text-foreground hover:bg-muted',
                      'active:scale-95 transition-all touch-manipulation',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    )}
                    aria-label={`Jump back to ${c.label}`}
                  >
                    {c.label}
                  </button>
                  {i < crumbs.length - 1 && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className="flex items-center gap-2">
        {!onHome && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            aria-keyshortcuts="Alt+ArrowLeft"
            className={cn(
              'h-14 min-w-14 px-4 rounded-full',
              'bg-background/95 backdrop-blur border border-border',
              'shadow-lg text-foreground',
              'flex items-center gap-1.5',
              'active:scale-95 transition-transform touch-manipulation',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            <span className="text-sm font-medium pr-1">Back</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          aria-label="Go to agent home"
          className={cn(
            'h-14 w-14 rounded-full',
            'bg-primary text-primary-foreground',
            'shadow-lg shadow-primary/30',
            'flex items-center justify-center',
            'active:scale-95 transition-transform touch-manipulation',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            onHome && 'opacity-60',
          )}
          disabled={onHome}
        >
          <Home className="h-6 w-6" aria-hidden="true" />
        </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

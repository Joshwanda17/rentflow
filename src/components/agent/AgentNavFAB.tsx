import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { confirmDiscardIfDirty } from '@/hooks/useUnsavedChangesGuard';

type HistoryEntry = { path: string; label: string };

/**
 * Known-route → short human label. Keep entries short (≤ 14 chars) so the
 * chip strip stays readable on a 360px phone. Longest-prefix match wins,
 * so dynamic routes like `/house/:id` resolve via their static prefix.
 */
const ROUTE_LABELS: Array<[RegExp, string]> = [
  [/^\/dashboard\/agent\b/, 'Agent Home'],
  [/^\/dashboard\/tenant\b/, 'Tenant Home'],
  [/^\/dashboard\/landlord\b/, 'Landlord Home'],
  [/^\/dashboard\/funder\b/, 'Supporter Home'],
  [/^\/dashboard\/manager\b/, 'Manager Home'],
  [/^\/dashboard\b/, 'Home'],
  [/^\/transactions\b/, 'Transactions'],
  [/^\/financial-statement\b/, 'Statement'],
  [/^\/settings\b/, 'Settings'],
  [/^\/earnings\b/, 'Earnings'],
  [/^\/analytics\b/, 'Analytics'],
  [/^\/orders\b/, 'Orders'],
  [/^\/wishlist\b/, 'Wishlist'],
  [/^\/marketplace\b/, 'Marketplace'],
  [/^\/categories\b/, 'Categories'],
  [/^\/flash-sales\b/, 'Flash Sales'],
  [/^\/seller-portal\b/, 'Seller Portal'],
  [/^\/seller\b/, 'Seller'],
  [/^\/my-receipts\b/, 'Receipts'],
  [/^\/my-loans\b/, 'Rent Plans'],
  [/^\/payment-schedule\b/, 'Schedule'],
  [/^\/pay-landlord\b/, 'Pay Landlord'],
  [/^\/rent-discount-history\b/, 'Discounts'],
  [/^\/benefits\b/, 'Benefits'],
  [/^\/referrals\b/, 'Referrals'],
  [/^\/manager-access\b/, 'Manager Access'],
  [/^\/become-supporter\b/, 'Become Supporter'],
  [/^\/angel-pool-agreement\b/, 'Angel Agreement'],
  [/^\/angel-pool\b/, 'Angel Pool'],
  [/^\/vendor-portal\b/, 'Vendor Portal'],
  [/^\/deposits-management\b/, 'Deposits Ops'],
  [/^\/deposit-history\b/, 'Deposits'],
  [/^\/activate-supporter\b/, 'Activate'],
  [/^\/agent-registrations\b/, 'Registrations'],
  [/^\/sub-agents\b/, 'Sub-Agents'],
  [/^\/agent\/partners\b/, 'My Partners'],
  [/^\/agent\/tenants\b/, 'Tenants'],
  [/^\/agent\/funders\b/, 'My Funders'],
  [/^\/agent\b/, 'Agent'],
  [/^\/record-rent\b/, 'Record Rent'],
  [/^\/calculator\b/, 'Calculator'],
  [/^\/rent-calculator\b/, 'Rent Calc'],
  [/^\/try-calculator\b/, 'Try Calc'],
  [/^\/users\b/, 'Users'],
  [/^\/platform-users\b/, 'Platform Users'],
  [/^\/supporter-earnings\b/, 'Returns'],
  [/^\/reinvestment-history\b/, 'Reinvest'],
  [/^\/investment-portfolio\b/, 'Portfolio'],
  [/^\/my-watchlist\b/, 'Watchlist'],
  [/^\/opportunities\b/, 'Opportunities'],
  [/^\/audit-log\b/, 'Audit Log'],
  [/^\/welile-homes-dashboard\b/, 'Homes Ops'],
  [/^\/landlord-welile-homes\b/, 'My Homes'],
  [/^\/welile-homes\b/, 'Welile Homes'],
  [/^\/find-a-house\b/, 'Find House'],
  [/^\/house\b/, 'House'],
  [/^\/shop\b/, 'Shop'],
  [/^\/landlord-signup\b/, 'Landlord Signup'],
  [/^\/landlord-agreement\b/, 'Landlord Terms'],
  [/^\/agent-agreement\b/, 'Agent Terms'],
  [/^\/agent-commission-benefits\b/, 'Commissions'],
  [/^\/profile\b/, 'Profile'],
  [/^\/id\b/, 'Trust ID'],
  [/^\/staff\b/, 'Staff'],
  [/^\/select-role\b/, 'Switch Role'],
  [/^\/onboarding\b/, 'Onboarding'],
  [/^\/funder-onboarding\b/, 'Supporter Onboarding'],
  [/^\/partner-onboarding\b/, 'Partner Onboarding'],
  [/^\/welcome\b/, 'Welcome'],
  [/^\/auth\b/, 'Sign In'],
];

/**
 * Convert a pathname into a short, friendly chip label.
 * Looks up the curated route map first so labels match what agents see in
 * the rest of the UI ("Rent Plans", "Returns", "My Partners"…). Falls back
 * to a title-cased first segment with UUID-ish tails stripped.
 */
function labelFor(pathname: string): string {
  if (pathname === '/' || pathname === '/dashboard') return 'Home';
  for (const [re, label] of ROUTE_LABELS) {
    if (re.test(pathname)) return label;
  }
  const seg = pathname.split('/').filter(Boolean)[0] ?? '';
  if (!seg) return 'Home';
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

  // Treat the role-scoped dashboard routes (e.g. `/dashboard/agent`) as
  // "home" too — otherwise the Back pill renders on the agent landing page
  // and collides with the fixed bottom role-switcher on small phones.
  const onHome =
    location.pathname === '/' ||
    location.pathname === '/dashboard' ||
    /^\/dashboard\/(agent|tenant|landlord|funder|manager|owner)\/?$/.test(location.pathname);

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
      if (dx > 70 && dy < 60) {
        if (confirmDiscardIfDirty()) navigate(-1);
      }
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
        return;
      }

      // Non-home, no modal: popstate already moved us back. If a form was
      // dirty, ask now — and if the user wants to stay, roll forward by
      // re-pushing the screen they were just on.
      if (!confirmDiscardIfDirty()) {
        window.history.pushState(
          { welileNavGuard: true },
          '',
          location.pathname + location.search,
        );
      }
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isAgent, onHome]);

  // Global keyboard shortcuts: Alt+← for Back, Alt+Home for the dashboard.
  // These mirror the visible aria-keyshortcuts hints on each button so power
  // users (and external keyboards on tablets) can navigate without touch.
  useEffect(() => {
    if (!isAgent || modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowLeft' && !onHome) {
        e.preventDefault();
        if (confirmDiscardIfDirty()) navigate(-1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (!onHome && confirmDiscardIfDirty()) navigate('/dashboard');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAgent, onHome, modalOpen, navigate]);

  // Arrow-key roving focus inside the chip strip. Left/Right move between
  // chips, Home/End jump to the ends — matches the WAI-ARIA "toolbar" pattern
  // that screen readers expect for horizontal lists of buttons.
  const chipStripRef = useRef<HTMLOListElement | null>(null);
  const onChipKeyDown = (e: React.KeyboardEvent<HTMLOListElement>) => {
    const buttons = Array.from(
      chipStripRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
    );
    if (buttons.length === 0) return;
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = idx;
    if (e.key === 'ArrowRight') next = idx < 0 ? 0 : Math.min(buttons.length - 1, idx + 1);
    else if (e.key === 'ArrowLeft') next = idx < 0 ? 0 : Math.max(0, idx - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = buttons.length - 1;
    else return;
    e.preventDefault();
    buttons[next]?.focus();
  };

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
            <p className="sr-only" id="agent-nav-chip-help">
              {`${crumbs.length} recent ${crumbs.length === 1 ? 'screen' : 'screens'}. Use Left and Right arrow keys to move between them.`}
            </p>
            <ol
              ref={chipStripRef}
              role="toolbar"
              aria-label="Recent screens"
              aria-describedby="agent-nav-chip-help"
              aria-orientation="horizontal"
              onKeyDown={onChipKeyDown}
              className="flex items-center gap-1 whitespace-nowrap"
            >
              {crumbs.map((c, i) => (
                <li key={`${c.path}-${i}`} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirmDiscardIfDirty()) navigate(c.path);
                    }}
                    tabIndex={i === crumbs.length - 1 ? 0 : -1}
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

        <div
          role="toolbar"
          aria-label="Agent navigation"
          className="flex items-center gap-2"
        >
        {!onHome && (
          <button
            type="button"
            onClick={() => {
              if (confirmDiscardIfDirty()) navigate(-1);
            }}
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
          onClick={() => {
            if (confirmDiscardIfDirty()) navigate('/dashboard');
          }}
          aria-label="Go to agent home"
          aria-keyshortcuts="Alt+Home"
          aria-disabled={onHome}
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

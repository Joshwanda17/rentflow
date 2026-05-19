import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

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

  const isAgent =
    role === 'agent' ||
    role === 'sub_agent' ||
    role === 'partner_agent' ||
    role === 'proxy_agent';

  const onHome = location.pathname === '/' || location.pathname === '/dashboard';

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
          'md:hidden fixed left-3 z-[60] flex items-center gap-2',
          // sit above the bottom safe area + above the WhatsApp FAB stack
          'bottom-[max(1rem,env(safe-area-inset-bottom))]',
        )}
      >
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
      </motion.div>
    </AnimatePresence>
  );
}

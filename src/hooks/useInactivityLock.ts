import { useState, useEffect, useCallback, useRef } from 'react';

const ACTIVITY_EVENTS = ['mousedown', 'touchstart', 'keydown', 'scroll', 'mousemove'] as const;

interface UseInactivityLockOptions {
  /** Timeout in milliseconds before locking. Default: 5 minutes */
  timeout?: number;
  /** Whether the lock feature is enabled */
  enabled?: boolean;
}

export function useInactivityLock({ timeout = 5 * 60 * 1000, enabled = true }: UseInactivityLockOptions = {}) {
  const [isLocked, setIsLocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (!enabled || isLocked) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsLocked(true), timeout);
  }, [enabled, timeout, isLocked]);

  const unlock = useCallback(() => {
    setIsLocked(false);
    // Timer will be reset by the effect below when isLocked changes
  }, []);

  // Set up activity listeners
  useEffect(() => {
    if (!enabled || isLocked) return;

    // Start initial timer
    timerRef.current = setTimeout(() => setIsLocked(true), timeout);

    const handler = () => resetTimer();
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, handler, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handler));
    };
  }, [enabled, isLocked, timeout, resetTimer]);

  return { isLocked, unlock };
}

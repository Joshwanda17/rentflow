import { useEffect, useRef } from 'react';

interface SwipeOptions {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  /** Minimum horizontal distance (px) to count as a swipe. */
  threshold?: number;
  /** Disable entirely (e.g. on desktop). */
  enabled?: boolean;
}

/**
 * Attaches left/right swipe detection to a container element.
 *
 * Designed for phone tab navigation: a clearly-horizontal drag flips to the
 * next/previous section. Swipes that begin inside a horizontally-scrollable
 * area, a form control, or anything marked `data-swipe-ignore` are skipped so
 * they don't fight the user scrolling a table or chip row.
 */
export function useHorizontalSwipe<T extends HTMLElement>({
  onSwipeLeft,
  onSwipeRight,
  threshold = 70,
  enabled = true,
}: SwipeOptions) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let startX = 0;
    let startY = 0;
    let active = false;

    const shouldIgnore = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return !!target.closest(
        '[data-swipe-ignore], .overflow-x-auto, input, textarea, select, [role="slider"], [contenteditable="true"]',
      );
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || shouldIgnore(e.target)) {
        active = false;
        return;
      }
      active = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      // Must be mostly horizontal and exceed the threshold.
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [onSwipeLeft, onSwipeRight, threshold, enabled]);

  return ref;
}

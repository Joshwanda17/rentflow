import { useRef } from 'react';

interface Options {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Minimum horizontal distance (px) to count as a swipe. */
  threshold?: number;
  /** Max vertical drift (px) allowed before we treat it as a scroll, not a swipe. */
  maxVertical?: number;
}

/**
 * Lightweight touch-swipe detector. Returns props you spread on the swipe
 * target. Ignores vertical scrolls and short taps. Pointer-events-based so
 * it also works with stylus / mouse drags.
 */
export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
  maxVertical = 50,
}: Options) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;
      const dt = Date.now() - start.current.t;
      start.current = null;
      if (dt > 600) return; // too slow → likely a scroll/long-press
      if (Math.abs(dy) > maxVertical) return; // vertical scroll
      if (Math.abs(dx) < threshold) return;
      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
  };
}
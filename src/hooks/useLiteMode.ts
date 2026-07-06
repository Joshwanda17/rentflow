import { useEffect, useState } from 'react';

/**
 * Detects "lite mode" — Android Go-class / low-end devices, reduced-motion, or
 * Data Saver. The `html.lite-mode` class is set once at boot in `main.tsx`; this
 * hook simply reads it (plus live `prefers-reduced-motion` changes) so React
 * components can render static UI instead of Framer Motion animations.
 *
 * Usage:
 *   const lite = useLiteMode();
 *   return lite ? <div className="card" /> : <motion.div ... />;
 *
 * The app-wide CSS in index.css already neutralises CSS transitions/animations
 * in lite mode; this hook is for skipping the JS/compositing cost of motion
 * components on the hot paths.
 */
export function useLiteMode(): boolean {
  const [lite, setLite] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('lite-mode');
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      const classLite = document.documentElement.classList.contains('lite-mode');
      setLite(classLite || mql.matches);
    };
    update();
    mql.addEventListener?.('change', update);
    return () => mql.removeEventListener?.('change', update);
  }, []);

  return lite;
}

export default useLiteMode;

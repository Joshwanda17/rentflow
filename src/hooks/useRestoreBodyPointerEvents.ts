import { useEffect } from 'react';

/**
 * Fixes the Radix stacked-modal freeze.
 *
 * Radix sets `pointer-events: none` on <body> while a modal layer is open and
 * restores the previous value on close. When two modal layers are stacked
 * (e.g. a confirm AlertDialog opened over a Dialog) Radix can capture the
 * wrong "original" value and leave <body> stuck at `none` after BOTH layers
 * close — which makes the whole screen unclickable (a "frozen" screen).
 *
 * This hook clears that stuck value once the component unmounts, but ONLY when
 * no modal is still open (so a remaining parent dialog keeps its own blocking
 * behaviour). The reset is deferred a tick so it runs after Radix's own
 * synchronous unmount cleanup and wins the race.
 */
export function useRestoreBodyPointerEvents() {
  useEffect(() => {
    return () => {
      setTimeout(() => {
        if (typeof document === 'undefined') return;
        const stillOpen = document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
        );
        if (!stillOpen && document.body.style.pointerEvents === 'none') {
          document.body.style.pointerEvents = '';
        }
      }, 0);
    };
  }, []);
}

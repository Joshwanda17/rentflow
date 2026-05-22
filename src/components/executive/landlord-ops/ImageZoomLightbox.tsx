import { useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Props {
  images: string[];
  startIndex: number | null;
  open: boolean;
  onClose: () => void;
  altPrefix?: string;
}

export function ImageZoomLightbox({ images, startIndex, open, onClose, altPrefix = 'Photo' }: Props) {
  const current = startIndex ?? 0;
  const total = images.length;

  const goNext = useCallback(() => {
    if (total <= 1) return;
    // parent manages index via startIndex prop; we can't mutate it directly here
    // but we can dispatch a synthetic event or just let the parent drive this.
    // For simplicity, we rely on parent state management — but this component
    // is purely presentational. We'll pass back navigation via callbacks.
  }, [total]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrevGlobal();
      if (e.key === 'ArrowRight') goNextGlobal();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open || startIndex === null) return null;

  return (
    <div
      className="fixed inset-1 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
        aria-label="Close zoom"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Counter */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
        {current + 1} / {total}
      </div>

      {/* Prev */}
      {total > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrevGlobal(); }}
          className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
          aria-label="Previous photo"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      {/* Image */}
      <img
        src={images[current]}
        alt={`${altPrefix} photo ${current + 1}`}
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Next */}
      {total > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNextGlobal(); }}
          className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
          aria-label="Next photo"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );

  function goNextGlobal() {
    window.dispatchEvent(new CustomEvent('house-zoom-nav', { detail: { dir: 1 } }));
  }
  function goPrevGlobal() {
    window.dispatchEvent(new CustomEvent('house-zoom-nav', { detail: { dir: -1 } }));
  }
}

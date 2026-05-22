import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Props {
  images: string[];
  startIndex: number | null;
  open: boolean;
  onClose: () => void;
  altPrefix?: string;
}

export function ImageZoomLightbox({ images, startIndex, open, onClose, altPrefix = 'Photo' }: Props) {
  const [current, setCurrent] = useState(startIndex ?? 0);

  useEffect(() => {
    if (open && startIndex !== null) setCurrent(startIndex);
  }, [open, startIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setCurrent(c => (c > 0 ? c - 1 : images.length - 1));
      if (e.key === 'ArrowRight') setCurrent(c => (c < images.length - 1 ? c + 1 : 0));
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose, images.length]);

  if (!open || startIndex === null) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
        aria-label="Close zoom"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
        {current + 1} / {images.length}
      </div>

      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); setCurrent(c => (c > 0 ? c - 1 : images.length - 1)); }}
          className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
          aria-label="Previous photo"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      <img
        src={images[current]}
        alt={`${altPrefix} photo ${current + 1}`}
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); setCurrent(c => (c < images.length - 1 ? c + 1 : 0)); }}
          className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
          aria-label="Next photo"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { StorageImage } from '@/components/ui/StorageImage';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Share2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface LightboxImage {
  id: string;
  image_url: string;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
  productName?: string;
}

export function ImageLightbox({ 
  images, 
  initialIndex = 0, 
  open, 
  onClose,
  productName = 'Product'
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [direction, setDirection] = useState(0);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const lastTouchDist = useRef<number | null>(null);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const isZoomed = scale > 1.05;

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    lastTouchDist.current = null;
    lastTouchCenter.current = null;
  }, []);

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      resetZoom();
    }
  }, [open, initialIndex, resetZoom]);

  // Reset zoom on slide change
  useEffect(() => { resetZoom(); }, [currentIndex, resetZoom]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': onClose(); break;
        case 'ArrowLeft': goToPrevious(); break;
        case 'ArrowRight': goToNext(); break;
        case 'Home': setDirection(-1); setCurrentIndex(0); break;
        case 'End': setDirection(1); setCurrentIndex(images.length - 1); break;
        case '+': case '=': setScale(s => Math.min(s + 0.5, 5)); break;
        case '-': setScale(s => { const n = Math.max(s - 0.5, 1); if (n === 1) setTranslate({ x: 0, y: 0 }); return n; }); break;
        case '0': resetZoom(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex, images.length, onClose, resetZoom]);

  // Focus trap + restore focus on close
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Defer to allow dialog to mount
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleFocusTrap);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleFocusTrap);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Prevent body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Pinch-to-zoom
  useEffect(() => {
    if (!open) return;
    const el = imgContainerRef.current;
    if (!el) return;

    const dist = (t: TouchList) => {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };
    const center = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });

    const onTS = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        lastTouchDist.current = dist(e.touches);
        lastTouchCenter.current = center(e.touches);
        swipeStart.current = null;
      } else if (e.touches.length === 1 && !isZoomed) {
        swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
      }
    };
    const onTM = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastTouchDist.current !== null) {
        e.preventDefault();
        const d = dist(e.touches);
        const c = center(e.touches);
        const delta = d / lastTouchDist.current;
        setScale(prev => Math.min(Math.max(prev * delta, 1), 5));
        if (lastTouchCenter.current) {
          setTranslate(prev => ({
            x: prev.x + c.x - lastTouchCenter.current!.x,
            y: prev.y + c.y - lastTouchCenter.current!.y,
          }));
        }
        lastTouchDist.current = d;
        lastTouchCenter.current = c;
      }
    };
    const onTE = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastTouchDist.current = null;
        lastTouchCenter.current = null;
        setScale(prev => {
          if (prev < 1.1) { setTranslate({ x: 0, y: 0 }); return 1; }
          return prev;
        });
      }
      // Native swipe fallback for single-finger horizontal swipes
      if (swipeStart.current && e.changedTouches.length === 1 && images.length > 1 && !isZoomed) {
        const start = swipeStart.current;
        const end = e.changedTouches[0];
        const dx = end.clientX - start.x;
        const dy = end.clientY - start.y;
        const dt = Date.now() - start.t;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2 && dt < 600) {
          if (dx > 0) goToPrevious(); else goToNext();
        }
        swipeStart.current = null;
      }
    };

    el.addEventListener('touchstart', onTS, { passive: false });
    el.addEventListener('touchmove', onTM, { passive: false });
    el.addEventListener('touchend', onTE);
    return () => {
      el.removeEventListener('touchstart', onTS);
      el.removeEventListener('touchmove', onTM);
      el.removeEventListener('touchend', onTE);
    };
  }, [open, isZoomed, images.length]);

  const goToPrevious = useCallback(() => {
    if (isZoomed) return;
    setDirection(-1);
    setCurrentIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length, isZoomed]);

  const goToNext = useCallback(() => {
    if (isZoomed) return;
    setDirection(1);
    setCurrentIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length, isZoomed]);

  const handleDragEnd = useCallback((_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (isZoomed) return;
    if (info.offset.x > 40 || info.velocity.x > 300) goToPrevious();
    else if (info.offset.x < -40 || info.velocity.x < -300) goToNext();
  }, [goToPrevious, goToNext, isZoomed]);

  const handleToggleZoom = useCallback(() => {
    if (isZoomed) resetZoom();
    else setScale(2.5);
  }, [isZoomed, resetZoom]);

  const handleShare = useCallback(async () => {
    const url = images[currentIndex]?.image_url;
    if (!url) return;
    const shareData = {
      title: `${productName} — Photo ${currentIndex + 1}`,
      text: `Check out this photo of ${productName} on Welile!`,
      url,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Image link copied!');
    }
  }, [images, currentIndex, productName]);

  const handleDownload = useCallback(async () => {
    const url = images[currentIndex]?.image_url;
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${productName}-${currentIndex + 1}.jpg`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  }, [images, currentIndex, productName]);

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d < 0 ? '100%' : '-100%', opacity: 0 }),
  };

  if (images.length === 0) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} photo viewer`}
          aria-describedby="lightbox-status"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex flex-col"
        >
          {/* Screen reader live region */}
          <div id="lightbox-status" role="status" aria-live="polite" className="sr-only">
            {productName} — Image {currentIndex + 1} of {images.length}
            {isZoomed ? ', zoomed in' : ''}
          </div>
          {/* Header */}
          <div className="flex items-center justify-between p-3 sm:p-4 relative z-10">
            <div className="flex items-center gap-3">
              <span className="text-white/70 text-sm font-medium tabular-nums" aria-hidden="true">
                {currentIndex + 1} / {images.length}
              </span>
              {productName && (
                <span className="text-white/50 text-sm hidden sm:block truncate max-w-[200px]" aria-hidden="true">
                  — {productName}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-0.5 sm:gap-1">
              <Button variant="ghost" size="icon" onClick={handleShare} aria-label="Share image"
                className="text-white/70 hover:text-white hover:bg-white/10 h-10 w-10" title="Share image">
                <Share2 className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDownload} aria-label="Download image"
                className="text-white/70 hover:text-white hover:bg-white/10 h-10 w-10" title="Save image">
                <Download className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleToggleZoom}
                aria-label={isZoomed ? 'Zoom out' : 'Zoom in'} aria-pressed={isZoomed}
                className="text-white/70 hover:text-white hover:bg-white/10 h-10 w-10" title={isZoomed ? 'Zoom out' : 'Zoom in'}>
                {isZoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
              </Button>
              <Button ref={closeButtonRef} variant="ghost" size="icon" onClick={onClose} aria-label="Close photo viewer"
                className="text-white/70 hover:text-white hover:bg-white/10 h-10 w-10">
                <X className="h-6 w-6" />
              </Button>
            </div>
          </div>

          {/* Main Image Area */}
          <div ref={imgContainerRef} className="flex-1 relative overflow-hidden flex items-center justify-center">
            {images.length > 1 && !isZoomed && (
              <>
                <Button variant="ghost" size="icon" onClick={goToPrevious} aria-label="Previous image"
                  className="absolute left-4 z-10 h-12 w-12 rounded-full text-white/70 hover:text-white hover:bg-white/10 hidden md:flex">
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button variant="ghost" size="icon" onClick={goToNext} aria-label="Next image"
                  className="absolute right-4 z-10 h-12 w-12 rounded-full text-white/70 hover:text-white hover:bg-white/10 hidden md:flex">
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}

            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.div
                key={currentIndex}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: 'spring', stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                }}
                drag={!isZoomed ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={handleDragEnd}
                className={cn(
                  'absolute inset-0 flex items-center justify-center p-4 touch-pan-y',
                  !isZoomed && 'cursor-grab active:cursor-grabbing'
                )}
              >
                <motion.img
                  src={images[currentIndex].image_url}
                  alt={`${productName} - Image ${currentIndex + 1}`}
                  className="max-h-full max-w-full object-contain select-none"
                  style={{
                    transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
                    transition: isZoomed ? 'none' : 'transform 0.3s ease',
                  }}
                  draggable={false}
                  onDoubleClick={handleToggleZoom}
                  onClick={() => { if (!isZoomed) handleToggleZoom(); }}
                />
              </motion.div>
            </AnimatePresence>

            {/* Hints */}
            {!isZoomed && (
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 text-white/25 text-[11px] pointer-events-none">
                <ZoomIn className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Double-click to zoom</span>
                <span className="md:hidden">Pinch or tap to zoom</span>
              </div>
            )}
            {images.length > 1 && !isZoomed && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-2 text-white/25 text-[11px] md:hidden pointer-events-none">
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Swipe to navigate</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="p-3 sm:p-4 overflow-x-auto" role="tablist" aria-label="Image thumbnails">
              <div className="flex gap-2 justify-center">
                {images.map((image, index) => (
                  <button
                    key={image.id}
                    role="tab"
                    aria-selected={index === currentIndex}
                    aria-label={`View image ${index + 1} of ${images.length}`}
                    tabIndex={index === currentIndex ? 0 : -1}
                    onClick={() => {
                      setDirection(index > currentIndex ? 1 : -1);
                      setCurrentIndex(index);
                    }}
                    className={cn(
                      'flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
                      index === currentIndex
                        ? 'border-white opacity-100 scale-105'
                        : 'border-transparent opacity-50 hover:opacity-75'
                    )}
                  >
                    <StorageImage src={image.image_url} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dots - Mobile */}
          {images.length > 1 && images.length <= 10 && (
            <div className="flex justify-center gap-1.5 pb-4 md:hidden" aria-hidden="true">
              {images.map((_, index) => (
                <button
                  key={index}
                  tabIndex={-1}
                  onClick={() => {
                    setDirection(index > currentIndex ? 1 : -1);
                    setCurrentIndex(index);
                  }}
                  className={cn(
                    'h-2 rounded-full transition-all',
                    index === currentIndex ? 'w-6 bg-white' : 'w-2 bg-white/40'
                  )}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

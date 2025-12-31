import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  const [isZoomed, setIsZoomed] = useState(false);

  // Reset index when opening
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setIsZoomed(false);
    }
  }, [open, initialIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          goToPrevious();
          break;
        case 'ArrowRight':
          goToNext();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const goToPrevious = useCallback(() => {
    if (isZoomed) return;
    setDirection(-1);
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length, isZoomed]);

  const goToNext = useCallback(() => {
    if (isZoomed) return;
    setDirection(1);
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length, isZoomed]);

  const handleDragEnd = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (isZoomed) return;
    
    const threshold = 50;
    const velocity = 0.5;

    if (info.offset.x > threshold || info.velocity.x > velocity) {
      goToPrevious();
    } else if (info.offset.x < -threshold || info.velocity.x < -velocity) {
      goToNext();
    }
  }, [goToPrevious, goToNext, isZoomed]);

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? '100%' : '-100%',
      opacity: 0,
    }),
  };

  if (images.length === 0) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 relative z-10">
            <div className="flex items-center gap-3">
              <span className="text-white/70 text-sm">
                {currentIndex + 1} / {images.length}
              </span>
              {productName && (
                <span className="text-white/50 text-sm hidden sm:block">
                  — {productName}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsZoomed(!isZoomed)}
                className="text-white/70 hover:text-white hover:bg-white/10"
              >
                {isZoomed ? (
                  <ZoomOut className="h-5 w-5" />
                ) : (
                  <ZoomIn className="h-5 w-5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-white/70 hover:text-white hover:bg-white/10"
              >
                <X className="h-6 w-6" />
              </Button>
            </div>
          </div>

          {/* Main Image Area */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            {/* Navigation Arrows - Desktop */}
            {images.length > 1 && !isZoomed && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goToPrevious}
                  className="absolute left-4 z-10 h-12 w-12 rounded-full text-white/70 hover:text-white hover:bg-white/10 hidden md:flex"
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goToNext}
                  className="absolute right-4 z-10 h-12 w-12 rounded-full text-white/70 hover:text-white hover:bg-white/10 hidden md:flex"
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}

            {/* Swipeable Image */}
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.div
                key={currentIndex}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                }}
                drag={!isZoomed ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={handleDragEnd}
                className={cn(
                  "absolute inset-0 flex items-center justify-center p-4 touch-pan-y",
                  !isZoomed && "cursor-grab active:cursor-grabbing"
                )}
              >
                <motion.img
                  src={images[currentIndex].image_url}
                  alt={`${productName} - Image ${currentIndex + 1}`}
                  className={cn(
                    "max-h-full max-w-full object-contain select-none transition-transform duration-300",
                    isZoomed ? "scale-150 cursor-move" : ""
                  )}
                  draggable={false}
                  onClick={() => !isZoomed && setIsZoomed(true)}
                />
              </motion.div>
            </AnimatePresence>

            {/* Swipe Hint - Mobile */}
            {images.length > 1 && !isZoomed && (
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 text-white/40 text-xs md:hidden">
                <ChevronLeft className="h-4 w-4" />
                <span>Swipe to navigate</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="p-4 overflow-x-auto">
              <div className="flex gap-2 justify-center">
                {images.map((image, index) => (
                  <button
                    key={image.id}
                    onClick={() => {
                      setDirection(index > currentIndex ? 1 : -1);
                      setCurrentIndex(index);
                    }}
                    className={cn(
                      "flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all",
                      index === currentIndex
                        ? "border-white opacity-100 scale-105"
                        : "border-transparent opacity-50 hover:opacity-75"
                    )}
                  >
                    <img
                      src={image.image_url}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dots Indicator - Mobile */}
          {images.length > 1 && images.length <= 10 && (
            <div className="flex justify-center gap-1.5 pb-4 md:hidden">
              {images.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setDirection(index > currentIndex ? 1 : -1);
                    setCurrentIndex(index);
                  }}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    index === currentIndex
                      ? "w-6 bg-white"
                      : "w-2 bg-white/40"
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

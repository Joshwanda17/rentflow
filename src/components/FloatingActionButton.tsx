import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Plus, X, LucideIcon, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { hapticTap, hapticImpact, hapticSuccess, hapticSelection } from '@/lib/haptics';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FABAction {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
}

interface FloatingActionButtonProps {
  actions: FABAction[];
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  className?: string;
}

interface SwipeableActionProps {
  action: FABAction;
  index: number;
  onAction: () => void;
}

function SwipeableAction({ action, index, onAction }: SwipeableActionProps) {
  const x = useMotionValue(0);
  const hasTriggeredHaptic = useRef(false);
  
  const background = useTransform(
    x,
    [-100, 0, 100],
    ['hsl(var(--destructive))', 'transparent', 'hsl(var(--primary))']
  );
  const opacity = useTransform(
    x,
    [-100, -50, 0, 50, 100],
    [1, 0.5, 0, 0.5, 1]
  );
  const iconScale = useTransform(
    x,
    [-100, 0, 100],
    [1.2, 1, 1.2]
  );

  // Trigger haptic when crossing threshold during drag
  x.on('change', (latest) => {
    const threshold = 60;
    if (Math.abs(latest) > threshold && !hasTriggeredHaptic.current) {
      hapticSelection();
      hasTriggeredHaptic.current = true;
    } else if (Math.abs(latest) < threshold) {
      hasTriggeredHaptic.current = false;
    }
  });

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 80;
    if (Math.abs(info.offset.x) > threshold) {
      hapticSuccess();
      onAction();
    }
  };

  const handleTap = () => {
    hapticTap();
    onAction();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ 
        opacity: 1, 
        y: 0,
        transition: {
          type: 'spring',
          stiffness: 400,
          damping: 25,
          delay: index * 0.05,
        },
      }}
      className="relative overflow-hidden rounded-2xl"
    >
      {/* Swipe indicator background */}
      <motion.div 
        style={{ background }}
        className="absolute inset-0 rounded-2xl flex items-center justify-between px-4"
      >
        <motion.div style={{ opacity }} className="flex items-center gap-2 text-destructive-foreground">
          <X className="h-5 w-5" />
          <span className="text-sm font-medium">Cancel</span>
        </motion.div>
        <motion.div style={{ opacity }} className="flex items-center gap-2 text-primary-foreground">
          <span className="text-sm font-medium">Run</span>
          <ChevronRight className="h-5 w-5" />
        </motion.div>
      </motion.div>

      {/* Draggable action card */}
      <motion.button
        style={{ x }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.3}
        onDragEnd={handleDragEnd}
        whileTap={{ scale: 0.98 }}
        onClick={handleTap}
        className={cn(
          "relative w-full flex items-center gap-4 p-4 rounded-2xl",
          "bg-secondary/80 hover:bg-secondary",
          "border border-border/50 hover:border-primary/30",
          "transition-colors duration-200 cursor-grab active:cursor-grabbing"
        )}
      >
        <motion.div 
          style={{ scale: iconScale }}
          className={cn(
            "p-3 rounded-xl shrink-0",
            action.variant === 'destructive' 
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary"
          )}
        >
          <action.icon className="h-5 w-5" />
        </motion.div>
        <div className="flex-1 text-left">
          <span className="text-sm font-medium text-foreground">
            {action.label}
          </span>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tap or swipe right to activate
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </motion.button>
    </motion.div>
  );
}

export function FloatingActionButton({ 
  actions, 
  position = 'bottom-right',
  className 
}: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const isMobile = useIsMobile();

  const LONG_PRESS_DURATION = 500; // ms

  const startLongPress = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      hapticSelection();
      setShowPreview(true);
    }, LONG_PRESS_DURATION);
  }, []);

  const endLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (showPreview) {
      setShowPreview(false);
    }
  }, [showPreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  const positionClasses = {
    'bottom-right': 'right-6 bottom-24 md:bottom-6',
    'bottom-left': 'left-6 bottom-24 md:bottom-6',
    'bottom-center': 'left-1/2 -translate-x-1/2 bottom-24 md:bottom-6',
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
    exit: {
      opacity: 0,
      transition: {
        staggerChildren: 0.05,
        staggerDirection: -1,
      },
    },
  };

  const actionVariants = {
    hidden: { 
      opacity: 0, 
      y: 20, 
      scale: 0.8,
    },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 400,
        damping: 25,
      },
    },
    exit: { 
      opacity: 0, 
      y: 10, 
      scale: 0.8,
      transition: {
        duration: 0.15,
      },
    },
  };

  const mainButtonVariants = {
    initial: { 
      scale: 0, 
      opacity: 0,
      rotate: -180,
    },
    animate: { 
      scale: 1, 
      opacity: 1,
      rotate: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 400,
        damping: 20,
        delay: 0.3,
      },
    },
    tap: { scale: 0.95 },
    hover: { scale: 1.05 },
  };

  const handleActionClick = (action: FABAction) => {
    hapticSuccess();
    action.onClick();
    setIsOpen(false);
  };

  const handleFabClick = () => {
    // Don't open if this was a long press
    if (isLongPress.current) {
      isLongPress.current = false;
      return;
    }
    hapticImpact();
    setIsOpen(true);
  };

  const handleFabToggle = () => {
    // Don't toggle if this was a long press
    if (isLongPress.current) {
      isLongPress.current = false;
      return;
    }
    hapticImpact();
    setIsOpen(!isOpen);
  };

  // Keyboard shortcuts for desktop (1-9 to trigger actions, Escape to close)
  useEffect(() => {
    if (isMobile) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key closes the FAB
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        return;
      }

      // Number keys trigger actions when FAB is open
      if (isOpen && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const keyNum = parseInt(e.key);
        if (keyNum >= 1 && keyNum <= actions.length) {
          e.preventDefault();
          handleActionClick(actions[keyNum - 1]);
        }
      }

      // Space or Enter opens FAB when it's focused
      if ((e.key === ' ' || e.key === 'Enter') && !isOpen) {
        const activeElement = document.activeElement;
        if (activeElement?.closest('[data-fab-trigger]')) {
          e.preventDefault();
          setIsOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMobile, actions]);

  // Preview tooltip component for long-press
  const PreviewTooltip = () => (
    <AnimatePresence>
      {showPreview && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute bottom-full right-0 mb-3 pointer-events-none"
        >
          <div className="bg-background/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl p-3 min-w-[200px]">
            <p className="text-xs text-muted-foreground mb-2 text-center font-medium">
              Quick Actions Preview
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {actions.map((action, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ 
                    opacity: 1, 
                    scale: 1,
                    transition: { delay: index * 0.05 }
                  }}
                  className="flex flex-col items-center gap-1"
                >
                  <div className={cn(
                    "p-2.5 rounded-xl",
                    action.variant === 'destructive'
                      ? "bg-destructive/10 text-destructive"
                      : "bg-primary/10 text-primary"
                  )}>
                    <action.icon className="h-4 w-4" />
                  </div>
                  <span className="text-[10px] text-muted-foreground max-w-[60px] text-center truncate">
                    {action.label}
                  </span>
                </motion.div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-2 text-center">
              Release to dismiss • Tap to open
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Mobile: Use bottom sheet drawer with swipeable actions
  if (isMobile) {
    return (
      <>
        <div className={cn('fixed z-50', positionClasses[position], className)}>
          <PreviewTooltip />
          <motion.div
            variants={mainButtonVariants}
            initial="initial"
            animate="animate"
            whileTap="tap"
            whileHover="hover"
          >
            <Button
              size="icon"
              className={cn(
                "h-14 w-14 rounded-full shadow-xl hover:shadow-2xl transition-all duration-300",
                "bg-primary hover:bg-primary/90",
                isOpen && "bg-destructive hover:bg-destructive/90"
              )}
              onClick={handleFabClick}
              onPointerDown={startLongPress}
              onPointerUp={endLongPress}
              onPointerLeave={endLongPress}
              onPointerCancel={endLongPress}
            >
              <Plus className="h-6 w-6" />
            </Button>
          </motion.div>
        </div>

        <Drawer open={isOpen} onOpenChange={setIsOpen}>
          <DrawerContent className="pb-8">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-center">Quick Actions</DrawerTitle>
              <p className="text-xs text-muted-foreground text-center mt-1">
                Swipe right on any action to activate
              </p>
            </DrawerHeader>
            <div className="px-4 pb-4 space-y-2">
              {actions.map((action, index) => (
                <SwipeableAction
                  key={index}
                  action={action}
                  index={index}
                  onAction={() => handleActionClick(action)}
                />
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  // Desktop: Use expanding menu
  return (
    <div className={cn('fixed z-50', positionClasses[position], className)}>
      {/* Long-press preview tooltip */}
      <PreviewTooltip />
      {/* Action buttons */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute bottom-16 right-0 flex flex-col-reverse gap-3 items-end"
          >
            {actions.map((action, index) => (
              <motion.div
                key={index}
                variants={actionVariants}
                className="flex items-center gap-3"
              >
                <motion.span
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className="px-3 py-1.5 bg-background/95 backdrop-blur-sm border border-border rounded-lg text-sm font-medium shadow-lg whitespace-nowrap flex items-center gap-2"
                >
                  {action.label}
                  <kbd className="hidden md:inline-flex items-center justify-center h-5 w-5 text-[10px] font-mono bg-muted rounded border border-border/50">
                    {index + 1}
                  </kbd>
                </motion.span>
                <Button
                  size="icon"
                  variant={action.variant || 'secondary'}
                  className="h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-shadow relative"
                  onClick={() => handleActionClick(action)}
                >
                  <action.icon className="h-5 w-5" />
                </Button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main FAB button */}
      <motion.div
        variants={mainButtonVariants}
        initial="initial"
        animate="animate"
        whileTap="tap"
        whileHover="hover"
      >
        <Button
          size="icon"
          data-fab-trigger
          className={cn(
            "h-14 w-14 rounded-full shadow-xl hover:shadow-2xl transition-all duration-300",
            "bg-primary hover:bg-primary/90",
            isOpen && "bg-destructive hover:bg-destructive/90"
          )}
          onClick={handleFabToggle}
          onPointerDown={startLongPress}
          onPointerUp={endLongPress}
          onPointerLeave={endLongPress}
          onPointerCancel={endLongPress}
          aria-label={isOpen ? "Close quick actions" : "Open quick actions"}
          aria-expanded={isOpen}
        >
          <motion.div
            animate={{ rotate: isOpen ? 45 : 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            {isOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Plus className="h-6 w-6" />
            )}
          </motion.div>
        </Button>
      </motion.div>

      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/20 backdrop-blur-[2px] -z-10"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

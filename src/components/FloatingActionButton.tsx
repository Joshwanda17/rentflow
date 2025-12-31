import { useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Plus, X, LucideIcon, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

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

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 80;
    if (Math.abs(info.offset.x) > threshold) {
      onAction();
    }
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
        onClick={onAction}
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
  const isMobile = useIsMobile();

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
    action.onClick();
    setIsOpen(false);
  };

  // Mobile: Use bottom sheet drawer with swipeable actions
  if (isMobile) {
    return (
      <>
        <div className={cn('fixed z-50', positionClasses[position], className)}>
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
              onClick={() => setIsOpen(true)}
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
                  className="px-3 py-1.5 bg-background/95 backdrop-blur-sm border border-border rounded-lg text-sm font-medium shadow-lg whitespace-nowrap"
                >
                  {action.label}
                </motion.span>
                <Button
                  size="icon"
                  variant={action.variant || 'secondary'}
                  className="h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-shadow"
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
          className={cn(
            "h-14 w-14 rounded-full shadow-xl hover:shadow-2xl transition-all duration-300",
            "bg-primary hover:bg-primary/90",
            isOpen && "bg-destructive hover:bg-destructive/90"
          )}
          onClick={() => setIsOpen(!isOpen)}
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

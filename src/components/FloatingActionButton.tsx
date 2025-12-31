import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, LucideIcon } from 'lucide-react';
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

  // Mobile: Use bottom sheet drawer
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
            </DrawerHeader>
            <div className="px-4 pb-4">
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: { staggerChildren: 0.05 },
                  },
                }}
                className="grid grid-cols-2 gap-3"
              >
                {actions.map((action, index) => (
                  <motion.button
                    key={index}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { 
                        opacity: 1, 
                        y: 0,
                        transition: {
                          type: 'spring',
                          stiffness: 400,
                          damping: 25,
                        },
                      },
                    }}
                    onClick={() => handleActionClick(action)}
                    className={cn(
                      "flex flex-col items-center gap-3 p-4 rounded-2xl",
                      "bg-secondary/50 hover:bg-secondary",
                      "border border-border/50 hover:border-primary/30",
                      "transition-all duration-200 active:scale-95"
                    )}
                  >
                    <div className={cn(
                      "p-3 rounded-xl",
                      action.variant === 'destructive' 
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary"
                    )}>
                      <action.icon className="h-6 w-6" />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {action.label}
                    </span>
                  </motion.button>
                ))}
              </motion.div>
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

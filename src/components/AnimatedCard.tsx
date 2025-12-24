import { motion, HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedCardProps extends HTMLMotionProps<'div'> {
  delay?: number;
  variant?: 'default' | 'elevated' | 'glass';
}

const AnimatedCard = forwardRef<HTMLDivElement, AnimatedCardProps>(
  ({ className, delay = 0, variant = 'default', children, ...props }, ref) => {
    const variantClasses = {
      default: 'bg-card border border-border/50 rounded-xl',
      elevated: 'bg-card border border-border/50 rounded-xl shadow-lg shadow-primary/5',
      glass: 'bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl',
    };

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 25,
          delay,
        }}
        whileHover={{
          y: -2,
          transition: { type: 'spring', stiffness: 400, damping: 25 },
        }}
        className={cn(variantClasses[variant], className)}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

AnimatedCard.displayName = 'AnimatedCard';

export default AnimatedCard;

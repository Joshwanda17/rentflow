import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedListProps {
  children: ReactNode[];
  className?: string;
  staggerDelay?: number;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 25,
    },
  },
};

export default function AnimatedList({ children, className, staggerDelay }: AnimatedListProps) {
  const customContainer = staggerDelay
    ? {
        ...containerVariants,
        visible: {
          ...containerVariants.visible,
          transition: {
            ...containerVariants.visible.transition,
            staggerChildren: staggerDelay,
          },
        },
      }
    : containerVariants;

  return (
    <motion.div
      variants={customContainer}
      initial="hidden"
      animate="visible"
      className={cn('space-y-3', className)}
    >
      {children.map((child, index) => (
        <motion.div key={index} variants={itemVariants}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

// Individual animated item for use outside of AnimatedList
export function AnimatedItem({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 25,
        delay,
      }}
    >
      {children}
    </motion.div>
  );
}

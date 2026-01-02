import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

const pageVariants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: -4,
  },
};

const pageTransition = {
  duration: 0.2,
  ease: [0.25, 0.46, 0.45, 0.94] as const,
};

export default function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={pageTransition}
        className="min-h-screen"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// Reusable animation components for micro-interactions
export const FadeIn = motion.div;

export const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] },
};

export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

export const scaleOnHover = {
  whileHover: { scale: 1.01 },
  whileTap: { scale: 0.99 },
  transition: { duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] },
};

export const cardHover = {
  whileHover: { 
    y: -2, 
    boxShadow: '0 8px 24px -8px hsl(var(--foreground) / 0.08)',
  },
  transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
};

export const buttonTap = {
  whileTap: { scale: 0.98 },
  transition: { duration: 0.1 },
};

export const slideInFromRight = {
  initial: { x: 24, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: 24, opacity: 0 },
  transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
};

export const slideInFromLeft = {
  initial: { x: -24, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -24, opacity: 0 },
  transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
};

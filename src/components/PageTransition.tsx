import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

const pageVariants = {
  initial: {
    opacity: 0,
    y: 20,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.98,
  },
};

const pageTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 0.8,
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
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
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
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: { type: 'spring', stiffness: 400, damping: 25 },
};

export const cardHover = {
  whileHover: { 
    y: -4, 
    boxShadow: '0 20px 40px -15px hsl(var(--primary) / 0.2)',
  },
  transition: { type: 'spring', stiffness: 300, damping: 25 },
};

export const buttonTap = {
  whileTap: { scale: 0.95 },
  transition: { type: 'spring', stiffness: 500, damping: 30 },
};

export const slideInFromRight = {
  initial: { x: 100, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: 100, opacity: 0 },
  transition: { type: 'spring', stiffness: 300, damping: 30 },
};

export const slideInFromLeft = {
  initial: { x: -100, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -100, opacity: 0 },
  transition: { type: 'spring', stiffness: 300, damping: 30 },
};

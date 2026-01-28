import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

// Simplified page transition using CSS animations instead of framer-motion
// This reduces bundle size and improves performance on mobile
export default function PageTransition({ children }: PageTransitionProps) {
  return (
    <div className="min-h-screen animate-fade-in">
      {children}
    </div>
  );
}

// CSS animation class names for micro-interactions
// Use these with regular div elements instead of motion.div
export const fadeInUp = {
  className: "animate-fade-in",
};

export const staggerContainer = {
  className: "animate-fade-in",
};

export const scaleOnHover = {
  className: "hover:scale-[1.01] active:scale-[0.99] transition-transform duration-150",
};

export const cardHover = {
  className: "hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200",
};

export const buttonTap = {
  className: "active:scale-[0.98] transition-transform duration-100",
};

export const slideInFromRight = {
  className: "animate-slide-in-right",
};

export const slideInFromLeft = {
  className: "animate-fade-in",
};

// Lightweight wrapper that applies animation class
export function FadeIn({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`animate-fade-in ${className}`}>{children}</div>;
}

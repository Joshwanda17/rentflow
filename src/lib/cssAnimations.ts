// Lightweight CSS animation utilities to replace simple framer-motion usage
// Use these Tailwind classes instead of motion.div for simple animations

// Animation class names (defined in index.css)
export const fadeIn = "animate-fade-in";
export const fadeOut = "animate-fade-out";
export const scaleIn = "animate-scale-in";
export const scaleOut = "animate-scale-out";
export const slideUp = "animate-slide-up";
export const slideDown = "animate-slide-down";
export const slideInRight = "animate-slide-in-right";
export const slideOutRight = "animate-slide-out-right";

// Combined animation utilities
export const enter = "animate-enter";
export const exit = "animate-exit";

// Animations object for easy access
export const animations = {
  fadeIn: "animate-fade-in",
  fadeInUp: "animate-fade-in",
  fadeInDown: "animate-fade-in",
  scaleIn: "animate-scale-in",
  slideUp: "animate-slide-up",
  slideDown: "animate-slide-down",
} as const;

// Staggered animation delays for lists
export const staggerDelay = (index: number, baseDelay = 50) => ({
  animationDelay: `${index * baseDelay}ms`,
});

// Simple transition classes
export const transitions = {
  fast: "transition-all duration-150 ease-out",
  normal: "transition-all duration-200 ease-out",
  slow: "transition-all duration-300 ease-out",
  spring: "transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
} as const;

// Hover effects without framer-motion
export const hoverEffects = {
  lift: "hover:-translate-y-1 transition-transform duration-200",
  scale: "hover:scale-105 transition-transform duration-200",
  glow: "hover:shadow-lg hover:shadow-primary/20 transition-shadow duration-200",
  brighten: "hover:brightness-110 transition-all duration-200",
} as const;

// Active/press effects
export const pressEffects = {
  scale: "active:scale-95 transition-transform duration-100",
  dim: "active:opacity-80 transition-opacity duration-100",
} as const;

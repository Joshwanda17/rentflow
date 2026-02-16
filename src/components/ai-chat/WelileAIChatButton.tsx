import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import WelileAIChatDrawer from './WelileAIChatDrawer';

const GeminiSparkle = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14 2C14 2 16.5 9 18.5 11.5C20.5 14 26 14 26 14C26 14 20.5 14 18.5 16.5C16.5 19 14 26 14 26C14 26 11.5 19 9.5 16.5C7.5 14 2 14 2 14C2 14 7.5 14 9.5 11.5C11.5 9 14 2 14 2Z"
      fill="currentColor"
    />
  </svg>
);

export default function WelileAIChatButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.5 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-20 md:bottom-6 right-4 md:right-8 z-[60]",
          "h-14 w-14 md:h-16 md:w-16 rounded-full",
          "bg-gradient-to-br from-primary to-primary/80",
          "text-primary-foreground",
          "shadow-2xl shadow-primary/40",
          "flex items-center justify-center",
          "transition-shadow duration-300",
          "hover:shadow-primary/60 hover:shadow-2xl",
          "focus:outline-none focus:ring-4 focus:ring-primary/50 focus:ring-offset-2",
        )}
        aria-label="Open Welile AI"
      >
        <GeminiSparkle />
        <span className="absolute inset-0 rounded-full bg-primary/20 blur-md -z-10 pointer-events-none" />
      </motion.button>

      <WelileAIChatDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}

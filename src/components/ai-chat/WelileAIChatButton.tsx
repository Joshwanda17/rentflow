import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import WelileAIChatDrawer from './WelileAIChatDrawer';

const GeminiSparkle = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14 2C14 2 16.5 9 18.5 11.5C20.5 14 26 14 26 14C26 14 20.5 14 18.5 16.5C16.5 19 14 26 14 26C14 26 11.5 19 9.5 16.5C7.5 14 2 14 2 14C2 14 7.5 14 9.5 11.5C11.5 9 14 2 14 2Z"
      fill="currentColor"
    />
  </svg>
);

// Inline trigger for embedding in cards (e.g. wallet header)
export function WelileAITrigger() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.15, rotate: 15 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(true)}
        className={cn(
          "h-9 w-9 rounded-full",
          "bg-gradient-to-br from-primary to-primary/80",
          "text-primary-foreground",
          "shadow-lg shadow-primary/30",
          "flex items-center justify-center",
          "transition-shadow duration-200",
          "hover:shadow-primary/50",
        )}
        aria-label="Open Welile AI"
      >
        <GeminiSparkle size={18} />
      </motion.button>
      <WelileAIChatDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}

// Global floating button — visible on all pages
export default function WelileAIChatButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-20 right-4 z-[60]",
          "h-14 w-14 rounded-full",
          "bg-gradient-to-br from-primary via-primary to-purple-400",
          "text-white",
          "shadow-xl shadow-primary/40",
          "flex items-center justify-center",
          "hover:shadow-2xl hover:shadow-primary/50",
          "active:scale-90 transition-all duration-200",
        )}
        whileHover={{ scale: 1.1, rotate: 10 }}
        whileTap={{ scale: 0.9 }}
        animate={{
          boxShadow: [
            "0 10px 25px -5px rgba(var(--primary), 0.4)",
            "0 15px 35px -5px rgba(var(--primary), 0.6)",
            "0 10px 25px -5px rgba(var(--primary), 0.4)",
          ],
        }}
        transition={{ boxShadow: { duration: 2, repeat: Infinity } }}
        aria-label="Open Welile AI"
      >
        <GeminiSparkle size={26} />
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full animate-ping bg-primary/20 pointer-events-none" style={{ animationDuration: '3s' }} />
      </motion.button>
      <WelileAIChatDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}

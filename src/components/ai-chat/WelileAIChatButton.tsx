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

// Default floating button (kept for backward compat but now hidden)
export default function WelileAIChatButton() {
  // No longer renders a floating button — trigger is now in wallet card
  return null;
}

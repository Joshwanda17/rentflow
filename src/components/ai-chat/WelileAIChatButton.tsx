import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import WelileAIChatDrawer from './WelileAIChatDrawer';

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
          "bg-gradient-to-br from-primary via-primary to-primary/70",
          "text-primary-foreground",
          "shadow-2xl shadow-primary/40",
          "flex items-center justify-center",
          "transition-shadow duration-300",
          "hover:shadow-primary/60 hover:shadow-2xl",
          "focus:outline-none focus:ring-4 focus:ring-primary/50 focus:ring-offset-2",
          "border-2 border-primary-foreground/20"
        )}
        aria-label="Open Welile AI"
      >
        <Bot className="h-7 w-7 md:h-8 md:w-8 pointer-events-none" strokeWidth={2} />
        <span className="absolute inset-0 rounded-full bg-primary/20 blur-md -z-10 pointer-events-none" />
      </motion.button>

      <WelileAIChatDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}

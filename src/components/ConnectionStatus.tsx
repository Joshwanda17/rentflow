import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Zap } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';

export const ConnectionStatus = memo(function ConnectionStatus() {
  const { isOnline, isSlowConnection, connectionType } = useOfflineStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground px-4 py-2"
        >
          <div className="container mx-auto flex items-center justify-center gap-2 text-sm font-medium">
            <WifiOff className="w-4 h-4" />
            <span>You're offline. Some features may be limited.</span>
          </div>
        </motion.div>
      )}
      
      {isOnline && isSlowConnection && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-0 left-0 right-0 z-50 bg-warning/90 text-warning-foreground px-4 py-2"
        >
          <div className="container mx-auto flex items-center justify-center gap-2 text-sm font-medium">
            <Zap className="w-4 h-4" />
            <span>Slow connection detected ({connectionType}). Using data-saving mode.</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

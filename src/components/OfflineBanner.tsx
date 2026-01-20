import { WifiOff, CloudOff, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOffline } from '@/contexts/OfflineContext';
import { Button } from '@/components/ui/button';

export function OfflineBanner() {
  const { isOnline, isSlowConnection, pendingSyncCount, syncNow } = useOffline();

  if (isOnline && !isSlowConnection && pendingSyncCount === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="bg-destructive/90 text-destructive-foreground px-4 py-2 flex items-center justify-center gap-2 text-sm"
        >
          <WifiOff className="h-4 w-4" />
          <span>You're offline - viewing cached data</span>
        </motion.div>
      )}

      {isOnline && isSlowConnection && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="bg-yellow-500/90 text-yellow-950 px-4 py-2 flex items-center justify-center gap-2 text-sm"
        >
          <CloudOff className="h-4 w-4" />
          <span>Slow connection - using cached data when possible</span>
        </motion.div>
      )}

      {isOnline && pendingSyncCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="bg-primary/90 text-primary-foreground px-4 py-2 flex items-center justify-center gap-2 text-sm"
        >
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>{pendingSyncCount} pending change{pendingSyncCount > 1 ? 's' : ''} to sync</span>
          <Button 
            size="sm" 
            variant="secondary" 
            className="h-6 px-2 text-xs ml-2"
            onClick={syncNow}
          >
            Sync Now
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

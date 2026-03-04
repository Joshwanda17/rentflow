import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Bell } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/hooks/useAuth';
import { hapticTap } from '@/lib/haptics';
import { FullScreenWalletSheet } from './FullScreenWalletSheet';
import { Badge } from '@/components/ui/badge';
import { fetchPendingCounts } from '@/lib/pendingCountsCache';

export function FloatingWalletButton() {
  const { user } = useAuth();
  const { wallet, loading } = useWallet();
  const [showWallet, setShowWallet] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const fetchPendingCount = useCallback(async () => {
    if (!user) return;
    const counts = await fetchPendingCounts(user.id);
    setPendingCount(counts.moneyRequests);
  }, [user]);

  useEffect(() => {
    fetchPendingCount();
  }, [fetchPendingCount]);

  // Format balance for compact display
  const formatCompact = (amount: number) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(0)}K`;
    }
    return amount.toLocaleString();
  };

  const handleClick = () => {
    hapticTap();
    setShowWallet(true);
  };

  if (!user) return null;

  return (
    <>
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleClick}
        className="fixed bottom-24 sm:bottom-28 left-4 z-40 flex items-center gap-2 px-3 py-2 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-shadow"
        aria-label="Open Wallet"
      >
        <Wallet className="h-4 w-4" />
        {!loading && wallet && (
          <span className="text-xs font-bold">
            {formatCompact(wallet.balance || 0)}
          </span>
        )}
        {pendingCount > 0 && (
          <Badge 
            variant="secondary" 
            className="h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-warning text-warning-foreground animate-pulse absolute -top-1 -right-1"
          >
            {pendingCount}
          </Badge>
        )}
      </motion.button>

      <FullScreenWalletSheet 
        open={showWallet} 
        onOpenChange={setShowWallet} 
      />
    </>
  );
}

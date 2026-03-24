import { useState, useEffect, useCallback } from 'react';
import { Wallet } from 'lucide-react';

import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/hooks/useAuth';
import { hapticTap } from '@/lib/haptics';
import { FullScreenWalletSheet } from './FullScreenWalletSheet';
import { Badge } from '@/components/ui/badge';
import { fetchPendingCounts } from '@/lib/pendingCountsCache';
import { getBalanceDotClass } from '@/lib/walletUtils';

export function FloatingWalletButton() {
  const { user } = useAuth();
  const { wallet, loading } = useWallet();
  const [showWallet, setShowWallet] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const fetchPendingCount = useCallback(async () => {
    if (!user) return;
    const counts = await fetchPendingCounts(user.id);
    setPendingCount(counts.moneyRequests + counts.agentRentRequests);
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

  const balance = wallet?.balance || 0;
  const dotColor = getBalanceDotClass(balance);

  return (
    <>
      <button
        onClick={handleClick}
        className="fixed bottom-24 sm:bottom-28 left-4 z-40 flex items-center gap-4 px-10 py-6 rounded-full bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-xl shadow-purple-500/30 hover:shadow-2xl hover:shadow-purple-500/40 hover:scale-105 active:scale-95 transition-all animate-scale-in"
        aria-label="Open Rent Money"
      >
        <span className={`inline-block h-5 w-5 rounded-full ${dotColor}`} />
        <Wallet className="h-10 w-10" />
        {wallet && (
          <span className="text-xl font-bold">
            {formatCompact(balance)}
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
      </button>

      <FullScreenWalletSheet 
        open={showWallet} 
        onOpenChange={setShowWallet} 
      />
    </>
  );
}

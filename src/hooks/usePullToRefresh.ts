import { useState, useRef, useCallback, TouchEvent } from 'react';
import { hapticSuccess, hapticSelection, hapticImpact } from '@/lib/haptics';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
}

interface PullToRefreshState {
  isPulling: boolean;
  isRefreshing: boolean;
  pullDistance: number;
  canRefresh: boolean;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPull = 120,
}: UsePullToRefreshOptions) {
  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0,
    canRefresh: false,
  });

  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const isAtTop = useRef<boolean>(true);
  const hasTriggeredThresholdHaptic = useRef<boolean>(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Check if we're at the top of the scroll container
    const scrollTop = (e.currentTarget as HTMLElement).scrollTop;
    isAtTop.current = scrollTop <= 0;
    
    if (isAtTop.current && !state.isRefreshing) {
      startY.current = e.touches[0].clientY;
      hasTriggeredThresholdHaptic.current = false;
      setState(prev => ({ ...prev, isPulling: true }));
    }
  }, [state.isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!state.isPulling || state.isRefreshing || !isAtTop.current) return;

    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;

    // Only allow pulling down
    if (diff < 0) {
      setState(prev => ({ ...prev, pullDistance: 0, canRefresh: false }));
      return;
    }

    // Apply resistance to make it feel more natural
    const resistance = 0.5;
    const pullDistance = Math.min(diff * resistance, maxPull);
    const canRefresh = pullDistance >= threshold;

    // Trigger haptic when crossing threshold (ready to refresh)
    if (canRefresh && !hasTriggeredThresholdHaptic.current) {
      hasTriggeredThresholdHaptic.current = true;
      hapticImpact();
    } else if (!canRefresh && hasTriggeredThresholdHaptic.current) {
      // Reset if pulled back below threshold
      hasTriggeredThresholdHaptic.current = false;
    }

    setState(prev => ({
      ...prev,
      pullDistance,
      canRefresh,
    }));
  }, [state.isPulling, state.isRefreshing, threshold, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!state.isPulling) return;

    if (state.canRefresh && !state.isRefreshing) {
      // Haptic when starting refresh
      hapticSelection();
      
      setState(prev => ({
        ...prev,
        isPulling: false,
        isRefreshing: true,
        pullDistance: threshold * 0.6, // Keep indicator visible during refresh
      }));

      try {
        await onRefresh();
        // Success haptic when refresh completes
        hapticSuccess();
      } finally {
        setState({
          isPulling: false,
          isRefreshing: false,
          pullDistance: 0,
          canRefresh: false,
        });
      }
    } else {
      setState({
        isPulling: false,
        isRefreshing: false,
        pullDistance: 0,
        canRefresh: false,
      });
    }
  }, [state.isPulling, state.canRefresh, state.isRefreshing, threshold, onRefresh]);

  return {
    ...state,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    progress: Math.min((state.pullDistance / threshold) * 100, 100),
  };
}

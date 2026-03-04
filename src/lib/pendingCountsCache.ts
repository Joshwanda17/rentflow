import { supabase } from '@/integrations/supabase/client';

// Module-level cache for pending counts to prevent duplicate fetches
// across multiple wallet components on the same page
let pendingCountsCache: {
  userId: string;
  moneyRequests: number;
  deposits: number;
  withdrawals: number;
  timestamp: number;
} | null = null;

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function fetchPendingCounts(userId: string) {
  // Return cached if fresh
  if (
    pendingCountsCache &&
    pendingCountsCache.userId === userId &&
    Date.now() - pendingCountsCache.timestamp < CACHE_TTL
  ) {
    return {
      moneyRequests: pendingCountsCache.moneyRequests,
      deposits: pendingCountsCache.deposits,
      withdrawals: pendingCountsCache.withdrawals,
    };
  }

  const [moneyRes, depositRes, withdrawRes] = await Promise.all([
    supabase
      .from('money_requests')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('status', 'pending'),
    supabase
      .from('deposit_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending'),
    supabase
      .from('withdrawal_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending'),
  ]);

  const result = {
    moneyRequests: moneyRes.count || 0,
    deposits: depositRes.count || 0,
    withdrawals: withdrawRes.count || 0,
  };

  pendingCountsCache = {
    userId,
    ...result,
    timestamp: Date.now(),
  };

  return result;
}

export function invalidatePendingCountsCache() {
  pendingCountsCache = null;
}

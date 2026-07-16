import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface KycLimits {
  kyc_level: number;
  frozen: boolean;
  daily_withdrawal_cap_ugx: number;
  daily_withdrawal_count_cap: number;
  max_single_transfer_ugx: number;
  can_register_merchant: boolean;
  can_be_agent: boolean;
  can_high_value_transfer: boolean;
}

export interface KycUsageToday {
  amount: number;
  count: number;
  remainingAmount: number;
  remainingCount: number;
}

/**
 * Live KYC caps + today's withdrawal usage for the signed-in user.
 * Backed by the get_kyc_effective_limits RPC and a lightweight
 * withdrawal_requests aggregation.
 */
export function useKycLimits() {
  const { user } = useAuth();
  const [limits, setLimits] = useState<KycLimits | null>(null);
  const [usage, setUsage] = useState<KycUsageToday | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: limRows } = await supabase.rpc('get_kyc_effective_limits', { p_user_id: user.id });
      const lim = Array.isArray(limRows) ? (limRows[0] as KycLimits | undefined) : (limRows as KycLimits | null);

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { data: rows } = await supabase
        .from('withdrawal_requests')
        .select('amount,status')
        .eq('user_id', user.id)
        .gte('created_at', startOfDay.toISOString());

      const active = (rows ?? []).filter(
        (r: { status: string | null }) => !['rejected', 'cancelled', 'failed'].includes(r.status ?? '')
      );
      const amount = active.reduce((s: number, r: { amount: number | null }) => s + Number(r.amount ?? 0), 0);
      const count = active.length;

      if (lim) {
        setLimits(lim);
        setUsage({
          amount,
          count,
          remainingAmount: Math.max(0, Number(lim.daily_withdrawal_cap_ugx) - amount),
          remainingCount: Math.max(0, Number(lim.daily_withdrawal_count_cap) - count),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const canWithdraw = useCallback(
    (amount: number): { ok: boolean; reason?: string } => {
      if (!limits || !usage) return { ok: false, reason: 'Checking limits...' };
      if (limits.frozen) return { ok: false, reason: 'Account frozen pending review. Contact support.' };
      if (usage.remainingCount <= 0) {
        return {
          ok: false,
          reason: `KYC Level ${limits.kyc_level} allows only ${limits.daily_withdrawal_count_cap} withdrawal(s) per day. Verify identity to raise limits.`,
        };
      }
      if (amount > usage.remainingAmount) {
        return {
          ok: false,
          reason: `Only UGX ${usage.remainingAmount.toLocaleString()} remaining today at KYC Level ${limits.kyc_level}. Verify identity to raise limits.`,
        };
      }
      return { ok: true };
    },
    [limits, usage]
  );

  return { limits, usage, loading, refresh: fetchAll, canWithdraw };
}
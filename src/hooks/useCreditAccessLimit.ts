import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CreditAccessLimit {
  totalLimit: number;
  baseLimit: number;
  bonusFromRatings: number;
  bonusFromReceipts: number;
  bonusFromRentHistory: number;
  bonusFromLandlordRent: number;
  bonusFromHousesListed: number;
  bonusFromPartnersOnboarded: number;
}

const MIN_LIMIT = 30_000;

// Fixed display exchange rates (approximate)
const EXCHANGE_RATES: Record<string, number> = {
  UGX: 1,
  USD: 3750,
  EUR: 4100,
  GBP: 4750,
  KES: 29,
  TZS: 1.5,
  ZAR: 210,
};

export function convertFromUGX(amountUGX: number, currency: string): number {
  const rate = EXCHANGE_RATES[currency] || 1;
  return Math.round((amountUGX / rate) * 100) / 100;
}

export function formatCreditAmount(amountUGX: number, currency: string = 'UGX'): string {
  if (currency === 'UGX') {
    if (amountUGX >= 1_000_000) return `UGX ${(amountUGX / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (amountUGX >= 1_000) return `UGX ${(amountUGX / 1_000).toFixed(0)}K`;
    return `UGX ${amountUGX.toLocaleString()}`;
  }
  const converted = convertFromUGX(amountUGX, currency);
  const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', KES: 'KES ', TZS: 'TZS ', ZAR: 'R' };
  const sym = symbols[currency] || `${currency} `;
  return `${sym}${converted.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export const SUPPORTED_DISPLAY_CURRENCIES = Object.keys(EXCHANGE_RATES);

// Module-level cache to prevent duplicate RPC calls across component instances
const limitCache = new Map<string, { data: CreditAccessLimit; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export function useCreditAccessLimit(userId: string | undefined) {
  const cached = userId ? limitCache.get(userId) : undefined;
  const [limit, setLimit] = useState<CreditAccessLimit>(
    cached && (Date.now() - cached.timestamp < CACHE_TTL)
    ? cached.data
    : {
          totalLimit: MIN_LIMIT,
          baseLimit: MIN_LIMIT,
          bonusFromRatings: 0,
          bonusFromReceipts: 0,
          bonusFromRentHistory: 0,
          bonusFromLandlordRent: 0,
          bonusFromHousesListed: 0,
          bonusFromPartnersOnboarded: 0,
        }
  );
  const [loading, setLoading] = useState(!cached || (Date.now() - (cached?.timestamp ?? 0)) >= CACHE_TTL);

  const fetchLimit = useCallback(async () => {
    if (!userId) return;

    // Check module-level cache first
    const existing = limitCache.get(userId);
    if (existing && (Date.now() - existing.timestamp < CACHE_TTL)) {
      setLimit(existing.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Recalculate and fetch in one go
      await supabase.rpc('recalculate_credit_limit', { p_user_id: userId });
      
      const { data } = await supabase
        .from('credit_access_limits')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (data) {
        const parsed: CreditAccessLimit = {
          totalLimit: Number(data.total_limit) || MIN_LIMIT,
          baseLimit: Number(data.base_limit) || MIN_LIMIT,
          bonusFromRatings: Number(data.bonus_from_ratings) || 0,
          bonusFromReceipts: Number(data.bonus_from_receipts) || 0,
          bonusFromRentHistory: Number(data.bonus_from_rent_history) || 0,
          bonusFromLandlordRent: Number(data.bonus_from_landlord_rent) || 0,
          bonusFromHousesListed: Number((data as any).bonus_from_houses_listed) || 0,
          bonusFromPartnersOnboarded: Number((data as any).bonus_from_partners_onboarded) || 0,
        };
        setLimit(parsed);
        limitCache.set(userId, { data: parsed, timestamp: Date.now() });
      }
    } catch (err) {
      console.error('[useCreditAccessLimit] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchLimit();
  }, [fetchLimit]);

  return { limit, loading, refreshLimit: fetchLimit };
}

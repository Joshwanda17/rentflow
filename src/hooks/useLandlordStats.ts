import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LandlordStats {
  totalProperties: number;
  emptyHouses: number;
  totalRentReceivable: number;
}

export function useLandlordStats(userId: string | undefined) {
  const [stats, setStats] = useState<LandlordStats>({
    totalProperties: 0,
    emptyHouses: 0,
    totalRentReceivable: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('landlords')
        .select('id, tenant_id, monthly_rent, desired_rent_from_welile, verified')
        .eq('registered_by', userId);

      if (error) {
        console.error('Error fetching landlord stats:', error);
        return;
      }

      const properties = data || [];
      const totalProperties = properties.length;
      const emptyHouses = properties.filter(p => !p.tenant_id).length;
      const totalRentReceivable = properties.reduce((sum, p) => {
        const rent = p.desired_rent_from_welile || p.monthly_rent || 0;
        return sum + rent;
      }, 0);

      setStats({ totalProperties, emptyHouses, totalRentReceivable });
    } catch (err) {
      console.error('Error fetching landlord stats:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, refreshStats: fetchStats };
}

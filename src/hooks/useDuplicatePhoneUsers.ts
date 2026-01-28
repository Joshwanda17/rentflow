import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DuplicatePhoneData {
  duplicateUserIds: Set<string>;
  duplicateCount: number;
  duplicateGroups: Map<string, string[]>; // normalized phone -> user IDs
  loading: boolean;
  refetch: () => Promise<void>;
}

// Normalize phone to last 9 digits for comparison
const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-9);
};

export function useDuplicatePhoneUsers(): DuplicatePhoneData {
  const [duplicateUserIds, setDuplicateUserIds] = useState<Set<string>>(new Set());
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [duplicateGroups, setDuplicateGroups] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchDuplicates = useCallback(async () => {
    setLoading(true);
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, phone');

      if (error) {
        console.error('Error fetching profiles for duplicate check:', error);
        return;
      }

      if (!profiles || profiles.length === 0) {
        setDuplicateUserIds(new Set());
        setDuplicateCount(0);
        setDuplicateGroups(new Map());
        return;
      }

      // Group users by normalized phone number
      const phoneGroups = new Map<string, string[]>();
      
      profiles.forEach(profile => {
        if (!profile.phone) return;
        
        const normalized = normalizePhone(profile.phone);
        if (normalized.length < 9) return; // Skip invalid phones
        
        const existing = phoneGroups.get(normalized) || [];
        existing.push(profile.id);
        phoneGroups.set(normalized, existing);
      });

      // Find duplicates (groups with more than 1 user)
      const duplicates = new Set<string>();
      const duplicateGroupsMap = new Map<string, string[]>();
      let count = 0;

      phoneGroups.forEach((userIds, phone) => {
        if (userIds.length > 1) {
          userIds.forEach(id => duplicates.add(id));
          duplicateGroupsMap.set(phone, userIds);
          count += userIds.length;
        }
      });

      setDuplicateUserIds(duplicates);
      setDuplicateCount(count);
      setDuplicateGroups(duplicateGroupsMap);
    } catch (err) {
      console.error('Error detecting duplicate phones:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDuplicates();
  }, [fetchDuplicates]);

  return {
    duplicateUserIds,
    duplicateCount,
    duplicateGroups,
    loading,
    refetch: fetchDuplicates,
  };
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Extract last 9 digits for Uganda phone comparison
const getLocal9 = (phone: string): string | null => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9) return null;
  return digits.slice(-9);
};

interface DuplicateCheckResult {
  isDuplicate: boolean;
  isChecking: boolean;
  duplicateMessage: string | null;
}

export function usePhoneDuplicateCheck(phone: string, debounceMs: number = 500): DuplicateCheckResult {
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);

  const checkDuplicate = useCallback(async (phoneNumber: string) => {
    const local9 = getLocal9(phoneNumber);
    if (!local9) {
      setIsDuplicate(false);
      setDuplicateMessage(null);
      return;
    }

    setIsChecking(true);
    try {
      // Check profiles table
      const { data: profileMatches } = await supabase
        .from('profiles')
        .select('id, phone, full_name')
        .ilike('phone', `%${local9}%`)
        .limit(10);

      // Check for exact last-9 match in profiles
      const profileMatch = profileMatches?.find(p => {
        const pLocal9 = getLocal9(p.phone || '');
        return pLocal9 === local9;
      });

      if (profileMatch) {
        setIsDuplicate(true);
        setDuplicateMessage(`This number is already registered to ${profileMatch.full_name || 'another user'}`);
        setIsChecking(false);
        return;
      }

      // Check pending invites
      const { data: inviteMatches } = await supabase
        .from('supporter_invites')
        .select('id, phone, full_name')
        .eq('status', 'pending')
        .ilike('phone', `%${local9}%`)
        .limit(10);

      const inviteMatch = inviteMatches?.find(i => {
        const iLocal9 = getLocal9(i.phone || '');
        return iLocal9 === local9;
      });

      if (inviteMatch) {
        setIsDuplicate(true);
        setDuplicateMessage(`A pending invite already exists for ${inviteMatch.full_name || 'this number'}`);
        setIsChecking(false);
        return;
      }

      // No duplicates found
      setIsDuplicate(false);
      setDuplicateMessage(null);
    } catch (error) {
      console.error('Error checking phone duplicate:', error);
      setIsDuplicate(false);
      setDuplicateMessage(null);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    const cleanedPhone = phone.replace(/\D/g, '');
    
    // Only check if we have at least 9 digits
    if (cleanedPhone.length < 9) {
      setIsDuplicate(false);
      setDuplicateMessage(null);
      return;
    }

    const timeoutId = setTimeout(() => {
      checkDuplicate(phone);
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [phone, debounceMs, checkDuplicate]);

  return { isDuplicate, isChecking, duplicateMessage };
}

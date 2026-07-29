// src/components/manager/staff-access/useStaffAccess.ts
//
// Data for the staff access panel. Reads only — every write lives in
// StaffAccessDetail so there is one place to look when a change is refused.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { STAFF_ROLES } from './roleCatalog';

export interface Person {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface RoleRow {
  id: string;
  role: string;
  enabled: boolean | null;
}

/**
 * With fewer than three characters typed, lists everyone who already holds a
 * staff role. Past that, searches every profile so a first staff role can be
 * given to someone new.
 */
export function usePeopleSearch(open: boolean, query: string) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: roleData, error: roleErr } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', STAFF_ROLES as unknown as string[]);

    if (roleErr) {
      setError(roleErr.message);
      setLoading(false);
      return;
    }

    const ids = [...new Set((roleData ?? []).map((r) => r.user_id))];
    if (ids.length === 0) {
      setPeople([]);
      setLoading(false);
      return;
    }

    const { data, error: profErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .in('id', ids)
      .order('full_name');

    if (profErr) setError(profErr.message);
    else setPeople(data ?? []);
    setLoading(false);
  }, []);

  const searchAll = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    const like = `%${q}%`;

    const { data, error: searchErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .order('full_name')
      .limit(40);

    if (searchErr) setError(searchErr.message);
    else setPeople(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const timer = setTimeout(() => {
      if (q.length >= 3) void searchAll(q);
      else void loadStaff();
    }, 300);
    return () => clearTimeout(timer);
  }, [open, query, searchAll, loadStaff]);

  return { people, loading, error };
}

/** Every role row for one person, including rows already disabled. */
export function useUserRoles(userId: string | null) {
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    void supabase
      .from('user_roles')
      .select('id, role, enabled')
      .eq('user_id', userId)
      .then(({ data, error: roleErr }) => {
        if (cancelled) return;
        if (roleErr) {
          setError(roleErr.message);
          setRows([]);
        } else {
          setRows((data ?? []) as RoleRow[]);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { rows, setRows, loading, error };
}

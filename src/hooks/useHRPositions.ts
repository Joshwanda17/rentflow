import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface HRPositionRow {
  id: string;
  title: string;
  key: string;
  active: boolean;
  department_id: string | null;
}

export interface HRPositionDepartment {
  id: string;
  name: string;
  active: boolean;
}

export interface HRPositionAccessLabel {
  dashboard_key: string;
  role: string;
}

export const slugifyPositionKey = (title: string) =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const POSITIONS_KEY = ['hr-roles', 'positions'];
const DEPARTMENTS_KEY = ['hr-roles', 'departments'];
const HELD_BY_KEY = ['hr-roles', 'held-by'];
const ACCESS_KEY = ['hr-roles', 'access'];

export function useHRPositions() {
  const queryClient = useQueryClient();

  const refetchAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: POSITIONS_KEY }),
      queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEY }),
      queryClient.invalidateQueries({ queryKey: HELD_BY_KEY }),
      queryClient.invalidateQueries({ queryKey: ACCESS_KEY }),
    ]);
  };

  const positionsQuery = useQuery({
    queryKey: POSITIONS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_positions')
        .select('id, title, key, active, department_id')
        .order('title');
      if (error) throw error;
      return (data || []) as HRPositionRow[];
    },
  });

  const departmentsQuery = useQuery({
    queryKey: DEPARTMENTS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_departments')
        .select('id, name, active')
        .order('name');
      if (error) throw error;
      return (data || []) as HRPositionDepartment[];
    },
  });

  // READ ONLY: how many people currently hold each position.
  const heldByQuery = useQuery({
    queryKey: HELD_BY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_assignments')
        .select('position_id')
        .is('ended_on', null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        if (row.position_id) counts[row.position_id] = (counts[row.position_id] || 0) + 1;
      });
      return counts;
    },
  });

  // READ ONLY: what a title grants once assigned.
  const accessQuery = useQuery({
    queryKey: ACCESS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_position_access')
        .select('position_id, dashboard_key, role');
      if (error) throw error;
      const map: Record<string, HRPositionAccessLabel[]> = {};
      (data || []).forEach((row: any) => {
        if (!row.position_id) return;
        map[row.position_id] = map[row.position_id] || [];
        map[row.position_id].push({ dashboard_key: row.dashboard_key, role: row.role });
      });
      return map;
    },
  });

  const describeError = (error: any) => {
    if (error?.code === '23505' || String(error?.message || '').includes('duplicate key')) {
      return null;
    }
    return error?.message || 'Operation failed';
  };

  const addPosition = useMutation({
    mutationFn: async ({ title, departmentId }: { title: string; departmentId: string | null }) => {
      const cleanTitle = title.trim();
      if (!cleanTitle) throw new Error('Title is required');
      const key = slugifyPositionKey(cleanTitle);
      if (!key) throw new Error('Title must contain letters or numbers');
      const { error } = await supabase
        .from('hr_positions')
        .insert({ title: cleanTitle, key, department_id: departmentId });
      if (error) {
        if (describeError(error) === null) {
          throw new Error(`a role with this key already exists: ${key}`);
        }
        throw error;
      }
    },
    onSuccess: refetchAll,
  });

  const renamePosition = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const cleanTitle = title.trim();
      if (!cleanTitle) throw new Error('Title is required');
      const { error } = await supabase.from('hr_positions').update({ title: cleanTitle }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refetchAll,
  });

  const movePosition = useMutation({
    mutationFn: async ({ id, departmentId }: { id: string; departmentId: string | null }) => {
      const { error } = await supabase
        .from('hr_positions')
        .update({ department_id: departmentId })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: refetchAll,
  });

  const setPositionActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('hr_positions').update({ active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refetchAll,
  });

  return {
    positions: positionsQuery.data || [],
    departments: departmentsQuery.data || [],
    heldBy: heldByQuery.data || {},
    accessByPosition: accessQuery.data || {},
    isLoading:
      positionsQuery.isLoading || departmentsQuery.isLoading || heldByQuery.isLoading || accessQuery.isLoading,
    refetchAll,
    addPosition,
    renamePosition,
    movePosition,
    setPositionActive,
  };
}
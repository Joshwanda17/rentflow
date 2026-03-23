import { supabase } from '@/integrations/supabase/client';

/**
 * Fetch ALL agent IDs, paginating past the 1000-row default limit.
 */
export async function fetchAllAgentIds(): Promise<string[]> {
  return fetchAllUserIdsByRole('agent');
}

/**
 * Fetch ALL user IDs with a given role, paginating past the 1000-row default limit.
 */
export async function fetchAllUserIdsByRole(role: 'agent' | 'ceo' | 'cfo' | 'cmo' | 'coo' | 'crm' | 'cto' | 'employee' | 'landlord' | 'manager' | 'operations' | 'super_admin' | 'supporter' | 'tenant'): Promise<string[]> {
  const allIds: string[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', role)
      .eq('enabled', true)
      .range(offset, offset + PAGE_SIZE - 1);

    if (data && data.length > 0) {
      allIds.push(...data.map(r => r.user_id));
      offset += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allIds;
}

/**
 * Batch IN queries to avoid URL length overflow (PostgREST 400).
 * Calls `fn` with chunks of IDs and merges results.
 */
export async function batchedQuery<T>(
  ids: string[],
  fn: (batch: string[]) => PromiseLike<{ data: T[] | null }>,
  batchSize = 50
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const { data } = await fn(ids.slice(i, i + batchSize));
    if (data) results.push(...data);
  }
  return results;
}

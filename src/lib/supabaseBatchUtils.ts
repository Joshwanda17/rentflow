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

/**
 * Fetch ALL partner/funder IDs — supporters that own at least one portfolio
 * (as `investor_id` OR `agent_id` in `investor_portfolios`, any status).
 * Cached per session to avoid repeated full scans.
 */
let _partnerIdsCache: { ids: string[]; ts: number } | null = null;
const PARTNER_IDS_TTL = 5 * 60 * 1000; // 5 min
export async function fetchAllPartnerIds(): Promise<string[]> {
  if (_partnerIdsCache && Date.now() - _partnerIdsCache.ts < PARTNER_IDS_TTL) {
    return _partnerIdsCache.ids;
  }
  const allSupporterIds = await fetchAllUserIdsByRole('supporter');
  if (allSupporterIds.length === 0) {
    _partnerIdsCache = { ids: [], ts: Date.now() };
    return [];
  }
  const supporterSet = new Set(allSupporterIds);
  const portfolioRows = await batchedQuery<{ investor_id: string | null; agent_id: string }>(
    allSupporterIds,
    (batch) => supabase.from('investor_portfolios')
      .select('investor_id, agent_id')
      .or(`investor_id.in.(${batch.join(',')}),agent_id.in.(${batch.join(',')})`)
  );
  const ownerIds = new Set<string>();
  portfolioRows.forEach(p => {
    if (p.investor_id && supporterSet.has(p.investor_id)) ownerIds.add(p.investor_id);
    else if (p.agent_id && supporterSet.has(p.agent_id)) ownerIds.add(p.agent_id);
  });
  const ids = Array.from(ownerIds);
  _partnerIdsCache = { ids, ts: Date.now() };
  return ids;
}

/**
 * Fetch a paginated page of supporter IDs + total count.
 * Optionally filter by name/phone/email search term (joins profiles).
 *
 * NOTE: "Supporter" here means partner/funder — a supporter that owns at
 * least one portfolio. Plain supporters with zero portfolios are excluded
 * so the Partner Management table (and all its filters) only operate on
 * the partner set.
 */
export async function fetchPaginatedSupporterIds(
  page: number,
  pageSize: number,
  search?: string
): Promise<{ ids: string[]; totalCount: number }> {
  const partnerIds = await fetchAllPartnerIds();
  if (partnerIds.length === 0) return { ids: [], totalCount: 0 };
  const partnerSet = new Set(partnerIds);

  // If searching, do a single broad profile search then intersect with supporter set in memory.
  // This avoids N batched .in() round-trips against profiles (the previous slow path).
  if (search && search.trim().length > 0) {
    const raw = search.trim();
    const q = raw.replace(/[%,]/g, ''); // sanitize PostgREST wildcards/separators
    if (!q) return { ids: [], totalCount: 0 };

    // Single round-trip ilike across profiles (indexed in this project on
    // lower(full_name)/lower(email)) — far cheaper than batched .in()+or().
    const { data: matches } = await supabase
      .from('profiles')
      .select('id')
      .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(2000);

    const matchedIds = (matches || [])
      .map((p: any) => p.id as string)
      .filter(id => partnerSet.has(id));
    const start = page * pageSize;
    return {
      ids: matchedIds.slice(start, start + pageSize),
      totalCount: matchedIds.length,
    };
  }

  // No search: paginate over the in-memory partner ID list (already filtered to ≥1 portfolio)
  const start = page * pageSize;
  return {
    ids: partnerIds.slice(start, start + pageSize),
    totalCount: partnerIds.length,
  };
}

/**
 * Fetch ALL active portfolios with their owner profiles for nearing payout computation.
 * This runs independently of the paginated table view.
 */
export async function fetchAllNearingPayoutPortfolios(): Promise<{
  portfolios: Array<{
    id: string;
    investor_id: string | null;
    agent_id: string;
    investment_amount: number;
    roi_percentage: number;
    payout_day: number;
    roi_mode: string;
    status: string;
    created_at: string;
    next_roi_date: string | null;
    account_name: string | null;
    portfolio_code: string;
  }>;
  profileMap: Map<string, { full_name: string; phone: string; email: string }>;
  supporterIds: Set<string>;
}> {
  // 1. Get all supporter IDs
  const allSupporterIds = await fetchAllUserIdsByRole('supporter');
  if (allSupporterIds.length === 0) {
    return { portfolios: [], profileMap: new Map(), supporterIds: new Set() };
  }

  const supporterIdSet = new Set(allSupporterIds);

  // 2. Fetch ALL active portfolios belonging to supporters
  const portfolios = await batchedQuery<any>(allSupporterIds, (batch) =>
    supabase.from('investor_portfolios')
      .select('id, investor_id, agent_id, investment_amount, roi_percentage, payout_day, roi_mode, status, created_at, next_roi_date, account_name, portfolio_code')
      .or(`investor_id.in.(${batch.join(',')}),agent_id.in.(${batch.join(',')})`)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
  );

  // Dedup
  const seen = new Set<string>();
  const deduped = portfolios.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  // 3. Collect unique owner IDs and fetch profiles
  const ownerIds = new Set<string>();
  deduped.forEach(p => {
    if (p.investor_id && supporterIdSet.has(p.investor_id)) ownerIds.add(p.investor_id);
    else if (p.agent_id && supporterIdSet.has(p.agent_id)) ownerIds.add(p.agent_id);
  });

  const profiles = await batchedQuery<{ id: string; full_name: string; phone: string; email: string }>(
    Array.from(ownerIds),
    (batch) => supabase.from('profiles').select('id, full_name, phone, email').in('id', batch)
  );

  const profileMap = new Map(profiles.map(p => [p.id, p]));

  return { portfolios: deduped, profileMap, supporterIds: supporterIdSet };
}

/**
 * Fetch lightweight summary stats for ALL supporters (count, total funded, etc.)
 * without loading full profile/wallet data.
 */
export async function fetchSupporterSummary(): Promise<{
  totalPartners: number;
  totalFunded: number;
  totalWalletBalance: number;
  totalDeals: number;
  activePartners: number;
  suspendedPartners: number;
}> {
  const allIds = await fetchAllUserIdsByRole('supporter');
  if (allIds.length === 0) {
    return { totalPartners: 0, totalFunded: 0, totalWalletBalance: 0, totalDeals: 0, activePartners: 0, suspendedPartners: 0 };
  }

  const [wallets, portfolioRows, frozenProfiles] = await Promise.all([
    batchedQuery<{ user_id: string; balance: number }>(allIds, (batch) =>
      supabase.from('wallets').select('user_id, balance').in('user_id', batch)
    ),
    batchedQuery<{ investment_amount: number; investor_id: string | null; agent_id: string }>(allIds, (batch) =>
      supabase.from('investor_portfolios')
        .select('investment_amount, investor_id, agent_id')
        .or(`investor_id.in.(${batch.join(',')}),agent_id.in.(${batch.join(',')})`)
        .in('status', ['active', 'pending_approval', 'pending'])
    ),
    batchedQuery<{ id: string; frozen_at: string | null }>(allIds, (batch) =>
      supabase.from('profiles').select('id, frozen_at').in('id', batch).not('frozen_at', 'is', null)
    ),
  ]);

  // A partner/funder is defined as a supporter with 1 or more portfolios
  const ownerIds = new Set<string>();
  portfolioRows.forEach(p => {
    const owner = p.investor_id || p.agent_id;
    if (owner) ownerIds.add(owner);
  });

  const frozenIds = new Set(frozenProfiles.map(p => p.id));
  const suspendedPartners = Array.from(ownerIds).filter(id => frozenIds.has(id)).length;

  const totalWalletBalance = wallets
    .filter(w => ownerIds.has(w.user_id))
    .reduce((s, w) => s + (w.balance || 0), 0);
  const totalFunded = portfolioRows.reduce((s, p) => s + (p.investment_amount || 0), 0);

  return {
    totalPartners: ownerIds.size,
    totalFunded,
    totalWalletBalance,
    totalDeals: portfolioRows.length,
    activePartners: ownerIds.size - suspendedPartners,
    suspendedPartners,
  };
}

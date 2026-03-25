import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserAvatar } from '@/components/UserAvatar';
import { ScrollToTopButton } from '@/components/ScrollToTopButton';
import { Input } from '@/components/ui/input';
import { RequestManagerInvestDialog } from './RequestManagerInvestDialog';
import { CurrencySwitcher } from '@/components/CurrencySwitcher';
import { useCurrency } from '@/hooks/useCurrency';
import { ContactActionsBar } from '@/components/chat/ContactActionsBar';
import { WhatsAppRequestButton } from '@/components/chat/WhatsAppRequestButton';
import { UserProfileDialog } from './UserProfileDialog';
import { 
  Users, 
  HandCoins, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  Shield,
  UserCheck,
  Building,
  TrendingUp,
  Timer,
  Zap,
  Eye,
  Bell,
  AlertTriangle,
  MessageCircle,
  Phone,
  MapPin,
  CreditCard,
  SortAsc,
  Filter,
  ArrowUpDown,
  Home,
  Bookmark,
  BookmarkCheck,
  CheckCheck,
  RefreshCw,
  Search,
  X,
  UserPlus,
  ChevronRight
} from 'lucide-react';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { playOpportunitySound } from '@/lib/notificationSound';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import { markAllAsSeen, getLastSeenAt, isOpportunityUnseen } from '@/lib/opportunitySeenStorage';
import { getWhatsAppLink } from '@/lib/phoneUtils';

interface RentOpportunity {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  landlord_id: string | null;
  rent_amount: number;
  duration_days: number;
  status: string;
  created_at: string;
  agent_verified: boolean | null;
  agent_verified_at: string | null;
  agent_verified_by: string | null;
  manager_verified: boolean | null;
  manager_verified_at: string | null;
  manager_verified_by: string | null;
  supporter_id: string | null;
  tenant?: {
    id: string;
    full_name: string;
    avatar_url?: string;
    phone?: string;
  };
  postingAgent?: {
    id: string;
    full_name: string;
    phone?: string;
    avatar_url?: string;
  };
  landlord?: {
    id: string;
    name: string;
    phone: string;
    property_address: string;
    bank_name: string;
    account_number: string;
    mobile_money_number: string;
    monthly_rent: number;
    verified: boolean;
    ready_to_receive: boolean;
    user_id?: string;
  };
  agentVerifier?: {
    full_name: string;
  };
  managerVerifier?: {
    full_name: string;
  };
  funder?: {
    full_name: string;
  };
}

type SortOption = 'newest' | 'oldest' | 'amount_high' | 'amount_low';
type FilterOption = 'all' | 'all_users' | 'verified' | 'pending' | 'verifying' | 'watched' | 'unseen' | 'funded' | 'landlord_ready' | 'rejected' | 'ready' | 'agent_posted' | 'all_tenants' | 'all_landlords' | 'all_agents';

interface PotentialTenant {
  id: string;
  full_name: string;
  phone?: string;
  avatar_url?: string;
  created_at: string;
  has_rent_request: boolean;
}

interface PotentialLandlord {
  id: string;
  name: string;
  phone: string;
  property_address: string;
  verified: boolean;
  ready_to_receive: boolean;
  created_at: string;
  has_smartphone: boolean;
  number_of_houses: number;
  desired_rent_from_welile: number;
  electricity_meter_number: string;
  caretaker_name: string;
  caretaker_phone: string;
}

interface PotentialAgent {
  id: string;
  full_name: string;
  phone?: string;
  avatar_url?: string;
  created_at: string;
  city?: string;
  country?: string;
  tenant_count: number;
}

interface RentOpportunitiesProps {
  onFund: (id: string, amount: number) => void;
  isLocked?: boolean;
  onLockedClick?: () => void;
  onRefreshRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  showCounts?: boolean;
}

export function RentOpportunities({ onFund, isLocked, onLockedClick, onRefreshRef, showCounts = true }: RentOpportunitiesProps) {
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();
  const [opportunities, setOpportunities] = useState<RentOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<RentOpportunity | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showLandlordDetails, setShowLandlordDetails] = useState(false);
  const [newOpportunityId, setNewOpportunityId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterBy, setFilterBy] = useState<FilterOption>('all_users');
  
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<Date | null>(getLastSeenAt());
  const [searchQuery, setSearchQuery] = useState('');
  const [showManagerInvestDialog, setShowManagerInvestDialog] = useState(false);
  const [managerInvestAmount, setManagerInvestAmount] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [allTenants, setAllTenants] = useState<PotentialTenant[]>([]);
  const [allLandlords, setAllLandlords] = useState<PotentialLandlord[]>([]);
  const [allAgents, setAllAgents] = useState<PotentialAgent[]>([]);
  const [loadingPotentials, setLoadingPotentials] = useState(false);
  const [loadingMoreUsers, setLoadingMoreUsers] = useState(false);
  const [usersPage, setUsersPage] = useState(0);
  const [hasMoreUsers, setHasMoreUsers] = useState(true);
  const USERS_PAGE_SIZE = 30;
  const usersLoadMoreRef = useRef<HTMLDivElement>(null);
  // Total counts from database (for display before all users are loaded)
  const [totalCounts, setTotalCounts] = useState({ tenants: 0, landlords: 0, agents: 0 });
  const [profileDialogUser, setProfileDialogUser] = useState<{
    id: string;
    name: string;
    avatarUrl?: string;
    type: 'tenant' | 'landlord' | 'agent';
    createdAt?: string;
    phone?: string;
    propertyAddress?: string;
    verified?: boolean;
    readyToReceive?: boolean;
    hasSmartphone?: boolean;
    numberOfHouses?: number;
    desiredRent?: number;
    electricityMeter?: string;
    caretakerName?: string;
    caretakerPhone?: string;
    city?: string;
    country?: string;
    tenantCount?: number;
    hasRentRequest?: boolean;
  } | null>(null);

  // Count unseen opportunities and calculate potential earnings (exclude funded)
  const { unseenCount, unseenPotentialEarnings } = useMemo(() => {
    const unseenOpps = opportunities.filter(opp => 
      opp.status !== 'funded' && (!lastSeenAt || new Date(opp.created_at) > lastSeenAt)
    );
    const totalEarnings = unseenOpps.reduce((sum, opp) => 
      sum + calculateSupporterReward(opp.rent_amount), 0
    );
    return { 
      unseenCount: unseenOpps.length, 
      unseenPotentialEarnings: totalEarnings 
    };
  }, [opportunities, lastSeenAt]);

  const handleMarkAllSeen = () => {
    markAllAsSeen();
    setLastSeenAt(new Date());
    hapticTap();
    // Dispatch custom event for same-tab listeners
    window.dispatchEvent(new Event('opportunities-marked-seen'));
    toast.success('All opportunities marked as seen');
  };

  // Expose refresh function to parent
  useEffect(() => {
    if (onRefreshRef) {
      onRefreshRef.current = async () => {
        await fetchOpportunities();
        await fetchWatchedOpportunities();
      };
    }
    return () => {
      if (onRefreshRef) {
        onRefreshRef.current = null;
      }
    };
  }, [onRefreshRef]);

  useEffect(() => {
    fetchOpportunities();
    fetchWatchedOpportunities();
    fetchAllTenantsAndLandlords();
    // Realtime removed — rent_requests not in realtime whitelist. Pull-to-refresh updates data.
  }, []);

  const fetchWatchedOpportunities = async () => {
    // watched_opportunities table removed - stub
    setWatchedIds(new Set());
  };

  const handleWatch = async (e: React.MouseEvent, opportunityId: string) => {
    e.stopPropagation();
    hapticTap();
    
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      toast.error('Please sign in to watch opportunities');
      return;
    }
    
    setWatchingId(opportunityId);
    const isWatched = watchedIds.has(opportunityId);
    
    if (isWatched) {
      setWatchedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(opportunityId);
        return newSet;
      });
      toast.success('Removed from watchlist');
    } else {
      setWatchedIds(prev => new Set(prev).add(opportunityId));
      toast.success('Added to watchlist');
    }
    setWatchingId(null);
  };

  const fetchOpportunities = async (reset: boolean = true) => {
    if (reset) {
      setLoading(true);
      setPage(0);
    } else {
      setLoadingMore(true);
    }
    
    const currentPage = reset ? 0 : page;
    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    
    // Fetch ALL opportunities regardless of status
    const { data, error } = await supabase
      .from('rent_requests')
      .select(`
        id,
        tenant_id,
        agent_id,
        landlord_id,
        rent_amount,
        duration_days,
        status,
        created_at,
        agent_verified,
        agent_verified_at,
        agent_verified_by,
        manager_verified,
        manager_verified_at,
        manager_verified_by,
        supporter_id,
        landlord:landlords!rent_requests_landlord_id_fkey(id, name, phone, property_address, bank_name, account_number, mobile_money_number, monthly_rent, verified, ready_to_receive)
      `)
      .order('created_at', { ascending: false })
      .range(from, to);

    // Fetch tenant profiles, posting agent profiles, verifier profiles, and funder profiles separately
    if (!error && data) {
      const tenantIds = [...new Set(data.map(r => r.tenant_id).filter(Boolean))];
      const postingAgentIds = [...new Set(data.map(r => r.agent_id).filter(Boolean))] as string[];
      const agentVerifierIds = [...new Set(data.map(r => r.agent_verified_by).filter(Boolean))] as string[];
      const managerVerifierIds = [...new Set(data.map(r => r.manager_verified_by).filter(Boolean))] as string[];
      const supporterIds = [...new Set(data.map(r => r.supporter_id).filter(Boolean))] as string[];
      const allProfileIds = [...new Set([...tenantIds, ...postingAgentIds, ...agentVerifierIds, ...managerVerifierIds, ...supporterIds])];
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, phone')
        .in('id', allProfileIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      const enrichedData = data.map(r => ({
        ...r,
        tenant: profileMap.get(r.tenant_id) || null,
        postingAgent: r.agent_id ? profileMap.get(r.agent_id) : null,
        agentVerifier: r.agent_verified_by ? profileMap.get(r.agent_verified_by) : null,
        managerVerifier: r.manager_verified_by ? profileMap.get(r.manager_verified_by) : null,
        funder: r.supporter_id ? profileMap.get(r.supporter_id) : null
      })) as unknown as RentOpportunity[];

      if (reset) {
        setOpportunities(enrichedData);
      } else {
        setOpportunities(prev => [...prev, ...enrichedData]);
      }
      setHasMore(enrichedData.length === PAGE_SIZE);
      setPage(currentPage + 1);
    }
    setLoading(false);
    setLoadingMore(false);
  };

  // Fetch all tenants and landlords for potential opportunities - with pagination
  const fetchAllTenantsAndLandlords = async (reset: boolean = true) => {
    if (reset) {
      setLoadingPotentials(true);
      setUsersPage(0);
    } else {
      setLoadingMoreUsers(true);
    }
    
    const currentPage = reset ? 0 : usersPage;
    const from = currentPage * USERS_PAGE_SIZE;
    const to = from + USERS_PAGE_SIZE - 1;
    
    try {
      // On first load, get total counts and lookup data once
      let tenantUserIds: string[] = [];
      let tenantIdsWithRequests = new Set<string>();
      let agentUserIds: string[] = [];
      let agentTenantCounts = new Map<string, number>();
      
      if (reset) {
        // Fetch total counts first (for display purposes)
        const [tenantCountResult, landlordCountResult, agentCountResult] = await Promise.all([
          supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'tenant').eq('enabled', true),
          supabase.from('landlords').select('id', { count: 'exact', head: true }),
          supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'agent').eq('enabled', true)
        ]);
        
        setTotalCounts({
          tenants: tenantCountResult.count || 0,
          landlords: landlordCountResult.count || 0,
          agents: agentCountResult.count || 0
        });
        
        // Fetch all tenant user IDs (users with tenant role)
        const { data: tenantRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'tenant')
          .eq('enabled', true);
        
        tenantUserIds = tenantRoles?.map(r => r.user_id) || [];
        
        // Get rent request tenant ids to mark who has requests
        const { data: rentRequestTenantIds } = await supabase
          .from('rent_requests')
          .select('tenant_id');
        
        tenantIdsWithRequests = new Set(rentRequestTenantIds?.map(r => r.tenant_id) || []);
        
        // Fetch all agent user IDs
        const { data: agentRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'agent')
          .eq('enabled', true);
        
        agentUserIds = agentRoles?.map(r => r.user_id) || [];
        
        // Referral tenant count stubbed for performance
        
        // Also count tenants from rent_requests agent_id
        const { data: rentRequestAgents } = await supabase
          .from('rent_requests')
          .select('agent_id, tenant_id');
        
        (rentRequestAgents || []).forEach(r => {
          if (r.agent_id) {
            agentTenantCounts.set(r.agent_id, (agentTenantCounts.get(r.agent_id) || 0) + 1);
          }
        });
      }
      
      // Fetch tenant profiles with pagination
      let tenantProfiles: PotentialTenant[] = [];
      if (reset) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone, avatar_url, created_at')
          .order('created_at', { ascending: false })
          .range(from, to);
        
        // Filter to only tenants - we need to get all tenant IDs first
        const { data: tenantRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'tenant')
          .eq('enabled', true);
        
        const tenantIdSet = new Set(tenantRoles?.map(r => r.user_id) || []);
        
        // Get rent request tenant ids
        const { data: rentRequestTenantIds } = await supabase
          .from('rent_requests')
          .select('tenant_id');
        
        tenantIdsWithRequests = new Set(rentRequestTenantIds?.map(r => r.tenant_id) || []);
        
        tenantProfiles = (profiles || [])
          .filter(p => tenantIdSet.has(p.id))
          .map(p => ({
            id: p.id,
            full_name: p.full_name || 'Anonymous Tenant',
            phone: p.phone || undefined,
            avatar_url: p.avatar_url || undefined,
            created_at: p.created_at,
            has_rent_request: tenantIdsWithRequests.has(p.id)
          }));
      }
      
      // Fetch landlords with pagination
      const { data: landlords } = await supabase
        .from('landlords')
        .select('id, name, phone, property_address, verified, ready_to_receive, created_at, has_smartphone, number_of_houses, desired_rent_from_welile, electricity_meter_number, caretaker_name, caretaker_phone')
        .order('created_at', { ascending: false })
        .range(from, to);
      
      const landlordList: PotentialLandlord[] = (landlords || []).map(l => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        property_address: l.property_address,
        verified: l.verified || false,
        ready_to_receive: l.ready_to_receive || false,
        created_at: l.created_at,
        has_smartphone: l.has_smartphone || false,
        number_of_houses: l.number_of_houses || 1,
        desired_rent_from_welile: l.desired_rent_from_welile || 0,
        electricity_meter_number: l.electricity_meter_number || '',
        caretaker_name: l.caretaker_name || '',
        caretaker_phone: l.caretaker_phone || ''
      }));
      
      // Fetch agent profiles with pagination
      let agentProfiles: PotentialAgent[] = [];
      if (reset) {
        const { data: agentRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'agent')
          .eq('enabled', true);
        
        const agentIdSet = new Set(agentRoles?.map(r => r.user_id) || []);
        
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone, avatar_url, created_at, city, country')
          .order('created_at', { ascending: false })
          .range(from, to);
        
        // Referral tenant count stubbed for performance - use rent_requests only
        const counts = new Map<string, number>();
        
        const { data: rentRequestAgents } = await supabase
          .from('rent_requests')
          .select('agent_id, tenant_id');
        
        (rentRequestAgents || []).forEach(r => {
          if (r.agent_id) {
            counts.set(r.agent_id, (counts.get(r.agent_id) || 0) + 1);
          }
        });
        
        agentProfiles = (profiles || [])
          .filter(p => agentIdSet.has(p.id))
          .map(p => ({
            id: p.id,
            full_name: p.full_name || 'Anonymous Agent',
            phone: p.phone || undefined,
            avatar_url: p.avatar_url || undefined,
            created_at: p.created_at,
            city: p.city || undefined,
            country: p.country || undefined,
            tenant_count: counts.get(p.id) || 0
          }));
        
        agentProfiles.sort((a, b) => b.tenant_count - a.tenant_count);
      }
      
      // Determine if there's more data
      const fetchedCount = tenantProfiles.length + landlordList.length + agentProfiles.length;
      const hasMore = landlordList.length === USERS_PAGE_SIZE; // Use landlords as the pagination indicator
      
      if (reset) {
        setAllTenants(tenantProfiles);
        setAllLandlords(landlordList);
        setAllAgents(agentProfiles);
      } else {
        setAllLandlords(prev => [...prev, ...landlordList]);
      }
      
      setHasMoreUsers(hasMore);
      setUsersPage(currentPage + 1);
    } catch (error) {
      console.error('[RentOpportunities] Error fetching tenants/landlords/agents:', error);
    }
    
    setLoadingPotentials(false);
    setLoadingMoreUsers(false);
  };
  
  // Load more users for pagination
  const loadMoreUsers = useCallback(() => {
    if (!loadingMoreUsers && hasMoreUsers && filterBy === 'all_users') {
      fetchAllTenantsAndLandlords(false);
    }
  }, [loadingMoreUsers, hasMoreUsers, filterBy]);
  
  // Intersection Observer for infinite scroll of users
  useEffect(() => {
    if (filterBy !== 'all_users') return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreUsers && !loadingMoreUsers && !loadingPotentials) {
          loadMoreUsers();
        }
      },
      { threshold: 0.1 }
    );

    if (usersLoadMoreRef.current) {
      observer.observe(usersLoadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMoreUsers, loadingMoreUsers, loadingPotentials, filterBy, loadMoreUsers]);

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      fetchOpportunities(false);
    }
  };

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading]);

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    await fetchOpportunities(true);
    await fetchWatchedOpportunities();
    hapticSuccess();
    toast.success('Opportunities refreshed');
  }, []);

  const fetchSingleOpportunity = async (id: string, isNew: boolean = true) => {
    console.log('[RentOpportunities] Fetching single opportunity:', id, 'isNew:', isNew);
    
    const { data, error } = await supabase
      .from('rent_requests')
      .select(`
        id,
        tenant_id,
        agent_id,
        landlord_id,
        rent_amount,
        duration_days,
        status,
        created_at,
        agent_verified,
        agent_verified_at,
        agent_verified_by,
        manager_verified,
        manager_verified_at,
        manager_verified_by,
        supporter_id,
        landlord:landlords!rent_requests_landlord_id_fkey(id, name, phone, property_address, bank_name, account_number, mobile_money_number, monthly_rent, verified, ready_to_receive)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[RentOpportunities] Error fetching opportunity:', error);
      return;
    }

    if (!data) {
      console.log('[RentOpportunities] No data returned for opportunity:', id);
      return;
    }

    // Process all statuses - we now show everything
    // Fetch tenant, posting agent, verifier, and funder profiles separately
    const profileIds = [data.tenant_id, data.agent_id, data.agent_verified_by, data.manager_verified_by, data.supporter_id].filter(Boolean) as string[];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, phone')
      .in('id', profileIds);
    
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
    
    const opportunity = {
      ...data,
      tenant: profileMap.get(data.tenant_id) || null,
      postingAgent: data.agent_id ? profileMap.get(data.agent_id) : null,
      agentVerifier: data.agent_verified_by ? profileMap.get(data.agent_verified_by) : null,
      managerVerifier: data.manager_verified_by ? profileMap.get(data.manager_verified_by) : null,
      funder: data.supporter_id ? profileMap.get(data.supporter_id) : null
    } as unknown as RentOpportunity;
    
    // Update or add to opportunities list
    setOpportunities(prev => {
      const existingIndex = prev.findIndex(opp => opp.id === id);
      if (existingIndex >= 0) {
        // Update existing
        const updated = [...prev];
        updated[existingIndex] = opportunity;
        console.log('[RentOpportunities] Updated existing opportunity at index:', existingIndex);
        return updated;
      }
      // Add new at the beginning
      console.log('[RentOpportunities] Adding new opportunity to list');
      return [opportunity, ...prev];
    });
    
    // Only show notifications for truly new opportunities
    if (isNew) {
      setNewOpportunityId(id);
      setTimeout(() => setNewOpportunityId(null), 5000);
      
      // Show toast notification and play sound for new opportunity
      const reward = calculateSupporterReward(opportunity.rent_amount);
      
      // Play notification sound and haptic feedback
      playOpportunitySound();
      hapticSuccess();
      
      toast.success('New Investment Opportunity!', {
        description: `${opportunity.tenant?.full_name || 'A tenant'} needs ${formatUGX(opportunity.rent_amount)} — Earn ${formatUGX(reward)} ROI`,
        duration: 6000,
        action: {
          label: 'View',
          onClick: () => {
            setSelectedOpportunity(opportunity);
            setShowDetails(true);
          }
        }
      });
    }
  };

  const getVerificationStatus = (opp: RentOpportunity): FilterOption => {
    if (opp.manager_verified && opp.agent_verified) return 'verified';
    if (opp.agent_verified || opp.manager_verified) return 'verifying';
    return 'pending';
  };

  const getVerificationProgress = (opp: RentOpportunity) => {
    let progress = 0;
    if (opp.agent_verified) progress += 25;
    if (opp.manager_verified) progress += 25;
    if (opp.landlord?.ready_to_receive) progress += 25;
    if (opp.status === 'approved' && opp.landlord?.ready_to_receive) progress += 25;
    return progress;
  };

  const getVerificationStepCount = (opp: RentOpportunity) => {
    let steps = 0;
    if (opp.agent_verified) steps++;
    if (opp.manager_verified) steps++;
    if (opp.landlord?.ready_to_receive) steps++;
    if (opp.status === 'approved' && opp.landlord?.ready_to_receive) steps++;
    return steps;
  };

  // Filter and sort opportunities
  const filteredAndSortedOpportunities = useMemo(() => {
    let result = [...opportunities];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(opp => {
        const tenantName = opp.tenant?.full_name?.toLowerCase() || '';
        const rentAmount = opp.rent_amount.toString();
        const formattedAmount = formatUGX(opp.rent_amount).toLowerCase();
        const funderName = opp.funder?.full_name?.toLowerCase() || '';
        return tenantName.includes(query) || rentAmount.includes(query) || formattedAmount.includes(query) || funderName.includes(query);
      });
    }

    // Apply filter - 'all' now shows EVERYTHING
    if (filterBy === 'watched') {
      result = result.filter(opp => watchedIds.has(opp.id));
    } else if (filterBy === 'unseen') {
      result = result.filter(opp => opp.status !== 'funded' && (!lastSeenAt || new Date(opp.created_at) > lastSeenAt));
    } else if (filterBy === 'funded') {
      result = result.filter(opp => opp.status === 'funded');
    } else if (filterBy === 'rejected') {
      result = result.filter(opp => opp.status === 'rejected');
    } else if (filterBy === 'landlord_ready') {
      result = result.filter(opp => opp.status !== 'funded' && opp.status !== 'rejected' && opp.landlord?.ready_to_receive === true);
    } else if (filterBy === 'ready') {
      // Ready to fund = verified by both agent and manager, approved status
      result = result.filter(opp => opp.status === 'approved' && opp.agent_verified && opp.manager_verified);
    } else if (filterBy === 'all') {
      // 'all' shows ALL opportunities - funded, rejected, pending, etc.
      // No filtering needed
    } else if (filterBy === 'verified') {
      result = result.filter(opp => opp.status !== 'funded' && opp.status !== 'rejected' && opp.agent_verified && opp.manager_verified);
    } else if (filterBy === 'verifying') {
      result = result.filter(opp => opp.status !== 'funded' && opp.status !== 'rejected' && (opp.agent_verified || opp.manager_verified) && !(opp.agent_verified && opp.manager_verified));
    } else if (filterBy === 'pending') {
      result = result.filter(opp => opp.status !== 'funded' && opp.status !== 'rejected' && !opp.agent_verified && !opp.manager_verified);
    } else if (filterBy === 'agent_posted') {
      result = result.filter(opp => opp.agent_id != null);
    }

    // Apply sort
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'amount_high':
        result.sort((a, b) => b.rent_amount - a.rent_amount);
        break;
      case 'amount_low':
        result.sort((a, b) => a.rent_amount - b.rent_amount);
        break;
    }

    return result;
  }, [opportunities, sortBy, filterBy, watchedIds, lastSeenAt, searchQuery]);

  // Calculate potential ROI and counts for each filter category
  const { filterROI, landlordReadyCount } = useMemo(() => {
    const calcROI = (opps: RentOpportunity[]) => 
      opps.reduce((sum, opp) => sum + calculateSupporterReward(opp.rent_amount), 0);
    
    const unfundedOpps = opportunities.filter(opp => opp.status !== 'funded');
    const unseenOpps = unfundedOpps.filter(opp => !lastSeenAt || new Date(opp.created_at) > lastSeenAt);
    const watchedOpps = unfundedOpps.filter(opp => watchedIds.has(opp.id));
    const fundedOpps = opportunities.filter(opp => opp.status === 'funded');
    const verifiedOpps = unfundedOpps.filter(opp => opp.manager_verified && opp.agent_verified);
    const verifyingOpps = unfundedOpps.filter(opp => (opp.agent_verified || opp.manager_verified) && !(opp.agent_verified && opp.manager_verified));
    const pendingOpps = unfundedOpps.filter(opp => !opp.agent_verified && !opp.manager_verified);
    const landlordReadyOpps = unfundedOpps.filter(opp => opp.landlord?.ready_to_receive === true);

    return {
      filterROI: {
        all: calcROI(unfundedOpps),
        unseen: calcROI(unseenOpps),
        watched: calcROI(watchedOpps),
        funded: calcROI(fundedOpps),
        verified: calcROI(verifiedOpps),
        verifying: calcROI(verifyingOpps),
        pending: calcROI(pendingOpps),
        landlord_ready: calcROI(landlordReadyOpps),
      },
      landlordReadyCount: landlordReadyOpps.length,
    };
  }, [opportunities, watchedIds, lastSeenAt]);

  // Calculate summary stats for the summary card
  const summaryStats = useMemo(() => {
    const activeOpps = opportunities.filter(opp => opp.status !== 'funded' && opp.status !== 'rejected');
    const fundedOpps = opportunities.filter(opp => opp.status === 'funded');
    const rejectedOpps = opportunities.filter(opp => opp.status === 'rejected');
    const verifiedOpps = activeOpps.filter(opp => opp.manager_verified && opp.agent_verified);
    const verifyingOpps = activeOpps.filter(opp => (opp.agent_verified || opp.manager_verified) && !(opp.agent_verified && opp.manager_verified));
    const pendingOpps = activeOpps.filter(opp => !opp.agent_verified && !opp.manager_verified);
    
    const calcTotal = (opps: RentOpportunity[]) => ({
      count: opps.length,
      amount: opps.reduce((sum, opp) => sum + opp.rent_amount, 0),
      roi: opps.reduce((sum, opp) => sum + calculateSupporterReward(opp.rent_amount), 0),
    });
    
    return {
      total: calcTotal(activeOpps),
      verified: calcTotal(verifiedOpps),
      verifying: calcTotal(verifyingOpps),
      pending: calcTotal(pendingOpps),
      funded: calcTotal(fundedOpps),
      rejected: calcTotal(rejectedOpps),
    };
  }, [opportunities]);

  const handleCardClick = (opportunity: RentOpportunity) => {
    hapticTap();
    if (isLocked) {
      onLockedClick?.();
      return;
    }
    setSelectedOpportunity(opportunity);
    setShowDetails(true);
  };

  const handleFund = (opportunity: RentOpportunity) => {
    hapticTap();
    setShowDetails(false);
    onFund(opportunity.id, opportunity.rent_amount);
  };


  const handleViewLandlord = () => {
    setShowDetails(false);
    setShowLandlordDetails(true);
  };

  const getStatusBadge = (opp: RentOpportunity) => {
    // Show funded status first if funded
    if (opp.status === 'funded') {
      return (
        <Badge className="bg-primary/20 text-primary border-primary/30 gap-1">
          <HandCoins className="h-3 w-3" />
          Funded
        </Badge>
      );
    }
    
    // Show rejected status
    if (opp.status === 'rejected') {
      return (
        <Badge className="bg-destructive/20 text-destructive border-destructive/30 gap-1">
          <X className="h-3 w-3" />
          Rejected
        </Badge>
      );
    }
    
    const status = getVerificationStatus(opp);
    switch (status) {
      case 'verified':
        return (
          <Badge className="bg-success/20 text-success border-success/30 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Verified
          </Badge>
        );
      case 'verifying':
        return (
          <Badge className="bg-warning/20 text-warning border-warning/30 gap-1">
            <Clock className="h-3 w-3" />
            Verifying
          </Badge>
        );
      default:
        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30 gap-1 animate-pulse cursor-help">
                  <Timer className="h-3 w-3" />
                  Pending Verification
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px] text-center">
                <p className="text-xs font-medium">Needs verification from:</p>
                <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  <li>• Agent verification</li>
                  <li>• Manager verification</li>
                  <li>• Landlord marked ready</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
    }
  };

  // Render individual verification badges with tooltips
  const renderVerificationBadges = (opp: RentOpportunity) => {
    if (opp.status === 'funded') return null;
    
    const agentTooltip = opp.agent_verified 
      ? `Verified by ${opp.agentVerifier?.full_name || 'Agent'} on ${opp.agent_verified_at ? format(new Date(opp.agent_verified_at), 'MMM d, yyyy h:mm a') : 'N/A'}`
      : 'Awaiting agent verification';
    
    const managerTooltip = opp.manager_verified
      ? `Verified by ${opp.managerVerifier?.full_name || 'Manager'} on ${opp.manager_verified_at ? format(new Date(opp.manager_verified_at), 'MMM d, yyyy h:mm a') : 'N/A'}`
      : 'Awaiting manager verification';
    
    const landlordReady = opp.landlord?.ready_to_receive;
    const landlordTooltip = landlordReady
      ? `${opp.landlord?.name || 'Landlord'} is ready to receive payment`
      : opp.landlord 
        ? `${opp.landlord.name} not yet marked as ready to receive`
        : 'No landlord assigned';

    // Calculate missing steps for pending opportunities
    const missingSteps: string[] = [];
    if (!opp.agent_verified) missingSteps.push('Agent');
    if (!opp.manager_verified) missingSteps.push('Manager');
    if (!landlordReady) missingSteps.push('Landlord');
    const isPending = missingSteps.length === 3;
    
    return (
      <TooltipProvider delayDuration={300}>
        <div className="space-y-1.5">
          {/* Missing Steps Indicator for Pending */}
          {isPending && (
            <div className="flex items-center gap-1.5 text-[10px] text-orange-600 dark:text-orange-400 bg-orange-500/10 px-2 py-1 rounded-md border border-orange-500/20">
              <AlertTriangle className="h-3 w-3" />
              <span className="font-medium">Needs: Agent → Manager → Landlord</span>
            </div>
          )}
          
          {/* Partial verification - show what's missing */}
          {!isPending && missingSteps.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-warning bg-warning/10 px-2 py-1 rounded-md border border-warning/20">
              <Clock className="h-3 w-3" />
              <span className="font-medium">
                Still needs: {missingSteps.join(' & ')}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Agent Verification Badge */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant="outline" 
                  className={`text-[10px] px-1.5 py-0.5 gap-1 cursor-help transition-all ${
                    opp.agent_verified 
                      ? 'bg-success/10 text-success border-success/30' 
                      : 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30 border-dashed'
                  }`}
                >
                  {opp.agent_verified ? (
                    <CheckCircle2 className="h-2.5 w-2.5" />
                  ) : (
                    <Timer className="h-2.5 w-2.5 animate-pulse" />
                  )}
                  Agent {opp.agent_verified ? '✓' : '○'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px] text-xs">
                <p>{agentTooltip}</p>
              </TooltipContent>
            </Tooltip>
            
            {/* Manager Verification Badge */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant="outline" 
                  className={`text-[10px] px-1.5 py-0.5 gap-1 cursor-help transition-all ${
                    opp.manager_verified 
                      ? 'bg-primary/10 text-primary border-primary/30' 
                      : 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30 border-dashed'
                  }`}
                >
                  {opp.manager_verified ? (
                    <CheckCircle2 className="h-2.5 w-2.5" />
                  ) : (
                    <Timer className="h-2.5 w-2.5 animate-pulse" />
                  )}
                  Manager {opp.manager_verified ? '✓' : '○'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px] text-xs">
                <p>{managerTooltip}</p>
              </TooltipContent>
            </Tooltip>
            
            {/* Landlord Ready to Receive Badge */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant="outline" 
                  className={`text-[10px] px-1.5 py-0.5 gap-1 cursor-help transition-all ${
                    landlordReady 
                      ? 'bg-warning/10 text-warning border-warning/30' 
                      : 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30 border-dashed'
                  }`}
                >
                  {landlordReady ? (
                    <Building className="h-2.5 w-2.5" />
                  ) : (
                    <Timer className="h-2.5 w-2.5 animate-pulse" />
                  )}
                  Landlord {landlordReady ? '✓' : '○'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px] text-xs">
                <p>{landlordTooltip}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    );
  };

  if (loading) {
    return (
      <Card className="border-0 bg-gradient-to-br from-success/5 via-background to-primary/5">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-48 bg-muted rounded" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-28 bg-muted/50 rounded-xl" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (opportunities.length === 0) {
    return (
      <Card className="border-0 bg-gradient-to-br from-muted/50 to-muted/30 overflow-hidden">
        <CardContent className="p-8 text-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-success/20 via-primary/20 to-success/20 blur-3xl opacity-30" />
            <div className="relative p-6 rounded-full bg-muted/50 w-fit mx-auto">
              <Users className="h-12 w-12 text-muted-foreground" />
            </div>
          </div>
          <div>
            <p className="font-bold text-xl text-foreground">No Opportunities Yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              New investment opportunities will appear here in real-time
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Bell className="h-4 w-4" />
            <span>You'll be notified when tenants need help</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
        {/* New opportunities banner - hidden for cleaner supporter dashboard */}

        {/* Summary card removed for cleaner supporter dashboard */}

        {/* Header card hidden for cleaner supporter dashboard */}

        {/* Search Bar - Larger for Easy Typing */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search tenant or amount..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 pr-12 h-14 text-base bg-muted/40 border-2 border-muted-foreground/20 focus:bg-background focus:border-primary rounded-xl"
            style={{ fontSize: '16px' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-muted transition-colors touch-manipulation active:scale-95"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Quick Filter Chips - ALL STATUSES */}
        <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          {[
            { value: 'all', label: 'All Requests', icon: '📋' },
            { value: 'all_users', label: 'All Users', icon: '👥' },
            { value: 'all_tenants', label: 'Tenants', icon: '🏠' },
            { value: 'all_landlords', label: 'Landlords', icon: '🏢' },
            { value: 'all_agents', label: 'Agents', icon: '🤝' },
            { value: 'agent_posted', label: 'Agent Posted', icon: '👤' },
            { value: 'funded', label: 'Funded', icon: '💚' },
            { value: 'ready', label: 'Ready', icon: '✅' },
            { value: 'verifying', label: 'Verifying', icon: '⏳' },
            { value: 'pending', label: 'Pending', icon: '🆕' },
            { value: 'watched', label: 'Watching', icon: '👁️' },
            { value: 'rejected', label: 'Rejected', icon: '❌' },
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => {
                hapticTap();
                setFilterBy(filter.value as FilterOption);
              }}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 touch-manipulation min-h-[44px] ${
                filterBy === filter.value
                  ? filter.value === 'funded' 
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-2 ring-primary'
                    : filter.value === 'rejected'
                    ? 'bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30 ring-2 ring-destructive'
                    : 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-2 ring-primary'
                  : 'bg-muted/80 text-foreground hover:bg-muted border border-transparent'
              }`}
            >
              <span>{filter.icon}</span>
              <span>{filter.label}</span>
            </button>
          ))}
        </div>

        {/* Sort & Watchlist - SIMPLIFIED */}
        <div className="flex gap-3 items-center justify-between">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="h-12 text-sm font-medium gap-2 border-2 rounded-xl min-w-[140px] touch-manipulation">
              <ArrowUpDown className="h-4 w-4" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" className="text-base py-3">Newest First</SelectItem>
              <SelectItem value="oldest" className="text-base py-3">Oldest First</SelectItem>
              <SelectItem value="amount_high" className="text-base py-3">Highest Amount</SelectItem>
              <SelectItem value="amount_low" className="text-base py-3">Lowest Amount</SelectItem>
            </SelectContent>
          </Select>

          {watchedIds.size > 0 && (
            <Button
              variant="outline"
              onClick={() => navigate('/my-watchlist')}
              className="h-12 px-4 text-sm font-bold gap-2 rounded-xl border-2 touch-manipulation active:scale-95"
            >
              <Bookmark className="h-4 w-4" />
              Watchlist ({watchedIds.size})
            </Button>
          )}
        </div>

        {/* All Tenants List */}
        {filterBy === 'all_tenants' && (
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="px-4 py-3 bg-muted/30 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏠</span>
                    <h4 className="font-bold text-foreground">All Registered Tenants</h4>
                  </div>
                  {showCounts && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 tabular-nums">
                      {allTenants.length} / {totalCounts.tenants}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Potential tenants who may need rent assistance
                </p>
              </div>
              <div className="divide-y divide-border">
                {loadingPotentials ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/20 border-t-primary" />
                  </div>
                ) : allTenants.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No tenants registered yet</p>
                  </div>
                ) : (
                  allTenants
                    .filter(t => !searchQuery || t.full_name?.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((tenant) => (
                      <div
                        key={tenant.id}
                        className="px-4 py-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <UserAvatar fullName={tenant.full_name} avatarUrl={tenant.avatar_url} size="sm" />
                          <button 
                            className="flex-1 min-w-0 text-left"
                            onClick={() => {
                              hapticTap();
                              setProfileDialogUser({
                                id: tenant.id,
                                name: tenant.full_name,
                                avatarUrl: tenant.avatar_url,
                                type: 'tenant',
                                createdAt: tenant.created_at,
                                phone: tenant.phone,
                                hasRentRequest: tenant.has_rent_request
                              });
                            }}
                          >
                            <p className="font-semibold text-sm truncate hover:text-primary hover:underline underline-offset-2 transition-colors inline-flex items-center gap-1 group">
                              {tenant.full_name}
                              <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{formatDistanceToNow(new Date(tenant.created_at), { addSuffix: true })}</span>
                              {tenant.has_rent_request ? (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-success/10 text-success border-success/30">
                                  Has Request
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30">
                                  No Request Yet
                                </Badge>
                              )}
                            </div>
                          </button>
                          <ContactActionsBar
                            userId={tenant.id}
                            userName={tenant.full_name}
                            compact
                          />
                        </div>
                      </div>
                    ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* All Landlords List */}
        {filterBy === 'all_landlords' && (
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="px-4 py-3 bg-muted/30 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏢</span>
                    <h4 className="font-bold text-foreground">All Registered Landlords</h4>
                  </div>
                  {showCounts && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 tabular-nums">
                      {allLandlords.length} / {totalCounts.landlords}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Property owners ready to receive rent payments
                </p>
              </div>
              <div className="divide-y divide-border">
                {loadingPotentials ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/20 border-t-primary" />
                  </div>
                ) : allLandlords.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <Building className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No landlords registered yet</p>
                  </div>
                ) : (
                  allLandlords
                    .filter(l => !searchQuery || l.name?.toLowerCase().includes(searchQuery.toLowerCase()) || l.property_address?.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((landlord) => (
                      <div
                        key={landlord.id}
                        className="px-4 py-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${landlord.ready_to_receive ? 'bg-success/10' : landlord.verified ? 'bg-warning/10' : 'bg-orange-500/10'}`}>
                            <Building className={`h-5 w-5 ${landlord.ready_to_receive ? 'text-success' : landlord.verified ? 'text-warning' : 'text-orange-500'}`} />
                          </div>
                          <button 
                            className="flex-1 min-w-0 text-left"
                            onClick={() => {
                              hapticTap();
                              setProfileDialogUser({
                                id: landlord.id,
                                name: landlord.name,
                                type: 'landlord',
                                createdAt: landlord.created_at,
                                phone: landlord.phone,
                                propertyAddress: landlord.property_address,
                                verified: landlord.verified,
                                readyToReceive: landlord.ready_to_receive,
                                hasSmartphone: landlord.has_smartphone,
                                numberOfHouses: landlord.number_of_houses,
                                desiredRent: landlord.desired_rent_from_welile,
                                electricityMeter: landlord.electricity_meter_number,
                                caretakerName: landlord.caretaker_name,
                                caretakerPhone: landlord.caretaker_phone
                              });
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm truncate hover:text-primary hover:underline underline-offset-2 transition-colors inline-flex items-center gap-1 group">
                                {landlord.name}
                                <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                              </p>
                              {!landlord.has_smartphone && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-muted">
                                  No Phone
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3 w-3" />
                              {landlord.property_address}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs text-muted-foreground">
                                {landlord.number_of_houses} {landlord.number_of_houses === 1 ? 'house' : 'houses'}
                              </span>
                              {landlord.desired_rent_from_welile > 0 && (
                                <span className="text-xs font-medium text-success">
                                  Wants: {formatAmount(landlord.desired_rent_from_welile)}
                                </span>
                              )}
                              {landlord.ready_to_receive ? (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-success/10 text-success border-success/30 gap-0.5">
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                  Ready
                                </Badge>
                              ) : landlord.verified ? (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-warning/10 text-warning border-warning/30 gap-0.5">
                                  <Shield className="h-2.5 w-2.5" />
                                  Verified
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30 gap-0.5">
                                  <Timer className="h-2.5 w-2.5" />
                                  Pending
                                </Badge>
                              )}
                            </div>
                            {landlord.caretaker_name && (
                              <p className="text-[10px] text-muted-foreground mt-1">
                                Caretaker: {landlord.caretaker_name} {landlord.caretaker_phone && `(${landlord.caretaker_phone})`}
                              </p>
                            )}
                          </button>
                          {/* Note: Landlords don't have user IDs in the app, so we use phone-based contact */}
                          <div className="flex items-center gap-1.5">
                            <WhatsAppRequestButton
                              targetUserId={landlord.id}
                              targetName={landlord.name}
                              targetPhone={landlord.phone}
                              size="icon"
                              variant="outline"
                              className="h-9 w-9"
                            />
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* All Agents List */}
        {filterBy === 'all_agents' && (
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="px-4 py-3 bg-muted/30 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🤝</span>
                    <h4 className="font-bold text-foreground">All Registered Agents</h4>
                  </div>
                  {showCounts && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 tabular-nums">
                      {allAgents.length} / {totalCounts.agents}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Field agents with their location and tenant registrations
                </p>
              </div>
              <div className="divide-y divide-border">
                {loadingPotentials ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/20 border-t-primary" />
                  </div>
                ) : allAgents.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No agents registered yet</p>
                  </div>
                ) : (
                  allAgents
                    .filter(a => !searchQuery || a.full_name?.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((agent) => (
                      <div
                        key={agent.id}
                        className="px-4 py-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <UserAvatar fullName={agent.full_name} avatarUrl={agent.avatar_url} size="sm" />
                          <button 
                            className="flex-1 min-w-0 text-left"
                            onClick={() => {
                              hapticTap();
                              setProfileDialogUser({
                                id: agent.id,
                                name: agent.full_name,
                                avatarUrl: agent.avatar_url,
                                type: 'agent',
                                createdAt: agent.created_at,
                                phone: agent.phone,
                                city: agent.city,
                                country: agent.country,
                                tenantCount: agent.tenant_count
                              });
                            }}
                          >
                            <p className="font-semibold text-sm truncate hover:text-primary hover:underline underline-offset-2 transition-colors inline-flex items-center gap-1 group">
                              {agent.full_name}
                              <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                              {(agent.city || agent.country) && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {[agent.city, agent.country].filter(Boolean).join(', ')}
                                </span>
                              )}
                              {!agent.city && !agent.country && (
                                <span className="flex items-center gap-1 text-muted-foreground/60">
                                  <MapPin className="h-3 w-3" />
                                  Location unknown
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge 
                                variant="outline" 
                                className={`text-[9px] px-1.5 py-0 ${
                                  agent.tenant_count > 0 
                                    ? 'bg-success/10 text-success border-success/30' 
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                <Users className="h-2.5 w-2.5 mr-0.5" />
                                {agent.tenant_count} {agent.tenant_count === 1 ? 'tenant' : 'tenants'}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                Joined {formatDistanceToNow(new Date(agent.created_at), { addSuffix: true })}
                              </span>
                            </div>
                          </button>
                          <ContactActionsBar
                            userId={agent.id}
                            userName={agent.full_name}
                            compact
                          />
                        </div>
                      </div>
                    ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* All Users Combined List */}
        {filterBy === 'all_users' && (
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="px-4 py-3 bg-muted/30 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">👥</span>
                    <h4 className="font-bold text-foreground">All Users</h4>
                  </div>
                  {showCounts && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 tabular-nums">
                        {allTenants.length + allLandlords.length + allAgents.length} / {totalCounts.tenants + totalCounts.landlords + totalCounts.agents}
                      </Badge>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  All tenants, landlords, and agents in the system
                </p>
              </div>
              <div className="divide-y divide-border">
                {loadingPotentials ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/20 border-t-primary" />
                  </div>
                ) : (allTenants.length + allLandlords.length + allAgents.length) === 0 ? (
                  <div className="text-center py-8 px-4">
                    <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No users found</p>
                  </div>
                ) : (
                  <>
                    {/* Tenants Section */}
                    {allTenants
                      .filter(t => !searchQuery || t.full_name?.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((tenant) => (
                        <div
                          key={`tenant-${tenant.id}`}
                          className="px-4 py-3 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <UserAvatar fullName={tenant.full_name} avatarUrl={tenant.avatar_url} size="sm" />
                            <button 
                              className="flex-1 min-w-0 text-left"
                              onClick={() => {
                                hapticTap();
                                setProfileDialogUser({
                                  id: tenant.id,
                                  name: tenant.full_name,
                                  avatarUrl: tenant.avatar_url,
                                  type: 'tenant',
                                  createdAt: tenant.created_at,
                                  phone: tenant.phone,
                                  hasRentRequest: tenant.has_rent_request
                                });
                              }}
                            >
                              <p className="font-semibold text-sm truncate hover:text-primary hover:underline underline-offset-2 transition-colors inline-flex items-center gap-1 group">
                                {tenant.full_name}
                                <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-blue-500/10 text-blue-600 border-blue-500/30">
                                  🏠 Tenant
                                </Badge>
                                <span>{formatDistanceToNow(new Date(tenant.created_at), { addSuffix: true })}</span>
                              </div>
                            </button>
                            <ContactActionsBar
                              userId={tenant.id}
                              userName={tenant.full_name}
                              compact
                            />
                          </div>
                        </div>
                      ))
                    }

                    {/* Landlords Section */}
                    {allLandlords
                      .filter(l => !searchQuery || l.name?.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((landlord) => (
                        <div
                          key={`landlord-${landlord.id}`}
                          className="px-4 py-3 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <UserAvatar fullName={landlord.name} size="sm" />
                            <button 
                              className="flex-1 min-w-0 text-left"
                              onClick={() => {
                                hapticTap();
                                setProfileDialogUser({
                                  id: landlord.id,
                                  name: landlord.name,
                                  type: 'landlord',
                                  createdAt: landlord.created_at,
                                  phone: landlord.phone,
                                  propertyAddress: landlord.property_address,
                                  verified: landlord.verified,
                                  readyToReceive: landlord.ready_to_receive,
                                  hasSmartphone: landlord.has_smartphone,
                                  numberOfHouses: landlord.number_of_houses,
                                  desiredRent: landlord.desired_rent_from_welile,
                                  electricityMeter: landlord.electricity_meter_number,
                                  caretakerName: landlord.caretaker_name,
                                  caretakerPhone: landlord.caretaker_phone
                                });
                              }}
                            >
                              <p className="font-semibold text-sm truncate hover:text-primary hover:underline underline-offset-2 transition-colors inline-flex items-center gap-1 group">
                                {landlord.name}
                                <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-purple-500/10 text-purple-600 border-purple-500/30">
                                  🏢 Landlord
                                </Badge>
                                <span className="truncate">{landlord.property_address}</span>
                              </div>
                            </button>
                            <div className="flex items-center gap-1.5">
                              <WhatsAppRequestButton
                                targetUserId={landlord.id}
                                targetName={landlord.name}
                                targetPhone={landlord.phone}
                                size="icon"
                                variant="outline"
                                className="h-9 w-9"
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    }

                    {/* Agents Section */}
                    {allAgents
                      .filter(a => !searchQuery || a.full_name?.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((agent) => (
                        <div
                          key={`agent-${agent.id}`}
                          className="px-4 py-3 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <UserAvatar fullName={agent.full_name} avatarUrl={agent.avatar_url} size="sm" />
                            <button 
                              className="flex-1 min-w-0 text-left"
                              onClick={() => {
                                hapticTap();
                                setProfileDialogUser({
                                  id: agent.id,
                                  name: agent.full_name,
                                  avatarUrl: agent.avatar_url,
                                  type: 'agent',
                                  createdAt: agent.created_at,
                                  phone: agent.phone,
                                  city: agent.city,
                                  country: agent.country,
                                  tenantCount: agent.tenant_count
                                });
                              }}
                            >
                              <p className="font-semibold text-sm truncate hover:text-primary hover:underline underline-offset-2 transition-colors inline-flex items-center gap-1 group">
                                {agent.full_name}
                                <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-amber-500/10 text-amber-600 border-amber-500/30">
                                  🤝 Agent
                                </Badge>
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                  <Users className="h-2.5 w-2.5 mr-0.5" />
                                  {agent.tenant_count} tenants
                                </Badge>
                              </div>
                            </button>
                            <ContactActionsBar
                              userId={agent.id}
                              userName={agent.full_name}
                              compact
                            />
                          </div>
                        </div>
                      ))
                    }
                    
                    {/* Infinite scroll trigger for users */}
                    <div ref={usersLoadMoreRef} className="py-3">
                      {loadingMoreUsers && (
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs">Loading more users...</span>
                        </div>
                      )}
                      {!hasMoreUsers && (allTenants.length + allLandlords.length + allAgents.length) > 0 && (
                        <p className="text-xs text-center text-muted-foreground py-2">
                          ✓ All {totalCounts.tenants + totalCounts.landlords + totalCounts.agents} users loaded
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Opportunities List - Collapsible Names */}
        {filterBy !== 'all_tenants' && filterBy !== 'all_landlords' && filterBy !== 'all_agents' && filterBy !== 'all_users' && (
        <Card className="border shadow-sm">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              <AnimatePresence>
                {filteredAndSortedOpportunities.map((opportunity) => {
                  const isFunded = opportunity.status === 'funded';
                  const isRejected = opportunity.status === 'rejected';
                  const reward = calculateSupporterReward(opportunity.rent_amount);
                  const isNew = opportunity.id === newOpportunityId;
                  const isExpanded = expandedId === opportunity.id;
                  const verificationStatus = getVerificationStatus(opportunity);
                  const stepsComplete = getVerificationStepCount(opportunity);
                  const isReady = verificationStatus === 'verified' && !isFunded && !isRejected;
                  
                  return (
                    <div key={opportunity.id}>
                      {/* Name + Reward row */}
                      <button
                        onClick={() => {
                          hapticTap();
                          setExpandedId(prev => prev === opportunity.id ? null : opportunity.id);
                        }}
                        className={`w-full px-4 py-3 text-left transition-colors touch-manipulation flex items-center gap-3 ${
                          isExpanded ? 'bg-muted/30' : ''
                        } ${
                          isFunded 
                            ? 'bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary' 
                            : isRejected
                            ? 'bg-destructive/5 hover:bg-destructive/10 border-l-4 border-l-destructive opacity-60'
                            : isReady
                            ? 'bg-amber-500/5 hover:bg-amber-500/10 border-l-4 border-l-amber-500'
                            : 'hover:bg-muted/50 active:bg-muted'
                        }`}
                      >
                        {/* Status indicator dot */}
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isFunded ? 'bg-primary ring-2 ring-primary/30' :
                          isRejected ? 'bg-destructive' :
                          isReady ? 'bg-amber-500 ring-2 ring-amber-500/30 animate-pulse' :
                          verificationStatus === 'verifying' ? 'bg-warning' :
                          'bg-orange-500'
                        }`} />
                        
                        <div className="flex-1 min-w-0">
                          <span className={`font-semibold text-sm block truncate ${
                            isFunded ? 'text-primary' 
                            : isRejected ? 'text-muted-foreground line-through' 
                            : isReady ? 'text-amber-600 dark:text-amber-400' 
                            : 'text-foreground'
                          }`}>
                            {opportunity.tenant?.full_name || 'Anonymous Tenant'}
                            {isReady && ' ⭐'}
                          </span>
                          {/* Show posting agent if available */}
                          {opportunity.postingAgent && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <UserPlus className="h-2.5 w-2.5" />
                              Posted by {opportunity.postingAgent.full_name}
                            </span>
                          )}
                          {isReady && !opportunity.postingAgent && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                              <Sparkles className="h-2.5 w-2.5" />
                              Ready to fund • Earn {formatAmount(reward)}
                            </span>
                          )}
                          {isFunded && opportunity.funder && (
                            <span className="text-[10px] text-primary/70 flex items-center gap-1">
                              <HandCoins className="h-2.5 w-2.5" />
                              Funded by {opportunity.funder.full_name}
                            </span>
                          )}
                          {isRejected && (
                            <span className="text-[10px] text-destructive flex items-center gap-1">
                              <X className="h-2.5 w-2.5" />
                              Rejected
                            </span>
                          )}
                        </div>
                        
                        <span className={`text-xs font-bold shrink-0 ${
                          isFunded ? 'text-primary' 
                          : isRejected ? 'text-muted-foreground' 
                          : isReady ? 'text-amber-600 dark:text-amber-400'
                          : 'text-success'
                        }`}>
                          {isFunded ? '✓ ' : isRejected ? '' : '+'}{formatAmount(reward)}
                        </span>
                        
                        {isFunded && (
                          <Badge className="bg-primary/20 text-primary text-[9px] px-1.5 py-0 shrink-0 border border-primary/30">
                            FUNDED
                          </Badge>
                        )}
                        
                        {isNew && !isFunded && (
                          <Badge className="bg-success/20 text-success text-[9px] px-1.5 py-0 shrink-0">
                            NEW
                          </Badge>
                        )}
                        
                        {watchedIds.has(opportunity.id) && !isFunded && (
                          <Bell className="h-3.5 w-3.5 text-warning shrink-0" />
                        )}
                      </button>
                      
                      {/* Expanded details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden bg-muted/20"
                          >
                            <div className="px-4 py-4 space-y-4">
                              {/* Amount & Reward */}
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Rent Amount</p>
                                  <p className="text-xl font-bold">{formatAmount(opportunity.rent_amount)}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Your Reward</p>
                                  <p className="text-xl font-bold text-success">+{formatAmount(reward)}</p>
                                </div>
                              </div>
                              
                              {/* Meta info */}
                              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDistanceToNow(new Date(opportunity.created_at), { addSuffix: true })}
                                </span>
                                <span>•</span>
                                <span>{opportunity.duration_days} days</span>
                                <span>•</span>
                                {getStatusBadge(opportunity)}
                              </div>
                              
                              {/* Verification progress */}
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Verification</span>
                                  <span className="font-medium">{stepsComplete}/4</span>
                                </div>
                                <div className="flex gap-1">
                                  <div className={`h-1.5 flex-1 rounded-full ${opportunity.agent_verified ? 'bg-success' : 'bg-muted'}`} />
                                  <div className={`h-1.5 flex-1 rounded-full ${opportunity.manager_verified ? 'bg-primary' : 'bg-muted'}`} />
                                  <div className={`h-1.5 flex-1 rounded-full ${opportunity.landlord?.ready_to_receive ? 'bg-warning' : 'bg-muted'}`} />
                                  <div className={`h-1.5 flex-1 rounded-full ${opportunity.status === 'approved' && opportunity.landlord?.ready_to_receive ? 'bg-success' : 'bg-muted'}`} />
                                </div>
                              </div>
                              
                              {/* Posting Agent Info with Contact */}
                              {opportunity.postingAgent && (
                                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-muted">
                                  <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-full bg-primary/10">
                                      <UserPlus className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium">Agent: {opportunity.postingAgent.full_name}</p>
                                      <p className="text-[10px] text-muted-foreground">Posted this request</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {opportunity.postingAgent.phone && (
                                      <a
                                        href={getWhatsAppLink(opportunity.postingAgent.phone)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-2 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
                                      >
                                        <MessageCircle className="h-4 w-4" />
                                      </a>
                                    )}
                                    {opportunity.postingAgent.phone && (
                                      <a
                                        href={`tel:${opportunity.postingAgent.phone}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                      >
                                        <Phone className="h-4 w-4" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {/* Action buttons */}
                              <div className="flex gap-2">
                                {/* Watch button */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => handleWatch(e, opportunity.id)}
                                  disabled={watchingId === opportunity.id}
                                  className={`h-10 px-3 ${watchedIds.has(opportunity.id) ? 'bg-warning/10 border-warning text-warning' : ''}`}
                                >
                                  {watchedIds.has(opportunity.id) ? (
                                    <BookmarkCheck className="h-4 w-4" />
                                  ) : (
                                    <Bell className="h-4 w-4" />
                                  )}
                                </Button>
                                
                                {/* View Details button */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCardClick(opportunity)}
                                  className="flex-1 h-10 font-medium"
                                >
                                  <Eye className="h-4 w-4 mr-1.5" />
                                  Details
                                </Button>
                                
                                {/* Fund button - for verified and not rejected */}
                                {opportunity.agent_verified && opportunity.manager_verified && !isFunded && !isRejected && (
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      hapticTap();
                                      if (isLocked) {
                                        onLockedClick?.();
                                      } else {
                                        onFund(opportunity.id, opportunity.rent_amount);
                                      }
                                    }}
                                    className="flex-1 h-10 font-bold bg-success hover:bg-success/90"
                                  >
                                    <Zap className="h-4 w-4 mr-1.5" />
                                    Fund
                                  </Button>
                                )}
                              </div>
                              
                              {/* Funded by info */}
                              {isFunded && opportunity.funder && (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 border border-primary/20">
                                  <HandCoins className="h-4 w-4 text-primary" />
                                  <div className="flex-1">
                                    <p className="text-xs font-medium text-primary">Funded by {opportunity.funder.full_name}</p>
                                    <p className="text-[10px] text-muted-foreground">This opportunity has been taken</p>
                                  </div>
                                </div>
                              )}
                              
                              {/* Rejected notice */}
                              {isRejected && (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                                  <X className="h-4 w-4 text-destructive" />
                                  <div className="flex-1">
                                    <p className="text-xs font-medium text-destructive">Request Rejected</p>
                                    <p className="text-[10px] text-muted-foreground">This opportunity is no longer available</p>
                                  </div>
                                </div>
                              )}
                              
                              {/* Let Manager Invest - only for active opportunities */}
                              {!isFunded && !isRejected && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    hapticTap();
                                    setManagerInvestAmount(opportunity.rent_amount);
                                    setShowManagerInvestDialog(true);
                                  }}
                                  className="w-full h-9 text-xs text-primary hover:bg-primary/10"
                                >
                                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                                  Let Manager Invest For Me
                                </Button>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </AnimatePresence>
            </div>
            
            {/* Infinite scroll trigger */}
            <div ref={loadMoreRef} className="py-3">
              {loadingMore && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Loading more...</span>
                </div>
              )}
              {!hasMore && opportunities.length > 0 && (
                <p className="text-xs text-center text-muted-foreground">
                  All {opportunities.length} opportunities loaded
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        )}

        {/* Results info - LARGER */}
        {filterBy !== 'all' && (
          <p className="text-sm text-center text-muted-foreground font-medium py-2">
            Showing {filteredAndSortedOpportunities.length} of {opportunities.length}
          </p>
        )}

        {/* Tip - LARGER & CLEARER */}
        <div className="flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-primary/15 to-success/15 border-2 border-primary/20 shadow-sm">
          <div className="p-3 rounded-xl bg-primary/20 shrink-0">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-base font-bold text-foreground">Safe & Secure</p>
            <p className="text-sm text-muted-foreground mt-1">
              Tap any card to see full details
            </p>
          </div>
        </div>
      </motion.div>
      </div>

      {/* Opportunity Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              Investment Opportunity
            </DialogTitle>
          </DialogHeader>

          {selectedOpportunity && (
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="space-y-5">
                {/* CONTACT TENANT - Large & Accessible */}
                <div className="space-y-3 p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-success/10 border-2 border-primary/20">
                  <p className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Contact Tenant
                  </p>
                  <div className="flex gap-2">
                    {selectedOpportunity.tenant?.phone && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => window.open(getWhatsAppLink(selectedOpportunity.tenant!.phone!), '_blank')}
                          className="h-14 w-14 p-0 border-2 border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10 touch-manipulation active:scale-95"
                        >
                          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => window.open(`tel:${selectedOpportunity.tenant!.phone}`, '_self')}
                          className="h-14 w-14 p-0 border-2 touch-manipulation active:scale-95"
                        >
                          <Phone className="h-6 w-6" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* CONTACT LANDLORD - Large & Accessible */}
                {selectedOpportunity.landlord && (
                  <div className="space-y-3 p-4 rounded-2xl bg-gradient-to-r from-warning/10 to-warning/5 border-2 border-warning/20">
                    <p className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Building className="h-4 w-4 text-warning" />
                      Contact Landlord: {selectedOpportunity.landlord.name}
                    </p>
                    <div className="flex gap-2">
                      {selectedOpportunity.landlord.user_id ? (
                        <div className="flex-1 h-14 flex items-center justify-center text-sm text-muted-foreground bg-muted/50 rounded-md">
                          On platform
                        </div>
                      ) : (
                        <div className="flex-1 h-14 flex items-center justify-center text-sm text-muted-foreground bg-muted/50 rounded-md">
                          No app account
                        </div>
                      )}
                      {selectedOpportunity.landlord.phone && (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => window.open(getWhatsAppLink(selectedOpportunity.landlord!.phone), '_blank')}
                            className="h-14 w-14 p-0 border-2 border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10 touch-manipulation active:scale-95"
                          >
                            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => window.open(`tel:${selectedOpportunity.landlord!.phone}`, '_self')}
                            className="h-14 w-14 p-0 border-2 touch-manipulation active:scale-95"
                          >
                            <Phone className="h-6 w-6" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Tenant Info */}
                <div 
                  className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
                  onClick={handleViewLandlord}
                >
                  <UserAvatar 
                    avatarUrl={selectedOpportunity.tenant?.avatar_url} 
                    fullName={selectedOpportunity.tenant?.full_name || 'Tenant'} 
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{selectedOpportunity.tenant?.full_name || 'Tenant'}</p>
                    <p className="text-xs text-muted-foreground">Tap to see landlord details</p>
                  </div>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* Amount Hero */}
                <div className="text-center p-5 rounded-2xl bg-gradient-to-br from-success/10 via-success/5 to-transparent">
                  <p className="text-sm text-muted-foreground mb-1">Rent Amount</p>
                  <p className="text-3xl font-black text-foreground">
                    {formatUGX(selectedOpportunity.rent_amount)}
                  </p>
                  <div className="flex items-center justify-center gap-4 mt-3">
                    <div className="text-center">
                      <p className="text-xl font-bold text-success">
                        +{formatUGX(calculateSupporterReward(selectedOpportunity.rent_amount))}
                      </p>
                      <p className="text-xs text-muted-foreground">Your Earnings</p>
                    </div>
                    <Separator orientation="vertical" className="h-8" />
                    <div className="text-center">
                      <p className="text-xl font-bold">15%</p>
                      <p className="text-xs text-muted-foreground">Monthly ROI</p>
                    </div>
                  </div>
                </div>

                {/* Verification Timeline */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Verification Timeline
                  </h4>

                  <div className="relative pl-6">
                    {/* Timeline connector line */}
                    <div className="absolute left-[11px] top-6 bottom-6 w-0.5 bg-gradient-to-b from-muted via-muted to-muted" />
                    
                    {/* Step 1: Request Submitted */}
                    <div className="relative flex items-start gap-3 pb-4">
                      <div className="absolute left-[-13px] z-10 p-1.5 rounded-full bg-success text-white shadow-md">
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                      <div className="flex-1 ml-2">
                        <p className="font-medium text-sm text-foreground">Request Submitted</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(selectedOpportunity.created_at), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    </div>

                    {/* Step 2: Agent Verification */}
                    <div className="relative flex items-start gap-3 pb-4">
                      <div className={`absolute left-[-13px] z-10 p-1.5 rounded-full shadow-md ${
                        selectedOpportunity.agent_verified 
                          ? 'bg-success text-white' 
                          : 'bg-muted text-muted-foreground border-2 border-dashed border-muted-foreground/30'
                      }`}>
                        {selectedOpportunity.agent_verified ? (
                          <UserCheck className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3 animate-pulse" />
                        )}
                      </div>
                      <div className="flex-1 ml-2">
                        <div className="flex items-center gap-2">
                          <p className={`font-medium text-sm ${selectedOpportunity.agent_verified ? 'text-foreground' : 'text-muted-foreground'}`}>
                            Agent Verification
                          </p>
                          {selectedOpportunity.agent_verified && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-success/10 text-success border-success/30">
                              Complete
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {selectedOpportunity.agent_verified 
                            ? `Verified by ${selectedOpportunity.agentVerifier?.full_name || 'Agent'} • ${selectedOpportunity.agent_verified_at ? format(new Date(selectedOpportunity.agent_verified_at), 'MMM d, yyyy h:mm a') : ''}`
                            : 'Awaiting agent review'
                          }
                        </p>
                      </div>
                    </div>

                    {/* Step 3: Manager Approval */}
                    <div className="relative flex items-start gap-3 pb-4">
                      <div className={`absolute left-[-13px] z-10 p-1.5 rounded-full shadow-md ${
                        selectedOpportunity.manager_verified 
                          ? 'bg-success text-white' 
                          : 'bg-muted text-muted-foreground border-2 border-dashed border-muted-foreground/30'
                      }`}>
                        {selectedOpportunity.manager_verified ? (
                          <Shield className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3 animate-pulse" />
                        )}
                      </div>
                      <div className="flex-1 ml-2">
                        <div className="flex items-center gap-2">
                          <p className={`font-medium text-sm ${selectedOpportunity.manager_verified ? 'text-foreground' : 'text-muted-foreground'}`}>
                            Manager Approval
                          </p>
                          {selectedOpportunity.manager_verified && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30">
                              Approved
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {selectedOpportunity.manager_verified 
                            ? `Approved by ${selectedOpportunity.managerVerifier?.full_name || 'Manager'} • ${selectedOpportunity.manager_verified_at ? format(new Date(selectedOpportunity.manager_verified_at), 'MMM d, yyyy h:mm a') : ''}`
                            : 'Awaiting manager approval'
                          }
                        </p>
                      </div>
                    </div>

                    {/* Step 4: Landlord Ready to Receive */}
                    <div className="relative flex items-start gap-3 pb-4">
                      <div className={`absolute left-[-13px] z-10 p-1.5 rounded-full shadow-md ${
                        selectedOpportunity.landlord?.ready_to_receive 
                          ? 'bg-warning text-white' 
                          : 'bg-muted text-muted-foreground border-2 border-dashed border-muted-foreground/30'
                      }`}>
                        {selectedOpportunity.landlord?.ready_to_receive ? (
                          <Building className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3 animate-pulse" />
                        )}
                      </div>
                      <div className="flex-1 ml-2">
                        <div className="flex items-center gap-2">
                          <p className={`font-medium text-sm ${selectedOpportunity.landlord?.ready_to_receive ? 'text-foreground' : 'text-muted-foreground'}`}>
                            Landlord Ready
                          </p>
                          {selectedOpportunity.landlord?.ready_to_receive && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-warning/10 text-warning border-warning/30">
                              Ready
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {selectedOpportunity.landlord?.ready_to_receive 
                            ? `${selectedOpportunity.landlord?.name || 'Landlord'} is ready to receive payment`
                            : selectedOpportunity.landlord 
                              ? `Waiting for ${selectedOpportunity.landlord.name} to be marked ready`
                              : 'No landlord assigned'
                          }
                        </p>
                      </div>
                    </div>

                    {/* Step 5: Ready for Funding */}
                    <div className="relative flex items-start gap-3">
                      <div className={`absolute left-[-13px] z-10 p-1.5 rounded-full shadow-md ${
                        selectedOpportunity.status === 'approved' && selectedOpportunity.landlord?.ready_to_receive
                          ? 'bg-gradient-to-br from-success to-primary text-white' 
                          : 'bg-muted text-muted-foreground border-2 border-dashed border-muted-foreground/30'
                      }`}>
                        {selectedOpportunity.status === 'approved' && selectedOpportunity.landlord?.ready_to_receive ? (
                          <HandCoins className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                      </div>
                      <div className="flex-1 ml-2">
                        <div className="flex items-center gap-2">
                          <p className={`font-medium text-sm ${
                            selectedOpportunity.status === 'approved' && selectedOpportunity.landlord?.ready_to_receive 
                              ? 'text-foreground' 
                              : 'text-muted-foreground'
                          }`}>
                            Ready for Funding
                          </p>
                          {selectedOpportunity.status === 'approved' && selectedOpportunity.landlord?.ready_to_receive && (
                            <Badge className="text-[9px] px-1.5 py-0 bg-gradient-to-r from-success to-primary text-white border-0">
                              <Sparkles className="h-2 w-2 mr-0.5" />
                              Ready!
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {selectedOpportunity.status === 'approved' && selectedOpportunity.landlord?.ready_to_receive
                            ? 'All verifications complete — fund this opportunity now!'
                            : 'Waiting for all verification steps'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Request Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="font-bold">{selectedOpportunity.duration_days} days</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground">Submitted</p>
                    <p className="font-bold text-sm">
                      {formatDistanceToNow(new Date(selectedOpportunity.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                {/* Warning */}
                {selectedOpportunity.status !== 'approved' && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/30">
                    <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      This request is still being verified. You can fund it once fully approved.
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleViewLandlord}
                    className="flex-1 gap-2"
                  >
                    <Building className="h-4 w-4" />
                    Landlord Info
                  </Button>
                  <Button
                    onClick={() => handleFund(selectedOpportunity)}
                    disabled={selectedOpportunity.status !== 'approved'}
                    className="flex-1 gap-2 bg-gradient-to-r from-success to-success/80"
                  >
                    <HandCoins className="h-4 w-4" />
                    Fund Now
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Landlord Details Dialog */}
      <Dialog open={showLandlordDetails} onOpenChange={setShowLandlordDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              Landlord Details
            </DialogTitle>
          </DialogHeader>

          {selectedOpportunity?.landlord ? (
            <div className="space-y-4">
              {/* Landlord Name */}
              <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                <div className="p-3 rounded-full bg-primary/10">
                  <Building className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-lg">{selectedOpportunity.landlord.name}</p>
                  <div className="flex items-center gap-2">
                    {selectedOpportunity.landlord.verified ? (
                      <Badge className="bg-success/20 text-success border-success/30 gap-1 text-xs">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified Landlord
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Unverified</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground">Contact Information</h4>
                
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="font-medium">{selectedOpportunity.landlord.phone || 'Not provided'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Property Address</p>
                    <p className="font-medium">{selectedOpportunity.landlord.property_address || 'Not provided'}</p>
                  </div>
                </div>
              </div>

              {/* Payment Info */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground">Payment Information</h4>
                
                {selectedOpportunity.landlord.mobile_money_number && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Mobile Money</p>
                      <p className="font-medium">{selectedOpportunity.landlord.mobile_money_number}</p>
                    </div>
                  </div>
                )}

                {selectedOpportunity.landlord.bank_name && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Bank Account</p>
                      <p className="font-medium">{selectedOpportunity.landlord.bank_name}</p>
                      <p className="text-sm text-muted-foreground">{selectedOpportunity.landlord.account_number}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 p-3 rounded-lg bg-success/10 border border-success/20">
                  <Home className="h-4 w-4 text-success" />
                  <div>
                    <p className="text-xs text-muted-foreground">Monthly Rent</p>
                    <p className="font-bold text-success">{formatUGX(selectedOpportunity.landlord.monthly_rent)}</p>
                  </div>
                </div>
              </div>

              {/* Chat/Contact Actions - LARGE & ACCESSIBLE */}
              <div className="space-y-3">
                <p className="text-sm font-bold text-muted-foreground">Contact Landlord</p>
                <div className="flex gap-2">
                  {selectedOpportunity.landlord.user_id ? (
                    <div className="flex-1 h-14 flex items-center justify-center text-sm text-muted-foreground bg-muted/50 rounded-md">
                      On platform
                    </div>
                  ) : (
                    <div className="flex-1 h-14 flex items-center justify-center text-sm text-muted-foreground bg-muted/50 rounded-md">
                      No app account
                    </div>
                  )}
                  {selectedOpportunity.landlord.phone && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => window.open(getWhatsAppLink(selectedOpportunity.landlord!.phone), '_blank')}
                        className="h-14 w-14 p-0 border-2 border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10 touch-manipulation active:scale-95"
                      >
                        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => window.open(`tel:${selectedOpportunity.landlord!.phone}`, '_self')}
                        className="h-14 w-14 p-0 border-2 touch-manipulation active:scale-95"
                      >
                        <Phone className="h-6 w-6" />
                      </Button>
                    </>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowLandlordDetails(false);
                    setShowDetails(true);
                  }}
                  className="w-full h-12 touch-manipulation active:scale-95"
                >
                  Back to Opportunity
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Building className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No landlord information available</p>
              <p className="text-xs text-muted-foreground mt-1">
                The tenant hasn't registered a landlord yet
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Scroll to top button */}
      <ScrollToTopButton scrollThreshold={400} targetId="opportunities" />

      {/* Request Manager Invest Dialog */}
      <RequestManagerInvestDialog
        open={showManagerInvestDialog}
        onOpenChange={setShowManagerInvestDialog}
        suggestedAmount={managerInvestAmount}
        tenantsCount={opportunities.filter(o => o.status !== 'funded').length}
      />

      {/* User Profile Dialog */}
      <UserProfileDialog
        open={!!profileDialogUser}
        onOpenChange={(open) => !open && setProfileDialogUser(null)}
        user={profileDialogUser}
      />
    </>
  );
}

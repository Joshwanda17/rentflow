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
import { PullToRefresh } from '@/components/PullToRefresh';
import { ScrollToTopButton } from '@/components/ScrollToTopButton';
import { Input } from '@/components/ui/input';
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
  X
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
  tenant?: {
    id: string;
    full_name: string;
    avatar_url?: string;
    phone?: string;
  };
  agent?: {
    full_name: string;
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
}

type SortOption = 'newest' | 'oldest' | 'amount_high' | 'amount_low';
type FilterOption = 'all' | 'verified' | 'pending' | 'verifying' | 'watched' | 'unseen' | 'funded' | 'landlord_ready';

interface RentOpportunitiesProps {
  onFund: (id: string, amount: number) => void;
  isLocked?: boolean;
  onLockedClick?: () => void;
  onRefreshRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function RentOpportunities({ onFund, isLocked, onLockedClick, onRefreshRef }: RentOpportunitiesProps) {
  const navigate = useNavigate();
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
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [startingChat, setStartingChat] = useState(false);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<Date | null>(getLastSeenAt());
  const [searchQuery, setSearchQuery] = useState('');

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
    
    // Set up realtime subscription for new rent requests
    const channel = supabase
      .channel('rent-opportunities-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rent_requests',
        },
        (payload) => {
          console.log('[RentOpportunities] New rent request received:', payload.new.id);
          fetchSingleOpportunity(payload.new.id, true); // isNew = true for INSERT
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rent_requests',
        },
        (payload) => {
          console.log('[RentOpportunities] Rent request updated:', payload.new.id, payload.new.status);
          // For updates, refresh the specific opportunity to get full data
          if (['pending', 'approved', 'funded'].includes(payload.new.status)) {
            fetchSingleOpportunity(payload.new.id, false); // isNew = false for UPDATE
          } else {
            // Remove if status changed to rejected or other non-visible status
            setOpportunities(prev => prev.filter(opp => opp.id !== payload.new.id));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'rent_requests',
        },
        (payload) => {
          console.log('[RentOpportunities] Rent request deleted:', payload.old.id);
          setOpportunities(prev => prev.filter(opp => opp.id !== payload.old.id));
        }
      )
      .subscribe((status) => {
        console.log('[RentOpportunities] Realtime subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchWatchedOpportunities = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    
    const { data } = await supabase
      .from('watched_opportunities')
      .select('rent_request_id')
      .eq('user_id', userData.user.id);
    
    if (data) {
      setWatchedIds(new Set(data.map(w => w.rent_request_id)));
    }
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
      // Unwatch
      const { error } = await supabase
        .from('watched_opportunities')
        .delete()
        .eq('user_id', userData.user.id)
        .eq('rent_request_id', opportunityId);
      
      if (!error) {
        setWatchedIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(opportunityId);
          return newSet;
        });
        toast.success('Removed from watchlist');
      }
    } else {
      // Watch
      const { error } = await supabase
        .from('watched_opportunities')
        .insert({
          user_id: userData.user.id,
          rent_request_id: opportunityId
        });
      
      if (!error) {
        setWatchedIds(prev => new Set([...prev, opportunityId]));
        toast.success('🔔 Watching for verification!', {
          description: 'You\'ll receive a push notification when this opportunity is verified and ready to fund.'
        });
      } else if (error.code === '23505') {
        toast.info('Already watching this opportunity');
      }
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
    
    const { data, error } = await supabase
      .from('rent_requests')
      .select(`
        id,
        tenant_id,
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
        landlord:landlords!rent_requests_landlord_id_fkey(id, name, phone, property_address, bank_name, account_number, mobile_money_number, monthly_rent, verified, ready_to_receive)
      `)
      .in('status', ['pending', 'approved', 'funded'])
      .order('created_at', { ascending: false })
      .range(from, to);

    // Fetch tenant profiles and verifier profiles separately
    if (!error && data) {
      const tenantIds = [...new Set(data.map(r => r.tenant_id).filter(Boolean))];
      const agentVerifierIds = [...new Set(data.map(r => r.agent_verified_by).filter(Boolean))] as string[];
      const managerVerifierIds = [...new Set(data.map(r => r.manager_verified_by).filter(Boolean))] as string[];
      const allProfileIds = [...new Set([...tenantIds, ...agentVerifierIds, ...managerVerifierIds])];
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, phone')
        .in('id', allProfileIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      const enrichedData = data.map(r => ({
        ...r,
        tenant: profileMap.get(r.tenant_id) || null,
        agentVerifier: r.agent_verified_by ? profileMap.get(r.agent_verified_by) : null,
        managerVerifier: r.manager_verified_by ? profileMap.get(r.manager_verified_by) : null
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

    // Only process if status is valid for opportunities view
    if (!['pending', 'approved', 'funded'].includes(data.status)) {
      console.log('[RentOpportunities] Skipping opportunity with status:', data.status);
      return;
    }
    
    // Fetch tenant and verifier profiles separately
    const profileIds = [data.tenant_id, data.agent_verified_by, data.manager_verified_by].filter(Boolean) as string[];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, phone')
      .in('id', profileIds);
    
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
    
    const opportunity = {
      ...data,
      tenant: profileMap.get(data.tenant_id) || null,
      agentVerifier: data.agent_verified_by ? profileMap.get(data.agent_verified_by) : null,
      managerVerifier: data.manager_verified_by ? profileMap.get(data.manager_verified_by) : null
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
        return tenantName.includes(query) || rentAmount.includes(query) || formattedAmount.includes(query);
      });
    }

    // Apply filter - 'all' excludes funded by default (funded has its own tab)
    if (filterBy === 'watched') {
      result = result.filter(opp => opp.status !== 'funded' && watchedIds.has(opp.id));
    } else if (filterBy === 'unseen') {
      result = result.filter(opp => opp.status !== 'funded' && (!lastSeenAt || new Date(opp.created_at) > lastSeenAt));
    } else if (filterBy === 'funded') {
      result = result.filter(opp => opp.status === 'funded');
    } else if (filterBy === 'landlord_ready') {
      result = result.filter(opp => opp.status !== 'funded' && opp.landlord?.ready_to_receive === true);
    } else if (filterBy === 'all') {
      // 'all' shows only unfunded opportunities
      result = result.filter(opp => opp.status !== 'funded');
    } else {
      // verified, verifying, pending filters - exclude funded
      result = result.filter(opp => opp.status !== 'funded' && getVerificationStatus(opp) === filterBy);
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
    const unfundedOpps = opportunities.filter(opp => opp.status !== 'funded');
    const verifiedOpps = unfundedOpps.filter(opp => opp.manager_verified && opp.agent_verified);
    const verifyingOpps = unfundedOpps.filter(opp => (opp.agent_verified || opp.manager_verified) && !(opp.agent_verified && opp.manager_verified));
    const pendingOpps = unfundedOpps.filter(opp => !opp.agent_verified && !opp.manager_verified);
    
    const calcTotal = (opps: RentOpportunity[]) => ({
      count: opps.length,
      amount: opps.reduce((sum, opp) => sum + opp.rent_amount, 0),
      roi: opps.reduce((sum, opp) => sum + calculateSupporterReward(opp.rent_amount), 0),
    });
    
    return {
      total: calcTotal(unfundedOpps),
      verified: calcTotal(verifiedOpps),
      verifying: calcTotal(verifyingOpps),
      pending: calcTotal(pendingOpps),
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

  const handleStartChat = async (tenantId: string) => {
    setStartingChat(true);
    try {
      const { data, error } = await supabase.rpc('create_direct_conversation', {
        other_user_id: tenantId
      });

      if (error) throw error;

      toast.success('Chat started!');
      navigate(`/chat?conversation=${data}`);
    } catch (error: any) {
      console.error('Error starting chat:', error);
      toast.error('Failed to start chat');
    } finally {
      setStartingChat(false);
    }
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
      <PullToRefresh onRefresh={handleRefresh} className="min-h-[200px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
        {/* New opportunities banner */}
        {unseenCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary/15 via-primary/10 to-success/15 border border-primary/20 p-3"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/20">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm text-foreground">
                    {unseenCount} new {unseenCount === 1 ? 'opportunity' : 'opportunities'} since last visit
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">Potential earnings:</span>
                    <AnimatePresence mode="wait">
                      <motion.span 
                        key={unseenPotentialEarnings}
                        initial={{ opacity: 0, y: -10, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.8 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="text-xs font-bold text-success flex items-center gap-1"
                      >
                        <TrendingUp className="h-3 w-3" />
                        +{formatUGX(unseenPotentialEarnings)}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllSeen}
                className="h-8 px-2 text-xs shrink-0 hover:bg-primary/10"
              >
                <CheckCheck className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* Summary Card - Total Potential Earnings - SIMPLIFIED FOR MOBILE */}
        {summaryStats.total.count > 0 && (
          <Card className="border-0 bg-gradient-to-br from-success/15 via-background to-primary/15 overflow-hidden shadow-lg">
            <CardContent className="p-5">
              {/* Main Earnings Display - Large & Clear */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-success/20 shadow-inner">
                    <TrendingUp className="h-6 w-6 text-success" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-foreground">Your Potential</p>
                    <p className="text-xs text-muted-foreground">Earnings from all opportunities</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-success tracking-tight">{formatUGX(summaryStats.total.roi)}</p>
                  <p className="text-sm font-medium text-muted-foreground">{summaryStats.total.count} available</p>
                </div>
              </div>
              
              {/* Simple 3-Column Stats - Larger Touch Targets */}
              <div className="grid grid-cols-3 gap-3">
                <button 
                  onClick={() => { hapticTap(); setFilterBy('verified'); }}
                  className={`p-3 rounded-xl transition-all active:scale-95 touch-manipulation ${
                    filterBy === 'verified' 
                      ? 'bg-primary text-primary-foreground ring-2 ring-primary shadow-md' 
                      : 'bg-primary/10 border-2 border-primary/20 hover:bg-primary/20'
                  }`}
                >
                  <CheckCircle2 className={`h-5 w-5 mx-auto mb-1 ${filterBy === 'verified' ? 'text-primary-foreground' : 'text-primary'}`} />
                  <p className={`text-lg font-bold ${filterBy === 'verified' ? 'text-primary-foreground' : 'text-primary'}`}>
                    {summaryStats.verified.count}
                  </p>
                  <p className={`text-xs font-medium ${filterBy === 'verified' ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    Ready
                  </p>
                </button>
                
                <button 
                  onClick={() => { hapticTap(); setFilterBy('verifying'); }}
                  className={`p-3 rounded-xl transition-all active:scale-95 touch-manipulation ${
                    filterBy === 'verifying' 
                      ? 'bg-warning text-warning-foreground ring-2 ring-warning shadow-md' 
                      : 'bg-warning/10 border-2 border-warning/20 hover:bg-warning/20'
                  }`}
                >
                  <Clock className={`h-5 w-5 mx-auto mb-1 ${filterBy === 'verifying' ? 'text-warning-foreground' : 'text-warning'}`} />
                  <p className={`text-lg font-bold ${filterBy === 'verifying' ? 'text-warning-foreground' : 'text-warning'}`}>
                    {summaryStats.verifying.count}
                  </p>
                  <p className={`text-xs font-medium ${filterBy === 'verifying' ? 'text-warning-foreground/80' : 'text-muted-foreground'}`}>
                    Verifying
                  </p>
                </button>
                
                <button 
                  onClick={() => { hapticTap(); setFilterBy('pending'); }}
                  className={`p-3 rounded-xl transition-all active:scale-95 touch-manipulation ${
                    filterBy === 'pending' 
                      ? 'bg-orange-500 text-white ring-2 ring-orange-500 shadow-md' 
                      : 'bg-orange-500/10 border-2 border-orange-500/20 hover:bg-orange-500/20'
                  }`}
                >
                  <Timer className={`h-5 w-5 mx-auto mb-1 ${filterBy === 'pending' ? 'text-white' : 'text-orange-500'}`} />
                  <p className={`text-lg font-bold ${filterBy === 'pending' ? 'text-white' : 'text-orange-600 dark:text-orange-400'}`}>
                    {summaryStats.pending.count}
                  </p>
                  <p className={`text-xs font-medium ${filterBy === 'pending' ? 'text-white/80' : 'text-muted-foreground'}`}>
                    New
                  </p>
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Header - LARGE & ACCESSIBLE */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-success to-success/80 text-white shadow-xl shadow-success/30">
                <TrendingUp className="h-7 w-7" />
              </div>
              {opportunities.length > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[24px] h-6 px-1.5 bg-warning text-warning-foreground text-sm font-bold rounded-full flex items-center justify-center shadow-md">
                  {opportunities.length}
                </span>
              )}
            </div>
            <div>
              <h3 className="font-black text-foreground text-xl tracking-tight">Opportunities</h3>
              <p className="text-sm font-medium text-success">Earn 15% monthly</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unseenCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllSeen}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
              >
                <CheckCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Mark all seen</span>
              </Button>
            )}
            <Badge variant="outline" className="bg-success/10 text-success border-success/30 font-bold text-sm px-3 py-1">
              <Zap className="h-4 w-4 mr-1" />
              Live
            </Badge>
          </div>
        </div>

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

        {/* Quick Filter Chips - SIMPLIFIED & LARGER */}
        <div className="flex gap-2.5 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          {[
            { value: 'all', label: 'All', icon: '📋' },
            { value: 'verified', label: 'Ready', icon: '✅' },
            { value: 'verifying', label: 'Verifying', icon: '⏳' },
            { value: 'pending', label: 'New', icon: '🆕' },
            { value: 'watched', label: 'Watching', icon: '👁️' },
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => {
                hapticTap();
                setFilterBy(filter.value as FilterOption);
              }}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all active:scale-95 touch-manipulation min-h-[48px] ${
                filterBy === filter.value
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-2 ring-primary'
                  : 'bg-muted/80 text-foreground hover:bg-muted border-2 border-transparent'
              }`}
            >
              <span className="text-base">{filter.icon}</span>
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

        {/* Opportunities List - OPTIMIZED FOR SMALL SCREENS */}
        <div className="space-y-4">
          <AnimatePresence>
            {filteredAndSortedOpportunities.map((opportunity, index) => {
              const isFunded = opportunity.status === 'funded';
              const reward = calculateSupporterReward(opportunity.rent_amount);
              const isNew = opportunity.id === newOpportunityId;
              const isUnseen = !lastSeenAt || new Date(opportunity.created_at) > lastSeenAt;
              const verificationStatus = getVerificationStatus(opportunity);
              const stepsComplete = getVerificationStepCount(opportunity);
              
              return (
                <motion.div
                  key={opportunity.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => handleCardClick(opportunity)}
                  className="cursor-pointer touch-manipulation active:scale-[0.98] transition-transform"
                >
                  <Card className={`border-2 overflow-hidden shadow-lg ${
                    isFunded
                      ? 'bg-gradient-to-br from-primary/20 to-primary/5 border-primary/40'
                      : isNew 
                        ? 'bg-gradient-to-br from-success/20 to-success/5 border-success/50 ring-2 ring-success/30' 
                        : verificationStatus === 'verified'
                          ? 'bg-gradient-to-br from-primary/15 to-success/10 border-primary/30'
                          : verificationStatus === 'verifying'
                            ? 'bg-gradient-to-br from-warning/15 to-warning/5 border-warning/30'
                            : 'bg-gradient-to-br from-orange-500/10 to-muted/50 border-orange-500/30'
                  }`}>
                    <CardContent className="p-5">
                      {/* TOP ROW: Status + Watch Button */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {isNew && (
                            <Badge className="bg-success text-success-foreground text-xs font-bold px-2.5 py-1 animate-pulse">
                              <Sparkles className="h-3.5 w-3.5 mr-1" />
                              NEW
                            </Badge>
                          )}
                          {getStatusBadge(opportunity)}
                        </div>
                        
                        {/* Watch Button - Large Touch Target */}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={(e) => handleWatch(e, opportunity.id)}
                                disabled={watchingId === opportunity.id}
                                className={`p-3 rounded-xl transition-all touch-manipulation active:scale-90 min-w-[48px] min-h-[48px] flex items-center justify-center ${
                                  watchedIds.has(opportunity.id)
                                    ? 'bg-warning text-warning-foreground shadow-md'
                                    : 'bg-muted/80 text-muted-foreground hover:bg-warning/20 hover:text-warning'
                                }`}
                              >
                                {watchedIds.has(opportunity.id) ? (
                                  <BookmarkCheck className="h-5 w-5" />
                                ) : (
                                  <Bell className="h-5 w-5" />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <p className="text-xs font-medium">
                                {watchedIds.has(opportunity.id) ? 'Watching' : 'Watch for updates'}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                      {/* MAIN CONTENT: Amount & ROI - LARGE & CLEAR */}
                      <div className="flex items-center gap-4 mb-4">
                        <UserAvatar 
                          avatarUrl={opportunity.tenant?.avatar_url} 
                          fullName={opportunity.tenant?.full_name || 'Tenant'} 
                          size="lg"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-base text-foreground truncate mb-1">
                            {opportunity.tenant?.full_name || 'Anonymous Tenant'}
                          </p>
                          
                          {/* Amount - EXTRA LARGE */}
                          <p className="font-black text-3xl text-foreground tracking-tight">
                            {formatUGX(opportunity.rent_amount)}
                          </p>
                        </div>
                      </div>

                      {/* ROI & Duration - PROMINENT */}
                      <div className="flex items-center gap-4 p-3 rounded-xl bg-success/10 border border-success/20 mb-4">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-success/20">
                            <TrendingUp className="h-5 w-5 text-success" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground font-medium">Your Earnings</p>
                            <p className="text-xl font-black text-success">+{formatUGX(reward)}</p>
                          </div>
                        </div>
                        <div className="ml-auto text-right">
                          <p className="text-xs text-muted-foreground font-medium">Duration</p>
                          <p className="text-lg font-bold text-foreground">{opportunity.duration_days} days</p>
                        </div>
                      </div>

                      {/* QUICK FUND BUTTON - Only for verified opportunities */}
                      {opportunity.agent_verified && opportunity.manager_verified && opportunity.status !== 'funded' && (
                        <Button
                          size="lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            hapticTap();
                            if (isLocked) {
                              onLockedClick?.();
                            } else {
                              onFund(opportunity.id, opportunity.rent_amount);
                            }
                          }}
                          className="w-full h-14 text-lg font-black gap-3 bg-gradient-to-r from-success to-primary hover:from-success/90 hover:to-primary/90 text-white shadow-lg touch-manipulation active:scale-[0.98] mb-4"
                        >
                          <Zap className="h-6 w-6" />
                          Quick Fund — Earn {formatUGX(reward)}
                        </Button>
                      )}

                      {/* Verification Progress - SIMPLIFIED */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Verification Progress</span>
                          <span className="text-sm font-bold text-foreground">{stepsComplete}/4 Complete</span>
                        </div>
                        <div className="flex gap-1.5">
                          {/* Step 1: Agent */}
                          <div className={`h-3 flex-1 rounded-full transition-colors ${
                            opportunity.agent_verified ? 'bg-success' : 'bg-muted'
                          }`} />
                          {/* Step 2: Manager */}
                          <div className={`h-3 flex-1 rounded-full transition-colors ${
                            opportunity.manager_verified ? 'bg-primary' : 'bg-muted'
                          }`} />
                          {/* Step 3: Landlord */}
                          <div className={`h-3 flex-1 rounded-full transition-colors ${
                            opportunity.landlord?.ready_to_receive ? 'bg-warning' : 'bg-muted'
                          }`} />
                          {/* Step 4: Ready */}
                          <div className={`h-3 flex-1 rounded-full transition-colors ${
                            opportunity.status === 'approved' && opportunity.landlord?.ready_to_receive
                              ? 'bg-gradient-to-r from-success to-primary' 
                              : 'bg-muted'
                          }`} />
                        </div>
                      </div>

                      {/* QUICK CONTACT BUTTONS - Large Touch Targets */}
                      <div className="mt-4 pt-3 border-t border-border/50 space-y-3">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Quick Contact</p>
                        
                        {/* Tenant Contact Row */}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              hapticTap();
                              handleStartChat(opportunity.tenant_id);
                            }}
                            disabled={startingChat}
                            className="flex-1 h-12 gap-2 bg-primary hover:bg-primary/90 text-base font-bold touch-manipulation active:scale-95"
                          >
                            <MessageCircle className="h-5 w-5" />
                            Chat Tenant
                          </Button>
                          
                          {opportunity.tenant?.phone && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  hapticTap();
                                  window.open(getWhatsAppLink(opportunity.tenant!.phone!), '_blank');
                                }}
                                className="h-12 w-12 p-0 border-2 border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10 touch-manipulation active:scale-95"
                              >
                                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  hapticTap();
                                  window.open(`tel:${opportunity.tenant!.phone}`, '_self');
                                }}
                                className="h-12 w-12 p-0 border-2 text-foreground touch-manipulation active:scale-95"
                              >
                                <Phone className="h-5 w-5" />
                              </Button>
                            </>
                          )}
                        </div>

                        {/* Landlord Contact Row */}
                        {opportunity.landlord && (
                          <div className="flex gap-2">
                            {opportunity.landlord.user_id ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  hapticTap();
                                  handleStartChat(opportunity.landlord!.user_id!);
                                }}
                                disabled={startingChat}
                                className="flex-1 h-12 gap-2 text-base font-bold touch-manipulation active:scale-95"
                              >
                                <Building className="h-5 w-5" />
                                Chat Landlord
                              </Button>
                            ) : (
                              <div className="flex-1 h-12 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground bg-muted/50 rounded-md">
                                <Building className="h-4 w-4" />
                                <span className="truncate">{opportunity.landlord.name}</span>
                              </div>
                            )}
                            
                            {opportunity.landlord.phone && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    hapticTap();
                                    window.open(getWhatsAppLink(opportunity.landlord!.phone), '_blank');
                                  }}
                                  className="h-12 w-12 p-0 border-2 border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10 touch-manipulation active:scale-95"
                                >
                                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                  </svg>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    hapticTap();
                                    window.open(`tel:${opportunity.landlord!.phone}`, '_self');
                                  }}
                                  className="h-12 w-12 p-0 border-2 text-foreground touch-manipulation active:scale-95"
                                >
                                  <Phone className="h-5 w-5" />
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Footer: Time */}
                      <div className="flex items-center justify-center mt-3 pt-2 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 mr-1.5" />
                        <span>{formatDistanceToNow(new Date(opportunity.created_at), { addSuffix: true })}</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
          
          {/* Infinite scroll trigger */}
          <div ref={loadMoreRef} className="py-4">
            {loadingMore && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading more...</span>
              </div>
            )}
            {!hasMore && opportunities.length > 0 && (
              <p className="text-xs text-center text-muted-foreground">
                You've seen all {opportunities.length} opportunities
              </p>
            )}
          </div>
        </div>

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
      </PullToRefresh>

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
                    <Button
                      onClick={() => handleStartChat(selectedOpportunity.tenant_id)}
                      disabled={startingChat}
                      className="flex-1 h-14 gap-3 bg-primary hover:bg-primary/90 text-base font-bold touch-manipulation active:scale-95"
                    >
                      <MessageCircle className="h-6 w-6" />
                      Chat in App
                    </Button>
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
                        <Button
                          onClick={() => handleStartChat(selectedOpportunity.landlord!.user_id!)}
                          disabled={startingChat}
                          variant="secondary"
                          className="flex-1 h-14 gap-3 text-base font-bold touch-manipulation active:scale-95"
                        >
                          <MessageCircle className="h-6 w-6" />
                          Chat in App
                        </Button>
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
                    <Button
                      onClick={() => handleStartChat(selectedOpportunity.landlord!.user_id!)}
                      disabled={startingChat}
                      className="flex-1 h-14 gap-3 bg-primary hover:bg-primary/90 text-base font-bold touch-manipulation active:scale-95"
                    >
                      <MessageCircle className="h-6 w-6" />
                      Chat in App
                    </Button>
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
    </>
  );
}

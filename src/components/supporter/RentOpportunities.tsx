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
type FilterOption = 'all' | 'verified' | 'pending' | 'verifying' | 'watched' | 'unseen' | 'funded';

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
    
    const channel = supabase
      .channel('rent-opportunities')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rent_requests',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            fetchSingleOpportunity(payload.new.id);
          } else if (payload.eventType === 'UPDATE') {
            setOpportunities(prev => 
              prev.map(opp => 
                opp.id === payload.new.id ? { ...opp, ...payload.new } : opp
              ).filter(opp => ['pending', 'approved', 'funded'].includes(opp.status))
            );
          } else if (payload.eventType === 'DELETE') {
            setOpportunities(prev => prev.filter(opp => opp.id !== payload.old.id));
          }
        }
      )
      .subscribe();

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
        toast.success('Added to watchlist! You\'ll be notified when verified.');
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
        agent:profiles!rent_requests_agent_id_fkey(full_name),
        landlord:landlords!rent_requests_landlord_id_fkey(id, name, phone, property_address, bank_name, account_number, mobile_money_number, monthly_rent, verified)
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

  const fetchSingleOpportunity = async (id: string) => {
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
        agent:profiles!rent_requests_agent_id_fkey(full_name),
        landlord:landlords!rent_requests_landlord_id_fkey(id, name, phone, property_address, bank_name, account_number, mobile_money_number, monthly_rent, verified)
      `)
      .eq('id', id)
      .single();

    if (!error && data) {
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
      
      setOpportunities(prev => [opportunity, ...prev]);
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
    if (opp.agent_verified) progress += 50;
    if (opp.manager_verified) progress += 50;
    return progress;
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

  // Calculate potential ROI for each filter category
  const filterROI = useMemo(() => {
    const calcROI = (opps: RentOpportunity[]) => 
      opps.reduce((sum, opp) => sum + calculateSupporterReward(opp.rent_amount), 0);
    
    const unfundedOpps = opportunities.filter(opp => opp.status !== 'funded');
    const unseenOpps = unfundedOpps.filter(opp => !lastSeenAt || new Date(opp.created_at) > lastSeenAt);
    const watchedOpps = unfundedOpps.filter(opp => watchedIds.has(opp.id));
    const fundedOpps = opportunities.filter(opp => opp.status === 'funded');
    const verifiedOpps = unfundedOpps.filter(opp => opp.manager_verified && opp.agent_verified);
    const verifyingOpps = unfundedOpps.filter(opp => (opp.agent_verified || opp.manager_verified) && !(opp.agent_verified && opp.manager_verified));
    const pendingOpps = unfundedOpps.filter(opp => !opp.agent_verified && !opp.manager_verified);

    return {
      all: calcROI(unfundedOpps),
      unseen: calcROI(unseenOpps),
      watched: calcROI(watchedOpps),
      funded: calcROI(fundedOpps),
      verified: calcROI(verifiedOpps),
      verifying: calcROI(verifyingOpps),
      pending: calcROI(pendingOpps),
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
          <Badge className="bg-muted text-muted-foreground gap-1">
            <Timer className="h-3 w-3" />
            New
          </Badge>
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
    
    return (
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Agent Verification Badge */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant="outline" 
                className={`text-[10px] px-1.5 py-0.5 gap-1 cursor-help ${
                  opp.agent_verified 
                    ? 'bg-success/10 text-success border-success/30' 
                    : 'bg-muted/50 text-muted-foreground border-muted-foreground/20'
                }`}
              >
                {opp.agent_verified ? (
                  <CheckCircle2 className="h-2.5 w-2.5" />
                ) : (
                  <Clock className="h-2.5 w-2.5" />
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
                className={`text-[10px] px-1.5 py-0.5 gap-1 cursor-help ${
                  opp.manager_verified 
                    ? 'bg-primary/10 text-primary border-primary/30' 
                    : 'bg-muted/50 text-muted-foreground border-muted-foreground/20'
                }`}
              >
                {opp.manager_verified ? (
                  <CheckCircle2 className="h-2.5 w-2.5" />
                ) : (
                  <Clock className="h-2.5 w-2.5" />
                )}
                Manager {opp.manager_verified ? '✓' : '○'}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[200px] text-xs">
              <p>{managerTooltip}</p>
            </TooltipContent>
          </Tooltip>
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

        {/* Summary Card - Total Potential Earnings */}
        {summaryStats.total.count > 0 && (
          <Card className="border-0 bg-gradient-to-br from-success/10 via-background to-primary/10 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-success/20">
                    <TrendingUp className="h-4 w-4 text-success" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">Potential Earnings</span>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-success">{formatUGX(summaryStats.total.roi)}</p>
                  <p className="text-[10px] text-muted-foreground">{summaryStats.total.count} opportunities</p>
                </div>
              </div>
              
              {/* Breakdown by verification status */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                    <span className="text-[10px] font-medium text-muted-foreground">Verified</span>
                  </div>
                  <p className="text-sm font-bold text-primary">{formatUGX(summaryStats.verified.roi)}</p>
                  <p className="text-[9px] text-muted-foreground">{summaryStats.verified.count} ready</p>
                </div>
                
                <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/20">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="h-3 w-3 text-warning" />
                    <span className="text-[10px] font-medium text-muted-foreground">Verifying</span>
                  </div>
                  <p className="text-sm font-bold text-warning">{formatUGX(summaryStats.verifying.roi)}</p>
                  <p className="text-[9px] text-muted-foreground">{summaryStats.verifying.count} in progress</p>
                </div>
                
                <div className="p-2.5 rounded-lg bg-muted/60 border border-border/40">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Timer className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-medium text-muted-foreground">Pending</span>
                  </div>
                  <p className="text-sm font-bold text-foreground">{formatUGX(summaryStats.pending.roi)}</p>
                  <p className="text-[9px] text-muted-foreground">{summaryStats.pending.count} new</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-success to-success/80 text-white shadow-lg shadow-success/25">
                <TrendingUp className="h-5 w-5" />
              </div>
              {opportunities.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-warning text-warning-foreground text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {opportunities.length}
                </span>
              )}
            </div>
            <div>
              <h3 className="font-bold text-foreground text-lg">Investment Opportunities</h3>
              <p className="text-xs text-muted-foreground">Earn 15% monthly returns</p>
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
            <Badge variant="outline" className="bg-success/10 text-success border-success/30 font-semibold">
              <Zap className="h-3 w-3 mr-1" />
              Live
            </Badge>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by tenant name or amount..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 h-10 bg-muted/40 border-muted-foreground/20 focus:bg-background"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Quick Filter Chips with ROI */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          {[
            { value: 'all', label: 'All', icon: null, count: null },
            { value: 'unseen', label: 'New', icon: '🔵', count: unseenCount },
            { value: 'watched', label: 'Watching', icon: '⭐', count: watchedIds.size },
            { value: 'funded', label: 'Funded', icon: '💰', count: null },
            { value: 'verified', label: 'Verified', icon: '✓', count: null },
            { value: 'verifying', label: 'Verifying', icon: '⏳', count: null },
            { value: 'pending', label: 'Pending', icon: '🆕', count: null },
          ].map((filter) => {
            const roi = filterROI[filter.value as keyof typeof filterROI] || 0;
            const formattedROI = roi >= 1000000 
              ? `${(roi / 1000000).toFixed(1)}M` 
              : roi >= 1000 
                ? `${Math.round(roi / 1000)}K` 
                : roi > 0 
                  ? roi.toString() 
                  : '';
            
            return (
              <button
                key={filter.value}
                onClick={() => {
                  hapticTap();
                  setFilterBy(filter.value as FilterOption);
                }}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all active:scale-95 touch-manipulation min-w-[60px] ${
                  filterBy === filter.value
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-1">
                  {filter.icon && <span className="text-[10px]">{filter.icon}</span>}
                  <span>{filter.label}</span>
                  {filter.count !== null && filter.count > 0 && (
                    <span className={`text-[10px] ${filterBy === filter.value ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                      ({filter.count})
                    </span>
                  )}
                </div>
                {formattedROI && roi > 0 && (
                  <span className={`text-[9px] font-bold ${
                    filterBy === filter.value 
                      ? 'text-primary-foreground/90' 
                      : 'text-success'
                  }`}>
                    +{formattedROI}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sort Dropdown */}
        <div className="flex gap-2 items-center">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-auto h-8 text-xs gap-1.5 border-dashed">
              <ArrowUpDown className="h-3 w-3" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="amount_high">Highest Amount</SelectItem>
              <SelectItem value="amount_low">Lowest Amount</SelectItem>
            </SelectContent>
          </Select>

          {watchedIds.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/my-watchlist')}
              className="h-8 px-2 text-xs shrink-0 gap-1"
            >
              <Bookmark className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">View Watchlist</span>
            </Button>
          )}
        </div>

        {/* Opportunities List */}
        <div className="space-y-3">
          <AnimatePresence>
            {filteredAndSortedOpportunities.map((opportunity, index) => {
              const isFunded = opportunity.status === 'funded';
              const reward = calculateSupporterReward(opportunity.rent_amount);
              const isNew = opportunity.id === newOpportunityId;
              const isUnseen = !lastSeenAt || new Date(opportunity.created_at) > lastSeenAt;
              const verificationProgress = getVerificationProgress(opportunity);
              
              return (
                <motion.div
                  key={opportunity.id}
                  initial={{ opacity: 0, x: -20, scale: 0.95 }}
                  animate={{ 
                    opacity: 1, 
                    x: 0, 
                    scale: 1,
                  }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => handleCardClick(opportunity)}
                  className="cursor-pointer"
                >
                  <Card className={`border-0 overflow-hidden transition-all hover:scale-[1.02] relative ${
                    isFunded
                      ? 'bg-gradient-to-r from-primary/15 via-primary/5 to-transparent ring-1 ring-primary/30'
                      : isNew 
                        ? 'bg-gradient-to-r from-success/20 via-success/10 to-transparent ring-2 ring-success/50' 
                        : isUnseen
                          ? 'bg-gradient-to-r from-primary/10 via-card to-success/5 ring-1 ring-primary/20'
                          : 'bg-gradient-to-r from-card via-card to-success/5 hover:from-success/5'
                  }`}>
                    {/* Unseen indicator dot */}
                    {isUnseen && !isNew && (
                      <div className="absolute top-3 right-3 z-10">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                        </span>
                      </div>
                    )}
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {/* Tenant Avatar */}
                        <UserAvatar 
                          avatarUrl={opportunity.tenant?.avatar_url} 
                          fullName={opportunity.tenant?.full_name || 'Tenant'} 
                          size="md"
                        />

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {isNew && (
                              <Badge className="bg-success text-success-foreground text-[10px] animate-pulse">
                                <Sparkles className="h-3 w-3 mr-1" />
                                NEW
                              </Badge>
                            )}
                            {getStatusBadge(opportunity)}
                          </div>
                          
                          {/* Tenant Name - Clickable */}
                          <p className="font-semibold text-sm text-foreground truncate">
                            {opportunity.tenant?.full_name || 'Anonymous Tenant'}
                          </p>
                          
                          <p className="font-black text-xl text-foreground mt-1">
                            {formatUGX(opportunity.rent_amount)}
                          </p>
                          
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-sm font-semibold text-success flex items-center gap-1">
                              <TrendingUp className="h-3.5 w-3.5" />
                              +{formatUGX(reward)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {opportunity.duration_days} days
                            </span>
                          </div>

                          {/* Verification Progress */}
                          <div className="mt-2 space-y-1.5">
                            <Progress value={verificationProgress} className="h-1.5" />
                            {renderVerificationBadges(opportunity)}
                          </div>
                        </div>

                        {/* Watch & View Actions */}
                        <div className="flex flex-col items-center gap-2">
                          {/* Watch Button */}
                          <button
                            onClick={(e) => handleWatch(e, opportunity.id)}
                            disabled={watchingId === opportunity.id}
                            className={`p-2 rounded-full transition-all ${
                              watchedIds.has(opportunity.id)
                                ? 'bg-warning/20 text-warning'
                                : 'bg-muted/50 text-muted-foreground hover:bg-warning/10 hover:text-warning'
                            }`}
                          >
                            {watchedIds.has(opportunity.id) ? (
                              <BookmarkCheck className="h-4 w-4" />
                            ) : (
                              <Bookmark className="h-4 w-4" />
                            )}
                          </button>
                          {/* View Details */}
                          <div className="p-2 rounded-full bg-success/10 text-success">
                            <Eye className="h-4 w-4" />
                          </div>
                        </div>
                      </div>

                      {/* Time & Landlord info */}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatDistanceToNow(new Date(opportunity.created_at), { addSuffix: true })}</span>
                        </div>
                        {opportunity.landlord && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Home className="h-3 w-3" />
                            <span className="truncate max-w-[120px]">{opportunity.landlord.name}</span>
                          </div>
                        )}
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

        {/* Results info */}
        {filterBy !== 'all' && (
          <p className="text-xs text-center text-muted-foreground">
            Showing {filteredAndSortedOpportunities.length} of {opportunities.length} opportunities
          </p>
        )}

        {/* Tip */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-success/10 border border-primary/20">
          <div className="p-2 rounded-lg bg-primary/20">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Secure Investment</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap any opportunity to view details, chat with tenant, or see landlord info.
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
                {/* Quick Chat Actions */}
                <div className="flex gap-2 p-3 rounded-xl bg-gradient-to-r from-primary/10 to-success/10 border border-primary/20">
                  <Button
                    size="sm"
                    onClick={() => handleStartChat(selectedOpportunity.tenant_id)}
                    disabled={startingChat}
                    className="flex-1 gap-2 bg-primary hover:bg-primary/90"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Chat Tenant
                  </Button>
                  {selectedOpportunity.landlord?.user_id ? (
                    <Button
                      size="sm"
                      onClick={() => handleStartChat(selectedOpportunity.landlord!.user_id!)}
                      disabled={startingChat}
                      variant="outline"
                      className="flex-1 gap-2"
                    >
                      <Building className="h-4 w-4" />
                      Chat Landlord
                    </Button>
                  ) : selectedOpportunity.landlord?.phone && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={() => window.open(`tel:${selectedOpportunity.landlord?.phone}`, '_self')}
                    >
                      <Phone className="h-4 w-4" />
                      Call Landlord
                    </Button>
                  )}
                </div>

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

                {/* Verification Process */}
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Verification Status
                  </h4>

                  <div className="space-y-2">
                    {/* Agent Verification */}
                    <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                      selectedOpportunity.agent_verified 
                        ? 'bg-success/10 border-success/30' 
                        : 'bg-muted/50 border-muted'
                    }`}>
                      <div className={`p-2 rounded-full ${
                        selectedOpportunity.agent_verified 
                          ? 'bg-success/20 text-success' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <UserCheck className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">Agent Verification</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedOpportunity.agent_verified 
                            ? `Verified ${selectedOpportunity.agent_verified_at ? formatDistanceToNow(new Date(selectedOpportunity.agent_verified_at), { addSuffix: true }) : ''}`
                            : 'Pending agent review'
                          }
                        </p>
                      </div>
                      {selectedOpportunity.agent_verified ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : (
                        <Clock className="h-5 w-5 text-muted-foreground animate-pulse" />
                      )}
                    </div>

                    {/* Manager Verification */}
                    <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                      selectedOpportunity.manager_verified 
                        ? 'bg-success/10 border-success/30' 
                        : 'bg-muted/50 border-muted'
                    }`}>
                      <div className={`p-2 rounded-full ${
                        selectedOpportunity.manager_verified 
                          ? 'bg-success/20 text-success' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <Shield className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">Manager Approval</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedOpportunity.manager_verified 
                            ? `Approved ${selectedOpportunity.manager_verified_at ? formatDistanceToNow(new Date(selectedOpportunity.manager_verified_at), { addSuffix: true }) : ''}`
                            : 'Awaiting manager approval'
                          }
                        </p>
                      </div>
                      {selectedOpportunity.manager_verified ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : (
                        <Clock className="h-5 w-5 text-muted-foreground animate-pulse" />
                      )}
                    </div>

                    {/* Ready Status */}
                    <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                      selectedOpportunity.status === 'approved' 
                        ? 'bg-success/10 border-success/30' 
                        : 'bg-muted/50 border-muted'
                    }`}>
                      <div className={`p-2 rounded-full ${
                        selectedOpportunity.status === 'approved' 
                          ? 'bg-success/20 text-success' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <HandCoins className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">Ready for Funding</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedOpportunity.status === 'approved' 
                            ? 'This request is verified and ready!'
                            : 'Waiting for full verification'
                          }
                        </p>
                      </div>
                      {selectedOpportunity.status === 'approved' ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : (
                        <Clock className="h-5 w-5 text-muted-foreground" />
                      )}
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

              {/* Chat/Contact Actions */}
              <div className="flex gap-2">
                {selectedOpportunity.landlord.user_id ? (
                  <Button
                    onClick={() => handleStartChat(selectedOpportunity.landlord!.user_id!)}
                    disabled={startingChat}
                    className="flex-1 gap-2 bg-primary hover:bg-primary/90"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Chat Landlord
                  </Button>
                ) : selectedOpportunity.landlord.phone && (
                  <Button
                    className="flex-1 gap-2"
                    onClick={() => window.open(`tel:${selectedOpportunity.landlord?.phone}`, '_self')}
                  >
                    <Phone className="h-4 w-4" />
                    Call Landlord
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowLandlordDetails(false);
                    setShowDetails(true);
                  }}
                  className="flex-1"
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

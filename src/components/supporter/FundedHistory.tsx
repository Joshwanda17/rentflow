import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { UserAvatar } from '@/components/UserAvatar';
import { ScrollToTopButton } from '@/components/ScrollToTopButton';
import { 
  History, 
  TrendingUp, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  ChevronDown,
  ChevronUp,
  Wallet,
  User,
  Home,
  CreditCard,
  Banknote,
  AlertCircle,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { hapticSuccess } from '@/lib/haptics';
import { toast } from 'sonner';

type FilterMode = 'all' | 'mine';

interface FundedRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
  total_repayment: number;
  daily_repayment: number;
  status: string;
  funded_at: string;
  created_at: string;
  supporter_id?: string;
  supporter?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
  tenant?: {
    id: string;
    full_name: string;
    avatar_url?: string;
    phone?: string;
  };
  landlord?: {
    id: string;
    name: string;
    property_address?: string;
  };
}

interface Repayment {
  id: string;
  amount: number;
  payment_date: string;
  created_at: string;
}

interface ROIPayment {
  id: string;
  roi_amount: number;
  payment_number: number;
  due_date: string;
  paid_at: string | null;
  status: string;
}

interface FundedRequestWithDetails extends FundedRequest {
  repayments: Repayment[];
  roiPayments: ROIPayment[];
  totalRepaid: number;
  totalROIEarned: number;
  repaymentProgress: number;
}

export function FundedHistory() {
  const [fundedRequests, setFundedRequests] = useState<FundedRequestWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchFundedHistory(true);
  }, [filterMode]);

  const fetchFundedHistory = async (reset: boolean = true) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoading(false);
      return;
    }
    
    setCurrentUserId(userData.user.id);

    if (reset) {
      setLoading(true);
      setPage(0);
    } else {
      setLoadingMore(true);
    }

    const currentPage = reset ? 0 : page;
    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Build query based on filter mode
    let query = supabase
      .from('rent_requests')
      .select(`
        id,
        rent_amount,
        duration_days,
        total_repayment,
        daily_repayment,
        status,
        funded_at,
        created_at,
        supporter_id,
        tenant:profiles!rent_requests_tenant_id_fkey(id, full_name, avatar_url, phone),
        landlord:landlords!rent_requests_landlord_id_fkey(id, name, property_address)
      `)
      .eq('status', 'funded');
    
    // Filter by current user if "My Funded" is selected
    if (filterMode === 'mine') {
      query = query.eq('supporter_id', userData.user.id);
    }
    
    const { data: requests, error } = await query
      .order('funded_at', { ascending: false })
      .range(from, to);

    if (error || !requests) {
      console.error('Error fetching funded history:', error);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    // Fetch supporter profiles for all requests
    const supporterIds = [...new Set((requests as any[]).map(r => r.supporter_id).filter(Boolean))];
    let supporterMap = new Map<string, { id: string; full_name: string; avatar_url?: string }>();
    
    if (supporterIds.length > 0) {
      const { data: supporters } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', supporterIds);
      
      if (supporters) {
        supporterMap = new Map(supporters.map(s => [s.id, s]));
      }
    }

    // Fetch details for each request (repayments and ROI tables removed - stub)
    const requestsWithDetails = await Promise.all(
      (requests as unknown as FundedRequest[]).map(async (request) => {
        // repayments, landlord_payment_proofs, supporter_roi_payments tables removed
        const repayments: any[] = [];
        const roiPayments: ROIPayment[] = [];

        const totalRepaid = (repayments || []).reduce((sum, r) => sum + Number(r.amount), 0);
        const totalROIEarned = roiPayments
          .filter(r => r.status === 'paid')
          .reduce((sum, r) => sum + Number(r.roi_amount), 0);
        const repaymentProgress = request.total_repayment > 0 
          ? Math.min((totalRepaid / request.total_repayment) * 100, 100) 
          : 0;

        return {
          ...request,
          supporter: request.supporter_id ? supporterMap.get(request.supporter_id) : undefined,
          repayments: repayments || [],
          roiPayments,
          totalRepaid,
          totalROIEarned,
          repaymentProgress
        } as FundedRequestWithDetails;
      })
    );

    if (reset) {
      setFundedRequests(requestsWithDetails);
    } else {
      setFundedRequests(prev => [...prev, ...requestsWithDetails]);
    }
    setHasMore(requests.length === PAGE_SIZE);
    setPage(currentPage + 1);
    setLoading(false);
    setLoadingMore(false);
  };

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      fetchFundedHistory(false);
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
    await fetchFundedHistory(true);
    hapticSuccess();
    toast.success('Funded history refreshed');
  }, []);

  const getStatusBadge = (progress: number, status: string) => {
    if (progress >= 100) {
      return (
        <Badge className="bg-success/20 text-success border-success/30 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Fully Repaid
        </Badge>
      );
    }
    if (progress > 0) {
      return (
        <Badge className="bg-primary/20 text-primary border-primary/30 gap-1">
          <Clock className="h-3 w-3" />
          Repaying
        </Badge>
      );
    }
    return (
      <Badge className="bg-warning/20 text-warning border-warning/30 gap-1">
        <AlertCircle className="h-3 w-3" />
        Awaiting
      </Badge>
    );
  };

  // Calculate totals
  const totalFunded = fundedRequests.reduce((sum, r) => sum + Number(r.rent_amount), 0);
  const totalROIEarned = fundedRequests.reduce((sum, r) => sum + r.totalROIEarned, 0);
  const expectedROI = fundedRequests.reduce((sum, r) => sum + calculateSupporterReward(r.rent_amount), 0);

  if (loading) {
    return (
      <Card className="border-0 bg-gradient-to-br from-primary/5 via-background to-success/5">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-48 bg-muted rounded" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-muted/50 rounded-xl" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (fundedRequests.length === 0) {
    return (
      <Card className="border-0 bg-gradient-to-br from-muted/50 to-muted/30">
        <CardContent className="p-8 text-center space-y-4">
          <div className="p-6 rounded-full bg-muted/50 w-fit mx-auto">
            <History className="h-12 w-12 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-xl text-foreground">No Funded Requests Yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your funded rent requests will appear here with repayment tracking
            </p>
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
      {/* Filter Toggle */}
      <div className="flex items-center gap-2 p-1 bg-muted/50 rounded-lg w-fit">
        <Button
          variant={filterMode === 'all' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setFilterMode('all')}
          className="h-8 px-3 text-xs"
        >
          All Funded
        </Button>
        <Button
          variant={filterMode === 'mine' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setFilterMode('mine')}
          className="h-8 px-3 text-xs"
        >
          My Funded
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-0 bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="p-3 text-center">
            <Wallet className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-[10px] text-muted-foreground">Total Funded</p>
            <p className="font-bold text-sm text-foreground">{formatUGX(totalFunded)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-gradient-to-br from-success/10 to-success/5">
          <CardContent className="p-3 text-center">
            <TrendingUp className="h-4 w-4 mx-auto text-success mb-1" />
            <p className="text-[10px] text-muted-foreground">ROI Earned</p>
            <p className="font-bold text-sm text-success">{formatUGX(totalROIEarned)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-gradient-to-br from-warning/10 to-warning/5">
          <CardContent className="p-3 text-center">
            <Sparkles className="h-4 w-4 mx-auto text-warning mb-1" />
            <p className="text-[10px] text-muted-foreground">Expected</p>
            <p className="font-bold text-sm text-warning">{formatUGX(expectedROI)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg shadow-primary/25">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-lg">Funded History</h3>
            <p className="text-xs text-muted-foreground">{fundedRequests.length} funded requests</p>
          </div>
        </div>
      </div>

      {/* Funded Requests List */}
      <div className="space-y-3">
        <AnimatePresence>
          {fundedRequests.map((request, index) => {
            const reward = calculateSupporterReward(request.rent_amount);
            const isExpanded = expandedId === request.id;
            const daysSinceFunding = differenceInDays(new Date(), new Date(request.funded_at));

            return (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
              >
                <Collapsible open={isExpanded} onOpenChange={() => setExpandedId(isExpanded ? null : request.id)}>
                  <Card className={`border-0 overflow-hidden transition-all ${
                    request.repaymentProgress >= 100
                      ? 'bg-gradient-to-r from-success/10 via-card to-success/5'
                      : 'bg-gradient-to-r from-primary/10 via-card to-primary/5'
                  }`}>
                    <CollapsibleTrigger asChild>
                      <CardContent className="p-4 cursor-pointer hover:bg-muted/20 transition-colors">
                        <div className="flex items-start gap-4">
                          {/* Tenant Avatar */}
                          <UserAvatar 
                            avatarUrl={request.tenant?.avatar_url} 
                            fullName={request.tenant?.full_name || 'Tenant'} 
                            size="md"
                          />

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {getStatusBadge(request.repaymentProgress, request.status)}
                              {request.supporter_id === currentUserId && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/30">
                                  Mine
                                </Badge>
                              )}
                            </div>
                            
                            <p className="font-semibold text-sm text-foreground truncate">
                              {request.tenant?.full_name || 'Anonymous Tenant'}
                            </p>
                            
                            {/* Supporter who funded */}
                            {request.supporter && (
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <User className="h-3 w-3" />
                                Funded by <span className="font-medium text-foreground">{request.supporter.full_name}</span>
                              </p>
                            )}
                            
                            <div className="flex items-center gap-3 mt-1">
                              <span className="font-black text-lg text-foreground">
                                {formatUGX(request.rent_amount)}
                              </span>
                              <span className="text-sm font-semibold text-success flex items-center gap-1">
                                <TrendingUp className="h-3.5 w-3.5" />
                                +{formatUGX(reward)}
                              </span>
                            </div>

                            {/* Repayment Progress */}
                            <div className="mt-2 space-y-1">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-muted-foreground">Repayment Progress</span>
                                <span className="font-semibold">{Math.round(request.repaymentProgress)}%</span>
                              </div>
                              <Progress value={request.repaymentProgress} className="h-1.5" />
                            </div>
                          </div>

                          {/* Expand Icon */}
                          <div className="p-2 rounded-full bg-muted/50">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        {/* Time Info */}
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>Funded {formatDistanceToNow(new Date(request.funded_at), { addSuffix: true })}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span>{request.duration_days} days term</span>
                          </div>
                        </div>
                      </CardContent>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="px-4 pb-4 space-y-4">
                        <Separator />
                        
                        {/* Detailed Info Grid */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg bg-muted/30">
                            <div className="flex items-center gap-2 mb-1">
                              <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">Total to Repay</span>
                            </div>
                            <p className="font-bold text-sm">{formatUGX(request.total_repayment)}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/30">
                            <div className="flex items-center gap-2 mb-1">
                              <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">Daily Amount</span>
                            </div>
                            <p className="font-bold text-sm">{formatUGX(request.daily_repayment)}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-success/10">
                            <div className="flex items-center gap-2 mb-1">
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                              <span className="text-[10px] text-muted-foreground">Total Repaid</span>
                            </div>
                            <p className="font-bold text-sm text-success">{formatUGX(request.totalRepaid)}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-primary/10">
                            <div className="flex items-center gap-2 mb-1">
                              <TrendingUp className="h-3.5 w-3.5 text-primary" />
                              <span className="text-[10px] text-muted-foreground">ROI Earned</span>
                            </div>
                            <p className="font-bold text-sm text-primary">{formatUGX(request.totalROIEarned)}</p>
                          </div>
                        </div>

                        {/* Landlord Info */}
                        {request.landlord && (
                          <div className="p-3 rounded-lg bg-muted/30">
                            <div className="flex items-center gap-2 mb-2">
                              <Home className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs font-semibold">Landlord Details</span>
                            </div>
                            <p className="text-sm font-medium">{request.landlord.name}</p>
                            {request.landlord.property_address && (
                              <p className="text-xs text-muted-foreground mt-1">{request.landlord.property_address}</p>
                            )}
                          </div>
                        )}

                        {/* ROI Payments Timeline */}
                        {request.roiPayments.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-success" />
                              <span className="text-xs font-semibold">ROI Payments ({request.roiPayments.length})</span>
                            </div>
                            <div className="space-y-2">
                              {request.roiPayments.map((roi) => (
                                <div 
                                  key={roi.id}
                                  className={`flex items-center justify-between p-2 rounded-lg ${
                                    roi.status === 'paid' 
                                      ? 'bg-success/10' 
                                      : 'bg-muted/30'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    {roi.status === 'paid' ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                    ) : (
                                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                    )}
                                    <span className="text-xs">Payment #{roi.payment_number}</span>
                                  </div>
                                  <div className="text-right">
                                    <p className={`text-xs font-bold ${roi.status === 'paid' ? 'text-success' : 'text-foreground'}`}>
                                      +{formatUGX(roi.roi_amount)}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {roi.paid_at 
                                        ? format(new Date(roi.paid_at), 'MMM d, yyyy')
                                        : `Due: ${format(new Date(roi.due_date), 'MMM d')}`
                                      }
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Recent Repayments */}
                        {request.repayments.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Wallet className="h-4 w-4 text-primary" />
                              <span className="text-xs font-semibold">
                                Recent Repayments ({request.repayments.length})
                              </span>
                            </div>
                            <ScrollArea className="max-h-32">
                              <div className="space-y-1">
                                {request.repayments.slice(0, 5).map((repayment) => (
                                  <div 
                                    key={repayment.id}
                                    className="flex items-center justify-between p-2 rounded-lg bg-muted/20"
                                  >
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(repayment.payment_date), 'MMM d, yyyy')}
                                    </span>
                                    <span className="text-xs font-semibold text-success">
                                      +{formatUGX(repayment.amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
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
          {!hasMore && fundedRequests.length > 0 && (
            <p className="text-xs text-center text-muted-foreground">
              You've seen all {fundedRequests.length} funded requests
            </p>
          )}
        </div>
      </div>
    </motion.div>
    </div>
    
    {/* Scroll to top button */}
    <ScrollToTopButton scrollThreshold={400} />
    </>
  );
}

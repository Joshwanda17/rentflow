import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowLeft, 
  Bookmark, 
  BookmarkX, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Banknote,
  User,
  Calendar,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { useCurrency } from '@/hooks/useCurrency';
import { useToast } from '@/hooks/use-toast';

interface WatchedOpportunity {
  id: string;
  created_at: string;
  rent_request: {
    id: string;
    rent_amount: number;
    duration_days: number;
    status: string;
    agent_verified: boolean;
    manager_verified: boolean;
    created_at: string;
    tenant: {
      full_name: string;
    }[] | null;
  } | null;
}

export default function MyWatchlist() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  
  const [opportunities, setOpportunities] = useState<WatchedOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchWatchlist = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('watched_opportunities')
        .select(`
          id,
          created_at,
          rent_request:rent_requests (
            id,
            rent_amount,
            duration_days,
            status,
            agent_verified,
            manager_verified,
            created_at,
            tenant:profiles!rent_requests_tenant_id_fkey (
              full_name
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOpportunities(data || []);
    } catch (e) {
      console.error('Failed to fetch watchlist:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }
    if (user) {
      fetchWatchlist();
    }
  }, [user, authLoading, navigate]);

  const handleRemove = async (watchId: string) => {
    setRemovingId(watchId);
    try {
      const { error } = await supabase
        .from('watched_opportunities')
        .delete()
        .eq('id', watchId);

      if (error) throw error;
      
      setOpportunities(prev => prev.filter(o => o.id !== watchId));
      toast({ title: 'Removed from watchlist' });
    } catch (e) {
      toast({ title: 'Failed to remove', variant: 'destructive' });
    } finally {
      setRemovingId(null);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchWatchlist();
  };

  const getVerificationStatus = (request: WatchedOpportunity['rent_request']) => {
    if (!request) return { label: 'Unknown', variant: 'secondary' as const, icon: AlertCircle };
    
    const { agent_verified, manager_verified, status } = request;
    
    if (status === 'funded') {
      return { label: 'Funded', variant: 'default' as const, icon: CheckCircle2 };
    }
    if (agent_verified && manager_verified) {
      return { label: 'Ready to Fund', variant: 'success' as const, icon: CheckCircle2 };
    }
    if (agent_verified || manager_verified) {
      return { label: 'Verifying', variant: 'warning' as const, icon: Clock };
    }
    return { label: 'Pending', variant: 'secondary' as const, icon: Clock };
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-6 w-40" />
        </div>
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate(-1)}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Bookmark className="h-5 w-5 text-primary" />
                My Watchlist
              </h1>
              <p className="text-xs text-muted-foreground">
                {opportunities.length} {opportunities.length === 1 ? 'opportunity' : 'opportunities'}
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto p-4 space-y-3 pb-20">
        <AnimatePresence mode="popLayout">
          {opportunities.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-12"
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <Bookmark className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="font-medium mb-2">No Watched Opportunities</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Save opportunities you're interested in to track their verification status
              </p>
              <Button onClick={() => navigate('/dashboard')}>
                Browse Opportunities
              </Button>
            </motion.div>
          ) : (
            opportunities.map((item, index) => {
              const request = item.rent_request;
              const status = getVerificationStatus(request);
              const StatusIcon = status.icon;

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="overflow-hidden">
                    <CardContent className="p-4">
                      {request ? (
                        <div className="space-y-3">
                          {/* Top row: Amount + Status */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="p-2 rounded-full bg-primary/10">
                                <Banknote className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="font-semibold">
                                  {formatAmount(request.rent_amount)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {request.duration_days} days
                                </p>
                              </div>
                            </div>
                            <Badge variant={status.variant} className="flex items-center gap-1">
                              <StatusIcon className="h-3 w-3" />
                              {status.label}
                            </Badge>
                          </div>

                          {/* Tenant + Verification Progress */}
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <User className="h-3.5 w-3.5" />
                              <span>{request.tenant?.[0]?.full_name || 'Unknown tenant'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${request.agent_verified ? 'bg-green-500' : 'bg-muted'}`} />
                              <span className={`w-2 h-2 rounded-full ${request.manager_verified ? 'bg-green-500' : 'bg-muted'}`} />
                            </div>
                          </div>

                          {/* Footer: Date + Actions */}
                          <div className="flex items-center justify-between pt-2 border-t">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>Watching since {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemove(item.id)}
                              disabled={removingId === item.id}
                              className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              {removingId === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <BookmarkX className="h-4 w-4 mr-1" />
                                  Remove
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          <AlertCircle className="h-5 w-5 mx-auto mb-2" />
                          <p className="text-sm">Opportunity no longer available</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemove(item.id)}
                            className="mt-2"
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

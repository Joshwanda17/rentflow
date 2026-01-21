import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  Users, 
  HandCoins, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Shield,
  UserCheck,
  Building,
  TrendingUp,
  Timer,
  Zap,
  Eye,
  ChevronRight,
  Bell,
  AlertTriangle
} from 'lucide-react';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';
import { formatDistanceToNow } from 'date-fns';

interface RentOpportunity {
  id: string;
  rent_amount: number;
  duration_days: number;
  status: string;
  created_at: string;
  agent_verified: boolean | null;
  agent_verified_at: string | null;
  manager_verified: boolean | null;
  manager_verified_at: string | null;
  tenant?: {
    full_name: string;
    avatar_url?: string;
  };
  agent?: {
    full_name: string;
  };
}

interface RentOpportunitiesProps {
  onFund: (id: string, amount: number) => void;
  isLocked?: boolean;
  onLockedClick?: () => void;
}

export function RentOpportunities({ onFund, isLocked, onLockedClick }: RentOpportunitiesProps) {
  const [opportunities, setOpportunities] = useState<RentOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpportunity, setSelectedOpportunity] = useState<RentOpportunity | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [newOpportunityId, setNewOpportunityId] = useState<string | null>(null);

  useEffect(() => {
    fetchOpportunities();
    
    // Set up real-time subscription
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
          console.log('Rent request change:', payload);
          
          if (payload.eventType === 'INSERT') {
            // New opportunity - fetch with joins
            fetchSingleOpportunity(payload.new.id);
          } else if (payload.eventType === 'UPDATE') {
            // Update existing opportunity
            setOpportunities(prev => 
              prev.map(opp => 
                opp.id === payload.new.id 
                  ? { ...opp, ...payload.new }
                  : opp
              ).filter(opp => 
                // Remove if funded or status changed from pending/approved
                opp.status === 'pending' || opp.status === 'approved'
              )
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

  const fetchOpportunities = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from('rent_requests')
      .select(`
        id,
        rent_amount,
        duration_days,
        status,
        created_at,
        agent_verified,
        agent_verified_at,
        manager_verified,
        manager_verified_at,
        tenant:profiles!rent_requests_tenant_id_fkey(full_name, avatar_url),
        agent:profiles!rent_requests_agent_id_fkey(full_name)
      `)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && data) {
      setOpportunities(data as unknown as RentOpportunity[]);
    }
    setLoading(false);
  };

  const fetchSingleOpportunity = async (id: string) => {
    const { data, error } = await supabase
      .from('rent_requests')
      .select(`
        id,
        rent_amount,
        duration_days,
        status,
        created_at,
        agent_verified,
        agent_verified_at,
        manager_verified,
        manager_verified_at,
        tenant:profiles!rent_requests_tenant_id_fkey(full_name, avatar_url),
        agent:profiles!rent_requests_agent_id_fkey(full_name)
      `)
      .eq('id', id)
      .single();

    if (!error && data) {
      const opportunity = data as unknown as RentOpportunity;
      setOpportunities(prev => [opportunity, ...prev]);
      setNewOpportunityId(id);
      
      // Clear new indicator after 5 seconds
      setTimeout(() => setNewOpportunityId(null), 5000);
    }
  };

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

  const getVerificationProgress = (opp: RentOpportunity) => {
    let progress = 0;
    if (opp.agent_verified) progress += 50;
    if (opp.manager_verified) progress += 50;
    return progress;
  };

  const getVerificationStatus = (opp: RentOpportunity) => {
    if (opp.manager_verified && opp.agent_verified) return 'fully_verified';
    if (opp.agent_verified || opp.manager_verified) return 'partially_verified';
    return 'pending';
  };

  const getStatusBadge = (opp: RentOpportunity) => {
    const status = getVerificationStatus(opp);
    switch (status) {
      case 'fully_verified':
        return (
          <Badge className="bg-success/20 text-success border-success/30 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Verified
          </Badge>
        );
      case 'partially_verified':
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

  if (loading) {
    return (
      <Card className="border-0 bg-gradient-to-br from-success/5 via-background to-primary/5">
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
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
          <Badge variant="outline" className="bg-success/10 text-success border-success/30 font-semibold">
            <Zap className="h-3 w-3 mr-1" />
            Live
          </Badge>
        </div>

        {/* Opportunities List */}
        <div className="space-y-3">
          <AnimatePresence>
            {opportunities.slice(0, 5).map((opportunity, index) => {
              const reward = calculateSupporterReward(opportunity.rent_amount);
              const isNew = opportunity.id === newOpportunityId;
              const verificationProgress = getVerificationProgress(opportunity);
              
              return (
                <motion.div
                  key={opportunity.id}
                  initial={{ opacity: 0, x: -20, scale: 0.95 }}
                  animate={{ 
                    opacity: 1, 
                    x: 0, 
                    scale: 1,
                    ...(isNew && { 
                      boxShadow: ['0 0 0 0 rgba(34, 197, 94, 0)', '0 0 0 8px rgba(34, 197, 94, 0.3)', '0 0 0 0 rgba(34, 197, 94, 0)']
                    })
                  }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  transition={{ 
                    delay: index * 0.05,
                    ...(isNew && { boxShadow: { duration: 1, repeat: 2 } })
                  }}
                  onClick={() => handleCardClick(opportunity)}
                  className="cursor-pointer"
                >
                  <Card className={`border-0 overflow-hidden transition-all hover:scale-[1.02] ${
                    isNew 
                      ? 'bg-gradient-to-r from-success/20 via-success/10 to-transparent ring-2 ring-success/50' 
                      : 'bg-gradient-to-r from-card via-card to-success/5 hover:from-success/5'
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        {/* Left: Amount & Reward */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            {isNew && (
                              <Badge className="bg-success text-success-foreground text-[10px] animate-pulse">
                                <Sparkles className="h-3 w-3 mr-1" />
                                NEW
                              </Badge>
                            )}
                            {getStatusBadge(opportunity)}
                          </div>
                          
                          <p className="font-black text-2xl text-foreground">
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

                          {/* Verification Progress Bar */}
                          <div className="mt-3 space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-muted-foreground">Verification</span>
                              <span className={verificationProgress === 100 ? 'text-success' : 'text-muted-foreground'}>
                                {verificationProgress}%
                              </span>
                            </div>
                            <Progress 
                              value={verificationProgress} 
                              className="h-1.5"
                            />
                          </div>
                        </div>

                        {/* Right: View Details */}
                        <div className="flex flex-col items-center gap-2">
                          <div className="p-3 rounded-full bg-success/10 text-success">
                            <Eye className="h-5 w-5" />
                          </div>
                          <span className="text-[10px] text-muted-foreground">Details</span>
                        </div>
                      </div>

                      {/* Time ago */}
                      <div className="flex items-center gap-1 mt-3 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDistanceToNow(new Date(opportunity.created_at), { addSuffix: true })}</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Tip */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-success/10 border border-primary/20">
          <div className="p-2 rounded-lg bg-primary/20">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Secure Investment</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              All requests are verified by agents and managers before funding. Tap any opportunity for details.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Verification Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              Investment Opportunity
            </DialogTitle>
          </DialogHeader>

          {selectedOpportunity && (
            <div className="space-y-6">
              {/* Amount Hero */}
              <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-success/10 via-success/5 to-transparent">
                <p className="text-sm text-muted-foreground mb-1">Rent Amount</p>
                <p className="text-4xl font-black text-foreground">
                  {formatUGX(selectedOpportunity.rent_amount)}
                </p>
                <div className="flex items-center justify-center gap-4 mt-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-success">
                      +{formatUGX(calculateSupporterReward(selectedOpportunity.rent_amount))}
                    </p>
                    <p className="text-xs text-muted-foreground">Your Earnings</p>
                  </div>
                  <Separator orientation="vertical" className="h-10" />
                  <div className="text-center">
                    <p className="text-2xl font-bold">15%</p>
                    <p className="text-xs text-muted-foreground">Monthly ROI</p>
                  </div>
                </div>
              </div>

              {/* Verification Process */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Verification Process
                </h4>

                <div className="space-y-2">
                  {/* Step 1: Agent Verification */}
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

                  {/* Step 2: Manager Verification */}
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

                  {/* Step 3: Ready for Funding */}
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

              {/* Warning for unverified */}
              {selectedOpportunity.status !== 'approved' && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/30">
                  <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    This request is still being verified. You can fund it once fully approved.
                  </p>
                </div>
              )}

              {/* Fund Button */}
              <Button
                onClick={() => handleFund(selectedOpportunity)}
                disabled={selectedOpportunity.status !== 'approved'}
                className="w-full h-14 text-lg font-bold bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70 shadow-lg shadow-success/25"
              >
                <HandCoins className="h-5 w-5 mr-2" />
                {selectedOpportunity.status === 'approved' 
                  ? `Fund ${formatUGX(selectedOpportunity.rent_amount)}`
                  : 'Awaiting Verification'
                }
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

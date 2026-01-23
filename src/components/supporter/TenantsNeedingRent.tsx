import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, ArrowRight, Clock, Shield } from 'lucide-react';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';
import { motion, AnimatePresence } from 'framer-motion';
import { useCurrency } from '@/hooks/useCurrency';
import { CurrencySwitcher } from '@/components/CurrencySwitcher';

interface RentRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
  status: string;
  created_at: string;
  tenant_name?: string;
  agent_verified?: boolean;
  manager_verified?: boolean;
}

interface TenantsNeedingRentProps {
  requests: RentRequest[];
  onFund: (requestId: string, amount: number) => void;
  onViewDetails: (requestId: string) => void;
  loading?: boolean;
}

export function TenantsNeedingRent({ requests, onFund, onViewDetails, loading }: TenantsNeedingRentProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { formatAmount } = useCurrency();

  const toggleCard = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const getDaysAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays}d ago`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-sm font-semibold">Opportunities</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <CurrencySwitcher variant="compact" />
              <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-medium">
                {requests.length}
              </Badge>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="px-0 pb-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/20 border-t-primary" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8 px-4">
              <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No opportunities</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {requests.slice(0, 8).map((request) => {
                const reward = calculateSupporterReward(Number(request.rent_amount));
                const isExpanded = expandedId === request.id;
                
                return (
                  <div key={request.id}>
                    {/* Name + Reward row */}
                    <button
                      onClick={() => toggleCard(request.id)}
                      className={`w-full px-4 py-3 text-left hover:bg-muted/50 active:bg-muted transition-colors touch-manipulation flex items-center justify-between gap-2 ${isExpanded ? 'bg-muted/30' : ''}`}
                    >
                      <span className="font-medium text-sm text-foreground truncate">
                        {request.tenant_name || 'Anonymous Tenant'}
                      </span>
                      <span className="text-xs font-bold text-success shrink-0">
                        +{formatAmount(reward)}
                      </span>
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
                          <div className="px-4 py-3 space-y-3">
                            {/* Amount row */}
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Rent</p>
                                <p className="text-base font-bold">{formatAmount(Number(request.rent_amount))}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Reward</p>
                                <p className="text-base font-bold text-success">+{formatAmount(reward)}</p>
                              </div>
                            </div>
                            
                            {/* Meta */}
                            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {getDaysAgo(request.created_at)}
                              </span>
                              <span>•</span>
                              <span>{request.duration_days} days</span>
                              {request.agent_verified && (
                                <>
                                  <span>•</span>
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-success/10 text-success border-success/30">
                                    <Shield className="h-2 w-2 mr-0.5" />
                                    Verified
                                  </Badge>
                                </>
                              )}
                            </div>

                            {/* Action */}
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewDetails(request.id);
                              }}
                              className="w-full h-10 font-medium text-sm"
                              size="sm"
                            >
                              View & Fund
                              <ArrowRight className="h-4 w-4 ml-1.5" />
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
          
          {requests.length > 8 && (
            <p className="text-center text-xs text-muted-foreground py-2">
              +{requests.length - 8} more
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
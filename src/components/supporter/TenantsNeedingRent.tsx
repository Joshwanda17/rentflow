import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, ArrowRight, Clock, Sparkles, TrendingUp, Zap, Eye, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const getInitials = (name?: string) => {
    if (!name) return 'T';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const getDaysAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays}d ago`;
  };

  const getAvatarColors = (index: number) => {
    const colors = [
      'from-violet-500 to-purple-600',
      'from-blue-500 to-cyan-500',
      'from-emerald-500 to-green-500',
      'from-orange-500 to-amber-500',
      'from-pink-500 to-rose-500',
    ];
    return colors[index % colors.length];
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-warning/5 via-background to-orange-500/5 backdrop-blur-xl shadow-xl">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-32 sm:w-48 h-32 sm:h-48 bg-gradient-to-bl from-warning/15 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-8 sm:-bottom-12 -left-8 sm:-left-12 w-24 sm:w-32 h-24 sm:h-32 bg-gradient-to-tr from-orange-500/10 to-transparent rounded-full blur-2xl" />
        
        <CardHeader className="relative pb-2 sm:pb-3 px-3 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
            <div className="flex items-center gap-2.5 sm:gap-4">
              <motion.div 
                className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-gradient-to-br from-warning via-orange-500 to-amber-500 shadow-lg shadow-warning/30"
                whileHover={{ scale: 1.05, rotate: -5 }}
              >
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </motion.div>
              <div>
                <CardTitle className="text-base sm:text-xl font-black tracking-tight">Investment Opportunities</CardTitle>
                <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                  <Zap className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-success" />
                  <p className="text-xs sm:text-sm text-muted-foreground font-medium">Fund & earn 15% returns</p>
                </div>
              </div>
            </div>
            <Badge className="font-mono text-[10px] sm:text-xs bg-warning/20 text-warning border-warning/30 px-2 sm:px-3 py-0.5 sm:py-1 w-fit">
              <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />
              {requests.length} available
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="relative px-3 sm:px-6 pb-4 sm:pb-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 sm:py-16 gap-3 sm:gap-4">
              <div className="relative">
                <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-4 border-primary/20 border-t-primary"></div>
                <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium">Finding opportunities...</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-10 sm:py-16">
              <motion.div 
                className="p-4 sm:p-5 rounded-full bg-gradient-to-br from-warning/20 to-warning/5 w-fit mx-auto mb-4 sm:mb-5"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Users className="h-8 w-8 sm:h-10 sm:w-10 text-warning/60" />
              </motion.div>
              <p className="text-foreground font-bold text-base sm:text-lg">No opportunities right now</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 sm:mt-2 max-w-xs mx-auto px-4">
                New investment opportunities appear when tenants need rent funding
              </p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {requests.slice(0, 5).map((request, index) => {
                const reward = calculateSupporterReward(Number(request.rent_amount));
                const avatarColor = getAvatarColors(index);
                const isExpanded = expandedCards.has(request.id);
                
                return (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="group relative rounded-xl sm:rounded-2xl bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 hover:border-primary/30 transition-all duration-300 overflow-hidden"
                  >
                    {/* Hover gradient */}
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-success/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    
                    {/* Collapsed View - Always visible */}
                    <button
                      onClick={() => toggleCard(request.id)}
                      className="w-full relative flex items-center justify-between gap-3 p-3 sm:p-4 text-left"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className={`h-10 w-10 border-2 border-white/20 shadow-lg relative shrink-0`}>
                          <AvatarFallback className={`bg-gradient-to-br ${avatarColor} text-white font-bold text-xs sm:text-sm`}>
                            {getInitials(request.tenant_name)}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-foreground text-sm sm:text-base truncate">
                            {request.tenant_name || 'Anonymous Tenant'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/20">
                              <TrendingUp className="h-2.5 w-2.5 text-success" />
                              <span className="text-[10px] sm:text-xs font-bold text-success">
                                +{formatUGX(reward)}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">earnings</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className="text-[9px] sm:text-[10px] px-1.5 py-0.5 bg-white/10 text-foreground/80 border-0">
                          {request.duration_days}d
                        </Badge>
                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="p-1 rounded-full bg-muted/50"
                        >
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </motion.div>
                      </div>
                    </button>
                    
                    {/* Expanded View */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0 space-y-3 border-t border-white/10">
                            {/* Amount & Details */}
                            <div className="flex items-center justify-between pt-3">
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Rent Amount</p>
                                <span className="text-lg sm:text-xl font-black text-foreground">
                                  {formatUGX(Number(request.rent_amount))}
                                </span>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground mb-0.5">Your Reward</p>
                                <span className="text-lg sm:text-xl font-black text-success">
                                  +{formatUGX(reward)}
                                </span>
                              </div>
                            </div>
                            
                            {/* Meta info */}
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground font-medium">
                                <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                <span>{getDaysAgo(request.created_at)}</span>
                              </div>
                              {/* Verification status indicators */}
                              {request.agent_verified && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0 bg-success/10 text-success border-success/30">
                                  <Shield className="h-2 w-2 mr-0.5" />
                                  Agent Verified
                                </Badge>
                              )}
                              {request.manager_verified && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0 bg-primary/10 text-primary border-primary/30">
                                  <Shield className="h-2 w-2 mr-0.5" />
                                  Manager Verified
                                </Badge>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 w-full">
                              <Button
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onViewDetails(request.id);
                                }}
                                className="relative gap-1 shrink-0 h-10 sm:h-11 flex-1 text-sm"
                              >
                                <Eye className="h-4 w-4" />
                                Details
                              </Button>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onViewDetails(request.id);
                                }}
                                className="relative gap-1.5 sm:gap-2 shrink-0 h-10 sm:h-11 flex-1 px-4 sm:px-5 font-bold text-sm bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
                              >
                                View & Fund
                                <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 group-hover:translate-x-0.5 transition-transform" />
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
              
              {requests.length > 5 && (
                <motion.p 
                  className="text-center text-xs sm:text-sm text-muted-foreground pt-2 sm:pt-3 font-medium"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3 inline mr-1" />
                  +{requests.length - 5} more opportunities waiting
                </motion.p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, ArrowRight, Clock, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';

interface RentRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
  status: string;
  created_at: string;
  tenant_name?: string;
}

interface TenantsNeedingRentProps {
  requests: RentRequest[];
  onFund: (requestId: string, amount: number) => void;
  loading?: boolean;
}

export function TenantsNeedingRent({ requests, onFund, loading }: TenantsNeedingRentProps) {
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
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-warning/15 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-gradient-to-tr from-orange-500/10 to-transparent rounded-full blur-2xl" />
        
        <CardHeader className="relative pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div 
                className="p-3 rounded-2xl bg-gradient-to-br from-warning via-orange-500 to-amber-500 shadow-lg shadow-warning/30"
                whileHover={{ scale: 1.05, rotate: -5 }}
              >
                <Users className="h-5 w-5 text-white" />
              </motion.div>
              <div>
                <CardTitle className="text-xl font-black tracking-tight">Investment Opportunities</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Zap className="h-3.5 w-3.5 text-success" />
                  <p className="text-sm text-muted-foreground font-medium">Fund & earn 15% returns</p>
                </div>
              </div>
            </div>
            <Badge className="font-mono text-xs bg-warning/20 text-warning border-warning/30 px-3 py-1">
              <Sparkles className="h-3 w-3 mr-1" />
              {requests.length} available
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="relative">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary"></div>
                <Sparkles className="h-4 w-4 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">Finding opportunities...</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-16">
              <motion.div 
                className="p-5 rounded-full bg-gradient-to-br from-warning/20 to-warning/5 w-fit mx-auto mb-5"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Users className="h-10 w-10 text-warning/60" />
              </motion.div>
              <p className="text-foreground font-bold text-lg">No opportunities right now</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
                New investment opportunities appear when tenants need rent funding
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.slice(0, 5).map((request, index) => {
                const reward = calculateSupporterReward(Number(request.rent_amount));
                const avatarColor = getAvatarColors(index);
                
                return (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.01, x: 4 }}
                    className="group relative flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 hover:border-primary/30 transition-all duration-300 overflow-hidden"
                  >
                    {/* Hover gradient */}
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-success/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    
                    <Avatar className={`h-12 w-12 border-2 border-white/20 shadow-lg relative`}>
                      <AvatarFallback className={`bg-gradient-to-br ${avatarColor} text-white font-bold text-sm`}>
                        {getInitials(request.tenant_name)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0 relative">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-foreground truncate">
                          {request.tenant_name || 'Anonymous Tenant'}
                        </p>
                        <Badge className="text-[10px] px-2 py-0.5 bg-white/10 text-foreground/80 border-0 shrink-0">
                          {request.duration_days} days
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-black text-foreground">
                          {formatUGX(Number(request.rent_amount))}
                        </span>
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/20">
                          <TrendingUp className="h-3 w-3 text-success" />
                          <span className="text-xs font-bold text-success">
                            +{formatUGX(reward)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground font-medium">
                        <Clock className="h-3 w-3" />
                        <span>{getDaysAgo(request.created_at)}</span>
                      </div>
                    </div>

                    <Button
                      onClick={() => onFund(request.id, Number(request.rent_amount))}
                      className="relative gap-2 shrink-0 h-11 px-5 font-bold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
                    >
                      Fund
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                    </Button>
                  </motion.div>
                );
              })}
              
              {requests.length > 5 && (
                <motion.p 
                  className="text-center text-sm text-muted-foreground pt-3 font-medium"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <Sparkles className="h-3 w-3 inline mr-1" />
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

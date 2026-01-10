import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, HandCoins, AlertCircle } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';

interface TenantRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
}

interface SimpleTenantsListProps {
  requests: TenantRequest[];
  onFund: (id: string, amount: number) => void;
  loading?: boolean;
}

export function SimpleTenantsList({ requests, onFund, loading }: SimpleTenantsListProps) {
  const handleFund = (request: TenantRequest) => {
    hapticTap();
    onFund(request.id, request.rent_amount);
  };

  if (loading) {
    return (
      <Card className="border-0 bg-muted/30">
        <CardContent className="p-6 text-center">
          <div className="animate-pulse space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted mx-auto" />
            <div className="h-4 w-32 bg-muted mx-auto rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card className="border-0 bg-muted/30">
        <CardContent className="p-6 text-center space-y-3">
          <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-foreground">No Tenants Waiting</p>
            <p className="text-sm text-muted-foreground">Check back soon!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏠</span>
          <h3 className="font-bold text-foreground">Tenants Need Help</h3>
        </div>
        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
          {requests.length} waiting
        </Badge>
      </div>

      {/* Tenant Cards */}
      <div className="space-y-2">
        {requests.slice(0, 5).map((request, index) => {
          const reward = request.rent_amount * 0.15;
          
          return (
            <motion.div
              key={request.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="border-0 bg-gradient-to-r from-success/5 to-transparent hover:from-success/10 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-foreground text-lg">{formatUGX(request.rent_amount)}</p>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {request.duration_days}d
                        </Badge>
                      </div>
                      <p className="text-sm text-success font-semibold">
                        Earn: +{formatUGX(reward)}
                      </p>
                    </div>

                    {/* Fund Button */}
                    <Button
                      onClick={() => handleFund(request)}
                      size="lg"
                      className="h-12 px-6 font-bold bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70 shadow-lg shadow-success/25"
                    >
                      <HandCoins className="h-5 w-5 mr-2" />
                      Fund
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Tip */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
        <AlertCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Tip:</span> Fund tenants to earn 15% returns when they repay!
        </p>
      </div>
    </motion.div>
  );
}

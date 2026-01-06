import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, ArrowRight, Clock, AlertCircle } from 'lucide-react';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';

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
    return `${diffDays} days ago`;
  };

  return (
    <Card className="elevated-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-warning/20 to-warning/10">
              <Users className="h-5 w-5 text-warning" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">Tenants Needing Rent</CardTitle>
              <p className="text-xs text-muted-foreground">Fund and earn 15% returns</p>
            </div>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {requests.length} waiting
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12">
            <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
              <Users className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground font-medium">No tenants need funding</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Check back soon for opportunities</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.slice(0, 5).map((request, index) => {
              const reward = calculateSupporterReward(Number(request.rent_amount));
              return (
                <div
                  key={request.id}
                  className="group flex items-center gap-4 p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 border border-border/50 hover:border-primary/30 transition-all duration-200"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-medium text-sm">
                      {getInitials(request.tenant_name)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground truncate">
                        {request.tenant_name || 'Anonymous Tenant'}
                      </p>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        {request.duration_days}d
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-lg font-bold text-foreground">
                        {formatUGX(Number(request.rent_amount))}
                      </span>
                      <span className="text-xs text-muted-foreground">→</span>
                      <span className="text-sm font-medium text-success">
                        +{formatUGX(reward)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{getDaysAgo(request.created_at)}</span>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => onFund(request.id, Number(request.rent_amount))}
                    className="gap-1.5 shrink-0"
                  >
                    Fund
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
            
            {requests.length > 5 && (
              <p className="text-center text-sm text-muted-foreground pt-2">
                +{requests.length - 5} more tenants waiting
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useNavigate } from 'react-router-dom';
import { Home, ChevronRight, CheckCircle2, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';

export function WelileHomesButton() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Check if user has an active Welile Homes subscription and get savings
  const { data: subscription } = useQuery({
    queryKey: ['welile-homes-subscription-check', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('welile_homes_subscriptions')
        .select('id, total_savings, months_enrolled')
        .eq('tenant_id', user.id)
        .eq('subscription_status', 'active')
        .maybeSingle();
      
      if (error || !data) return null;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const hasSubscription = !!subscription;
  const totalSavings = subscription?.total_savings ?? 0;

  const handleClick = () => {
    if (hasSubscription) {
      navigate('/welile-homes-dashboard');
    } else {
      navigate('/welile-homes');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card 
        className={`cursor-pointer hover:shadow-md transition-all duration-200 overflow-hidden group ${
          hasSubscription 
            ? 'border-green-300 bg-gradient-to-r from-green-50 to-background' 
            : 'border-purple-200 bg-gradient-to-r from-purple-50 to-background'
        }`}
        onClick={handleClick}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform ${
              hasSubscription 
                ? 'bg-gradient-to-br from-green-500 to-green-700' 
                : 'bg-gradient-to-br from-purple-500 to-purple-700'
            }`}>
              <Home className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground">🏠 Welile Homes</h3>
                {hasSubscription ? (
                  <Badge className="bg-green-100 text-green-700 text-[10px] gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-[10px]">
                    NEW
                  </Badge>
                )}
              </div>
              {hasSubscription ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-sm font-bold text-green-700">{formatUGX(totalSavings)}</span>
                  <span className="text-xs text-muted-foreground">saved</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Turn your rent into your future home
                </p>
              )}
            </div>
            <ChevronRight className={`h-5 w-5 transition-colors ${
              hasSubscription 
                ? 'text-muted-foreground group-hover:text-green-600' 
                : 'text-muted-foreground group-hover:text-purple-600'
            }`} />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

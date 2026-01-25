import { useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ChevronRight, CheckCircle2, TrendingUp, Trophy, Target, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { useConfetti } from '@/components/Confetti';
import { useToast } from '@/hooks/use-toast';

// Calculate 5-year savings projection (same formula as other components)
function calculate5YearProjection(monthlyRent: number): number {
  const MONTHLY_GROWTH_RATE = 0.05;
  const LANDLORD_FEE_RATE = 0.10;
  const monthlyContribution = monthlyRent * LANDLORD_FEE_RATE;
  let balance = 0;
  
  for (let month = 1; month <= 60; month++) {
    balance = (balance + monthlyContribution) * (1 + MONTHLY_GROWTH_RATE);
  }
  
  return Math.round(balance);
}

// Milestone thresholds
const MILESTONES = [
  { threshold: 25, label: '25%', icon: Target, color: 'text-blue-600', bg: 'bg-blue-100' },
  { threshold: 50, label: '50%', icon: Sparkles, color: 'text-amber-600', bg: 'bg-amber-100' },
  { threshold: 75, label: '75%', icon: Trophy, color: 'text-purple-600', bg: 'bg-purple-100' },
  { threshold: 100, label: '100%', icon: Trophy, color: 'text-green-600', bg: 'bg-green-100' },
];

function getMilestone(percent: number) {
  for (let i = MILESTONES.length - 1; i >= 0; i--) {
    if (percent >= MILESTONES[i].threshold) {
      return MILESTONES[i];
    }
  }
  return null;
}

function getNextMilestone(percent: number) {
  for (const milestone of MILESTONES) {
    if (percent < milestone.threshold) {
      return milestone;
    }
  }
  return null;
}

// Mini sparkline component using SVG
function MiniSparkline({ data }: { data: number[] }) {
  const width = 60;
  const height = 20;
  const padding = 2;
  
  const points = useMemo(() => {
    if (data.length < 2) return '';
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    return data.map((value, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    }).join(' ');
  }, [data]);

  if (data.length < 2) return null;

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-green-500"
      />
      {/* End dot */}
      {data.length > 0 && (
        <circle
          cx={width - padding}
          cy={height - padding - ((data[data.length - 1] - Math.min(...data)) / (Math.max(...data) - Math.min(...data) || 1)) * (height - padding * 2)}
          r="2"
          className="fill-green-600"
        />
      )}
    </svg>
  );
}

export function WelileHomesButton() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { fireSuccess } = useConfetti();
  const { toast } = useToast();
  const celebratedMilestoneRef = useRef<number | null>(null);

  // Check if user has an active Welile Homes subscription and get savings
  const { data: subscription } = useQuery({
    queryKey: ['welile-homes-subscription-check', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('welile_homes_subscriptions')
        .select('id, total_savings, months_enrolled, monthly_rent')
        .eq('tenant_id', user.id)
        .eq('subscription_status', 'active')
        .maybeSingle();
      
      if (error || !data) return null;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  // Fetch contribution history for sparkline
  const { data: contributions } = useQuery({
    queryKey: ['welile-homes-contributions-sparkline', subscription?.id],
    queryFn: async () => {
      if (!subscription?.id) return [];
      const { data, error } = await supabase
        .from('welile_homes_contributions')
        .select('balance_after, created_at')
        .eq('subscription_id', subscription.id)
        .order('created_at', { ascending: true })
        .limit(10);
      
      if (error || !data) return [];
      return data.map(c => c.balance_after);
    },
    enabled: !!subscription?.id,
    staleTime: 1000 * 60 * 5,
  });

  const hasSubscription = !!subscription;
  const totalSavings = subscription?.total_savings ?? 0;
  const monthlyRent = subscription?.monthly_rent ?? 0;
  
  // Calculate 5-year goal and progress
  const fiveYearGoal = monthlyRent > 0 ? calculate5YearProjection(monthlyRent) : 0;
  const progressPercent = fiveYearGoal > 0 ? Math.min((totalSavings / fiveYearGoal) * 100, 100) : 0;
  
  // Get current and next milestone
  const currentMilestone = getMilestone(progressPercent);
  const nextMilestone = getNextMilestone(progressPercent);
  const percentToNext = nextMilestone ? (nextMilestone.threshold - progressPercent).toFixed(1) : null;

  // Sparkline data - include current balance at end if different from last contribution
  const sparklineData = useMemo(() => {
    const data = contributions ?? [];
    if (data.length === 0 && totalSavings > 0) {
      return [0, totalSavings]; // Show growth from 0 to current
    }
    if (data.length > 0 && data[data.length - 1] !== totalSavings) {
      return [...data, totalSavings];
    }
    return data;
  }, [contributions, totalSavings]);

  // Check localStorage for celebrated milestones and trigger celebration
  useEffect(() => {
    if (!user?.id || !hasSubscription || progressPercent === 0) return;

    const storageKey = `welile-homes-milestone-${user.id}`;
    const celebratedStr = localStorage.getItem(storageKey);
    const celebrated = celebratedStr ? parseInt(celebratedStr, 10) : 0;

    for (const milestone of MILESTONES) {
      if (progressPercent >= milestone.threshold && celebrated < milestone.threshold) {
        fireSuccess();
        toast({
          title: `🎉 ${milestone.label} Milestone Reached!`,
          description: `Congratulations! You've saved ${milestone.label} of your 5-year home fund goal!`,
        });
        
        localStorage.setItem(storageKey, milestone.threshold.toString());
        celebratedMilestoneRef.current = milestone.threshold;
        break;
      }
    }
  }, [user?.id, hasSubscription, progressPercent, fireSuccess, toast]);

  const handleClick = () => {
    if (hasSubscription) {
      navigate('/welile-homes-dashboard');
    } else {
      navigate('/welile-homes');
    }
  };

  return (
    <div className="animate-fade-in">
      <Card 
        className={`cursor-pointer hover:shadow-md transition-all duration-200 overflow-hidden group touch-manipulation ${
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
                  <>
                    <Badge className="bg-green-100 text-green-700 text-[10px] gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </Badge>
                    {currentMilestone && (
                      <Badge className={`${currentMilestone.bg} ${currentMilestone.color} text-[10px] gap-1 animate-scale-in`}>
                        <currentMilestone.icon className="h-3 w-3" />
                        {currentMilestone.label}
                      </Badge>
                    )}
                  </>
                ) : (
                  <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-[10px]">
                    NEW
                  </Badge>
                )}
              </div>
              {hasSubscription ? (
                <div className="mt-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 flex-1">
                      <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                      <span className="text-sm font-bold text-green-700">{formatUGX(totalSavings)}</span>
                      <span className="text-xs text-muted-foreground">saved</span>
                    </div>
                    {sparklineData.length >= 2 && (
                      <MiniSparkline data={sparklineData} />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress 
                      value={progressPercent} 
                      className="h-1.5 flex-1 bg-green-100" 
                    />
                    <span className="text-[10px] font-medium text-green-600 whitespace-nowrap">
                      {progressPercent.toFixed(1)}%
                    </span>
                  </div>
                  {nextMilestone && percentToNext && (
                    <p className="text-[10px] text-muted-foreground">
                      <span className={nextMilestone.color}>{percentToNext}%</span> more to reach {nextMilestone.label}
                    </p>
                  )}
                  {!nextMilestone && progressPercent >= 100 && (
                    <p className="text-[10px] text-green-600 font-medium">
                      🎉 5-year goal achieved!
                    </p>
                  )}
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
    </div>
  );
}

import { useEffect, useRef, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ChevronRight, CheckCircle2, TrendingUp, TrendingDown, Trophy, Target, Sparkles, ArrowUp, ArrowDown, Flame, Calendar, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { useConfetti } from '@/components/Confetti';
import { useToast } from '@/hooks/use-toast';
import { QuickContributeDialog } from './QuickContributeDialog';

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

// Mini sparkline component using SVG with tooltip
function MiniSparkline({ data }: { data: number[] }) {
  const width = 60;
  const height = 20;
  const padding = 2;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  const { points, dataPoints } = useMemo(() => {
    if (data.length < 2) return { points: '', dataPoints: [] };
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    const pts: { x: number; y: number; value: number }[] = data.map((value, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return { x, y, value };
    });
    
    return {
      points: pts.map(p => `${p.x},${p.y}`).join(' '),
      dataPoints: pts
    };
  }, [data]);

  if (data.length < 2) return null;

  const latestValue = data[data.length - 1];
  const firstValue = data[0];
  const growth = latestValue - firstValue;
  const growthPercent = firstValue > 0 ? ((growth / firstValue) * 100).toFixed(1) : '0';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <svg 
          width={width} 
          height={height} 
          className="flex-shrink-0 cursor-pointer"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-green-500"
          />
          {/* Interactive hover areas */}
          {dataPoints.map((point, i) => (
            <circle
              key={i}
              cx={point.x}
              cy={point.y}
              r={hoveredIndex === i ? 3 : 2}
              className={`transition-all duration-150 ${
                hoveredIndex === i 
                  ? 'fill-green-600 opacity-100' 
                  : i === dataPoints.length - 1 
                    ? 'fill-green-600 opacity-100' 
                    : 'fill-green-400 opacity-0'
              }`}
              onMouseEnter={() => setHoveredIndex(i)}
            />
          ))}
        </svg>
      </TooltipTrigger>
      <TooltipContent 
        side="top" 
        className="bg-background border shadow-lg p-2 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <p className="font-medium text-foreground">Savings Trend</p>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Start: {formatUGX(firstValue)}</span>
            <span>→</span>
            <span className="text-green-600 font-medium">{formatUGX(latestValue)}</span>
          </div>
          <p className={`text-[10px] ${growth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {growth >= 0 ? '+' : ''}{formatUGX(growth)} ({growthPercent}%)
          </p>
          {hoveredIndex !== null && (
            <p className="text-[10px] border-t pt-1 mt-1">
              Point {hoveredIndex + 1}: <span className="font-medium">{formatUGX(data[hoveredIndex])}</span>
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function WelileHomesButton() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { fireSuccess } = useConfetti();
  const { toast } = useToast();
  const celebratedMilestoneRef = useRef<number | null>(null);
  const [showContributeDialog, setShowContributeDialog] = useState(false);

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
      // welile_homes_contributions table removed - return empty
      return [] as { balance_after: number; amount: number; created_at: string }[];
    },
    enabled: !!subscription?.id,
    staleTime: 1000 * 60 * 5,
  });

  // Calculate monthly comparison and streak
  const { monthlyComparison, streak } = useMemo(() => {
    if (!contributions || contributions.length === 0) {
      return { monthlyComparison: null, streak: 0 };
    }
    
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    let thisMonthTotal = 0;
    let lastMonthTotal = 0;
    
    // Group contributions by month for streak calculation
    const monthsWithContributions = new Set<string>();
    
    contributions.forEach(c => {
      const date = new Date(c.created_at);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      monthsWithContributions.add(monthKey);
      
      if (date >= thisMonthStart) {
        thisMonthTotal += c.amount;
      } else if (date >= lastMonthStart && date <= lastMonthEnd) {
        lastMonthTotal += c.amount;
      }
    });
    
    // Calculate streak - count consecutive months backwards from current
    let streakCount = 0;
    let checkDate = new Date(now.getFullYear(), now.getMonth(), 1);
    
    for (let i = 0; i < 24; i++) { // Check up to 24 months back
      const monthKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}`;
      if (monthsWithContributions.has(monthKey)) {
        streakCount++;
        checkDate.setMonth(checkDate.getMonth() - 1);
      } else {
        break;
      }
    }
    
    // Calculate comparison
    let comparison = null;
    if (lastMonthTotal > 0 || thisMonthTotal > 0) {
      if (lastMonthTotal === 0) {
        comparison = { percent: '100', direction: 'up' as const, thisMonth: thisMonthTotal, lastMonth: 0 };
      } else {
        const change = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
        comparison = {
          percent: Math.abs(change).toFixed(0),
          direction: change >= 0 ? 'up' as const : 'down' as const,
          thisMonth: thisMonthTotal,
          lastMonth: lastMonthTotal
        };
      }
    }
    
    return { monthlyComparison: comparison, streak: streakCount };
  }, [contributions]);

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

  // Calculate projected completion date based on average monthly savings rate
  const projectedCompletion = useMemo(() => {
    if (!contributions || contributions.length < 2 || totalSavings >= fiveYearGoal || fiveYearGoal === 0) {
      return null;
    }
    
    // Calculate average monthly contribution
    const sortedContributions = [...contributions].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    
    const firstDate = new Date(sortedContributions[0].created_at);
    const lastDate = new Date(sortedContributions[sortedContributions.length - 1].created_at);
    const monthsElapsed = Math.max(1, 
      (lastDate.getFullYear() - firstDate.getFullYear()) * 12 + 
      (lastDate.getMonth() - firstDate.getMonth()) + 1
    );
    
    const totalContributed = sortedContributions.reduce((sum, c) => sum + c.amount, 0);
    const avgMonthlyRate = totalContributed / monthsElapsed;
    
    if (avgMonthlyRate <= 0) return null;
    
    const remaining = fiveYearGoal - totalSavings;
    // Account for 5% monthly compound growth
    const monthsToGoal = Math.ceil(remaining / (avgMonthlyRate * 1.05));
    
    if (monthsToGoal > 120) return null; // More than 10 years, don't show
    
    const completionDate = new Date();
    completionDate.setMonth(completionDate.getMonth() + monthsToGoal);
    
    return {
      date: completionDate,
      months: monthsToGoal,
      formatted: completionDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    };
  }, [contributions, totalSavings, fiveYearGoal]);

  // Sparkline data - include current balance at end if different from last contribution
  const sparklineData = useMemo(() => {
    const balances = contributions?.map(c => c.balance_after) ?? [];
    if (balances.length === 0 && totalSavings > 0) {
      return [0, totalSavings]; // Show growth from 0 to current
    }
    if (balances.length > 0 && balances[balances.length - 1] !== totalSavings) {
      return [...balances, totalSavings];
    }
    return balances;
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
                    {streak >= 2 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge className="bg-orange-100 text-orange-600 text-[10px] gap-0.5 animate-scale-in">
                            <Flame className="h-3 w-3" />
                            {streak}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {streak} month saving streak! Keep it up!
                        </TooltipContent>
                      </Tooltip>
                    )}
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
                      {monthlyComparison && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1 py-0.5 rounded ${
                              monthlyComparison.direction === 'up' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-red-100 text-red-600'
                            }`}>
                              {monthlyComparison.direction === 'up' ? (
                                <ArrowUp className="h-2.5 w-2.5" />
                              ) : (
                                <ArrowDown className="h-2.5 w-2.5" />
                              )}
                              {monthlyComparison.percent}%
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <div className="space-y-1">
                              <p className="font-medium">Monthly Comparison</p>
                              <p>This month: {formatUGX(monthlyComparison.thisMonth)}</p>
                              <p>Last month: {formatUGX(monthlyComparison.lastMonth)}</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    {sparklineData.length >= 2 && (
                      <MiniSparkline data={sparklineData} />
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 rounded-full bg-green-100 hover:bg-green-200 text-green-700 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowContributeDialog(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Quick contribute
                      </TooltipContent>
                    </Tooltip>
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
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] text-muted-foreground">
                        <span className={nextMilestone.color}>{percentToNext}%</span> more to reach {nextMilestone.label}
                      </p>
                      {projectedCompletion && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground cursor-default">
                              <Calendar className="h-2.5 w-2.5" />
                              {projectedCompletion.formatted}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-medium">Projected goal completion</p>
                            <p>~{projectedCompletion.months} months at current rate</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
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

      {/* Quick Contribute Dialog */}
      {hasSubscription && subscription && user && (
        <QuickContributeDialog
          open={showContributeDialog}
          onOpenChange={setShowContributeDialog}
          subscriptionId={subscription.id}
          tenantId={user.id}
          currentBalance={totalSavings}
        />
      )}
    </div>
  );
}

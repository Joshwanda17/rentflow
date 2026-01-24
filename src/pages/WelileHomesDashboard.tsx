import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, TrendingUp, Calendar, Wallet, CheckCircle2, Clock, Target, ChevronRight, Sparkles, Info, CreditCard, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const MONTHLY_GROWTH_RATE = 0.05;
const LANDLORD_FEE_RATE = 0.10;

// Calculate projected savings with compound growth
function calculateProjectedSavings(monthlyRent: number, months: number): number[] {
  const projections: number[] = [];
  let balance = 0;
  const monthlyContribution = monthlyRent * LANDLORD_FEE_RATE;
  
  for (let i = 0; i < months; i++) {
    balance = (balance * (1 + MONTHLY_GROWTH_RATE)) + monthlyContribution;
    projections.push(Math.round(balance));
  }
  
  return projections;
}

export default function WelileHomesDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Fetch user profile for rent amount
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('monthly_rent, full_name')
        .eq('id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id
  });

  // Mock data - In production this would come from actual savings records
  const monthlyRent = profile?.monthly_rent || 500000;
  const enrolledMonths = 3; // Months since enrollment
  const targetMonths = 60; // 5 year goal
  
  // Calculate current savings (with compound interest)
  const currentSavings = useMemo(() => {
    const projections = calculateProjectedSavings(monthlyRent, enrolledMonths);
    return projections[projections.length - 1] || 0;
  }, [monthlyRent, enrolledMonths]);
  
  // Calculate target savings (at 60 months)
  const targetSavings = useMemo(() => {
    const projections = calculateProjectedSavings(monthlyRent, targetMonths);
    return projections[projections.length - 1] || 0;
  }, [monthlyRent, targetMonths]);
  
  // Calculate milestones
  const milestones = useMemo(() => {
    return [
      { months: 12, label: '1 Year', amount: calculateProjectedSavings(monthlyRent, 12).pop() || 0 },
      { months: 24, label: '2 Years', amount: calculateProjectedSavings(monthlyRent, 24).pop() || 0 },
      { months: 36, label: '3 Years', amount: calculateProjectedSavings(monthlyRent, 36).pop() || 0 },
      { months: 60, label: '5 Years', amount: calculateProjectedSavings(monthlyRent, 60).pop() || 0 },
    ];
  }, [monthlyRent]);

  const progressPercent = Math.min((enrolledMonths / targetMonths) * 100, 100);
  const savingsProgressPercent = Math.min((currentSavings / targetSavings) * 100, 100);

  const paymentSteps = [
    { step: 1, title: 'Pay Rent via Welile Wallet', description: 'Make your monthly rent payment through the Welile Wallet system.' },
    { step: 2, title: 'Landlord Receives Rent', description: 'Your landlord receives the rent payment (minus 10% Welile fee).' },
    { step: 3, title: '10% Added to Home Savings', description: 'The 10% fee is deposited into your Welile Homes Savings Account.' },
    { step: 4, title: 'Savings Grow Monthly', description: 'Your savings earn 5% compound interest every month automatically.' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-background to-purple-50/30">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
              <Home className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Welile Homes</h1>
              <p className="text-xs text-muted-foreground">Your savings dashboard</p>
            </div>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
        </div>
      </div>

      <div className="p-4 pb-24 space-y-6 max-w-lg mx-auto">
        {/* Current Savings Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="overflow-hidden border-purple-200">
            <div className="bg-gradient-to-br from-purple-600 to-purple-800 p-5 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-purple-200 text-sm">Your Home Savings</p>
                  <p className="text-3xl font-bold mt-1">{formatUGX(currentSavings)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <TrendingUp className="h-4 w-4 text-emerald-300" />
                    <span className="text-sm text-emerald-300">+5% monthly compound</span>
                  </div>
                </div>
                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                  <Home className="h-7 w-7" />
                </div>
              </div>
            </div>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress to 5-Year Goal</span>
                  <span className="font-medium">{enrolledMonths} of {targetMonths} months</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-purple-600" />
                  <span className="text-sm">5-Year Target</span>
                </div>
                <span className="font-bold text-purple-700">{formatUGX(targetSavings)}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Monthly Contribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Wallet className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Monthly Contribution</p>
                    <p className="font-bold">{formatUGX(monthlyRent * LANDLORD_FEE_RATE)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">From rent of</p>
                  <p className="text-sm font-medium">{formatUGX(monthlyRent)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Milestones */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                Savings Milestones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {milestones.map((milestone, index) => {
                const isReached = enrolledMonths >= milestone.months;
                const isNext = !isReached && (index === 0 || enrolledMonths >= milestones[index - 1].months);
                
                return (
                  <div 
                    key={milestone.months}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isReached 
                        ? 'bg-emerald-50 border-emerald-200' 
                        : isNext 
                          ? 'bg-purple-50 border-purple-200' 
                          : 'bg-muted/30 border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isReached ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <div className={`w-5 h-5 rounded-full border-2 ${isNext ? 'border-purple-400' : 'border-muted-foreground/30'}`} />
                      )}
                      <span className={`font-medium ${isReached ? 'text-emerald-700' : ''}`}>
                        {milestone.label}
                      </span>
                    </div>
                    <span className={`font-bold ${isReached ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                      {formatUGX(milestone.amount)}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>

        {/* How to Pay Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-purple-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-5 w-5 text-purple-600" />
                How Payments Work
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {paymentSteps.map((step, index) => (
                <div key={step.step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-sm">
                      {step.step}
                    </div>
                    {index < paymentSteps.length - 1 && (
                      <div className="w-0.5 h-full min-h-[24px] bg-purple-200 mt-2" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="font-medium text-sm">{step.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Usage Rules Reminder */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-200 flex items-center justify-center flex-shrink-0">
                  <Clock className="h-5 w-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-semibold text-amber-800">Fund Usage Rules</h3>
                  <p className="text-sm text-amber-700 mt-1">
                    This fund can only be used for: buying land, buying a home, building a house, or mortgage down payment.
                  </p>
                  <p className="text-xs text-amber-600 mt-2">
                    Non-housing withdrawal allowed after 24 months.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* CTA to Calculator */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Button 
            onClick={() => navigate('/welile-homes')}
            variant="outline"
            className="w-full border-purple-200 text-purple-700 hover:bg-purple-50"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            View Savings Calculator
            <ChevronRight className="h-4 w-4 ml-auto" />
          </Button>
        </motion.div>

        {/* Motivation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-center py-6"
        >
          <h2 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
            Every rent payment brings you closer to home ownership
          </h2>
        </motion.div>
      </div>
    </div>
  );
}

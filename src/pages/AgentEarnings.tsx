import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, TrendingUp, Gift, Percent, Calendar, RefreshCw, ArrowDownLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAgentEarnings } from '@/hooks/useAgentEarnings';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';

export default function AgentEarnings() {
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const { earnings, loading, totalEarnings, commissionTotal, bonusTotal, refreshEarnings } = useAgentEarnings();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (!authLoading && role !== 'agent') {
      navigate('/dashboard');
    }
  }, [user, role, authLoading, navigate]);

  const commissionEarnings = earnings.filter(e => e.earning_type === 'commission');
  const bonusEarnings = earnings.filter(e => e.earning_type === 'approval_bonus');

  // Group earnings by date
  const groupByDate = (earningsList: typeof earnings) => {
    const grouped: Record<string, typeof earnings> = {};
    earningsList.forEach(earning => {
      const date = format(new Date(earning.created_at), 'yyyy-MM-dd');
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(earning);
    });
    return grouped;
  };

  const getEarningIcon = (type: string) => {
    switch (type) {
      case 'commission':
        return <Percent className="h-4 w-4 text-success" />;
      case 'approval_bonus':
        return <Gift className="h-4 w-4 text-warning" />;
      default:
        return <ArrowDownLeft className="h-4 w-4 text-primary" />;
    }
  };

  const getEarningLabel = (type: string) => {
    switch (type) {
      case 'commission':
        return 'Commission';
      case 'approval_bonus':
        return 'Approval Bonus';
      default:
        return type.replace(/_/g, ' ');
    }
  };

  const getEarningColor = (type: string) => {
    switch (type) {
      case 'commission':
        return 'bg-success/10 text-success';
      case 'approval_bonus':
        return 'bg-warning/10 text-warning';
      default:
        return 'bg-primary/10 text-primary';
    }
  };

  const renderEarningsList = (earningsList: typeof earnings) => {
    if (earningsList.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No earnings yet</p>
          <p className="text-sm mt-1">Register tenants and help them repay to earn commissions!</p>
        </div>
      );
    }

    const grouped = groupByDate(earningsList);
    const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    return (
      <div className="space-y-6">
        {dates.map(date => (
          <div key={date}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-muted-foreground">
                {format(new Date(date), 'EEEE, MMMM d, yyyy')}
              </h3>
              <Badge variant="outline" className="ml-auto">
                {formatUGX(grouped[date].reduce((sum, e) => sum + Number(e.amount), 0))}
              </Badge>
            </div>
            <div className="space-y-2">
              {grouped[date].map(earning => (
                <div 
                  key={earning.id}
                  className="flex items-center gap-4 p-4 rounded-lg bg-secondary/50"
                >
                  <div className={`p-2 rounded-lg ${getEarningColor(earning.earning_type)}`}>
                    {getEarningIcon(earning.earning_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium capitalize">{getEarningLabel(earning.earning_type)}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {earning.description || 'Earning recorded'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(earning.created_at), 'h:mm a')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold text-success">
                      +{formatUGX(Number(earning.amount))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">My Earnings</h1>
            <p className="text-muted-foreground text-sm">
              Track your commissions and bonuses
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={refreshEarnings}
          >
            <RefreshCw className="h-5 w-5" />
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="glass-card">
            <CardContent className="p-4 text-center">
              <TrendingUp className="h-5 w-5 mx-auto mb-2 text-primary" />
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-mono font-bold text-lg">{formatUGX(totalEarnings)}</p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4 text-center">
              <Percent className="h-5 w-5 mx-auto mb-2 text-success" />
              <p className="text-xs text-muted-foreground">Commissions</p>
              <p className="font-mono font-bold text-lg text-success">{formatUGX(commissionTotal)}</p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4 text-center">
              <Gift className="h-5 w-5 mx-auto mb-2 text-warning" />
              <p className="text-xs text-muted-foreground">Bonuses</p>
              <p className="font-mono font-bold text-lg text-warning">{formatUGX(bonusTotal)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Earnings Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Earnings History
            </CardTitle>
            <CardDescription>
              Detailed breakdown of your earnings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all" className="space-y-4">
              <TabsList className="w-full">
                <TabsTrigger value="all" className="flex-1">
                  All ({earnings.length})
                </TabsTrigger>
                <TabsTrigger value="commissions" className="flex-1">
                  Commissions ({commissionEarnings.length})
                </TabsTrigger>
                <TabsTrigger value="bonuses" className="flex-1">
                  Bonuses ({bonusEarnings.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all">
                {renderEarningsList(earnings)}
              </TabsContent>

              <TabsContent value="commissions">
                {renderEarningsList(commissionEarnings)}
              </TabsContent>

              <TabsContent value="bonuses">
                {renderEarningsList(bonusEarnings)}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Info Section */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">How Earnings Work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <Percent className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="font-medium text-foreground">5% Commission</p>
                <p>Earn 5% of every repayment deposit made by tenants you registered.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <Gift className="h-4 w-4 text-warning" />
              </div>
              <div>
                <p className="font-medium text-foreground">UGX 5,000 Bonus</p>
                <p>Receive a bonus when a tenant you registered gets approved.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

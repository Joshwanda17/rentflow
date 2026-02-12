import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Brain, 
  Zap, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  TrendingUp,
  Bell,
  Target,
  Loader2,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import { useAIBrain } from '@/hooks/useAIBrain';
import { AIRecommendationCard } from './AIRecommendationCard';
import { AISessionHistory } from './AISessionHistory';
import { AIUserExperienceReport } from './AIUserExperienceReport';
import { formatDistanceToNow } from 'date-fns';

export function AIBrainDashboard() {
  const {
    recommendations,
    sessions,
    stats,
    loading,
    triggeringAI,
    fetchRecommendations,
    triggerAIAnalysis,
  } = useAIBrain();

  const [activeTab, setActiveTab] = useState('pending');

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    fetchRecommendations();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">AI Operations Brain</h2>
            <p className="text-sm text-muted-foreground">
              {stats?.lastSessionAt 
                ? `Last analysis ${formatDistanceToNow(new Date(stats.lastSessionAt))} ago`
                : 'No analysis run yet'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Prominent User Experience Report Button */}
          <AIUserExperienceReport />
        <Button 
          onClick={triggerAIAnalysis} 
          disabled={triggeringAI}
          className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700"
        >
          {triggeringAI ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Run AI Analysis
            </>
          )}
        </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
                <p className="text-2xl font-bold">{stats?.pendingRecommendations || 0}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical</p>
                <p className="text-2xl font-bold text-red-600">{stats?.criticalPending || 0}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approved Today</p>
                <p className="text-2xl font-bold text-green-600">{stats?.approvedToday || 0}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Auto-Executed</p>
                <p className="text-2xl font-bold text-blue-600">{stats?.autoExecutedToday || 0}</p>
              </div>
              <Zap className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pending
            {stats?.pendingRecommendations ? (
              <Badge variant="secondary" className="ml-1">{stats.pendingRecommendations}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Approved
          </TabsTrigger>
          <TabsTrigger value="auto_executed" className="gap-2">
            <Zap className="h-4 w-4" />
            Auto
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4 space-y-4">
          {recommendations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="font-semibold text-lg">All Caught Up!</h3>
                <p className="text-muted-foreground">No pending recommendations to review.</p>
              </CardContent>
            </Card>
          ) : (
            recommendations.map(rec => (
              <AIRecommendationCard key={rec.id} recommendation={rec} />
            ))
          )}
        </TabsContent>

        <TabsContent value="approved" className="mt-4 space-y-4">
          {recommendations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No approved recommendations yet.
              </CardContent>
            </Card>
          ) : (
            recommendations.map(rec => (
              <AIRecommendationCard key={rec.id} recommendation={rec} readonly />
            ))
          )}
        </TabsContent>

        <TabsContent value="auto_executed" className="mt-4 space-y-4">
          {recommendations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No auto-executed recommendations yet.
              </CardContent>
            </Card>
          ) : (
            recommendations.map(rec => (
              <AIRecommendationCard key={rec.id} recommendation={rec} readonly />
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <AISessionHistory sessions={sessions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

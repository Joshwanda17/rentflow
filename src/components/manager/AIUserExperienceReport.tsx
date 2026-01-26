import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Users, 
  Brain, 
  Loader2, 
  TrendingUp, 
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  Star,
  Download
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UserExperience {
  user_id: string;
  user_name: string;
  user_phone: string;
  role: string;
  experience_score: number;
  sentiment: 'positive' | 'neutral' | 'negative' | 'at_risk';
  summary: string;
  highlights: string[];
  concerns: string[];
  recommended_actions: string[];
}

interface ExperienceReport {
  generated_at: string;
  total_users_analyzed: number;
  overall_platform_sentiment: string;
  user_experiences: UserExperience[];
  platform_insights: string[];
  priority_actions: string[];
}

export function AIUserExperienceReport() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ExperienceReport | null>(null);

  const generateReport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-user-experience-report');
      
      if (error) throw error;
      
      setReport(data.report);
      toast.success(`Analyzed ${data.report.total_users_analyzed} users`);
    } catch (err) {
      console.error('Report generation error:', err);
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'bg-green-100 text-green-700 border-green-200';
      case 'neutral': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'negative': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'at_risk': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return <TrendingUp className="h-4 w-4" />;
      case 'neutral': return <Minus className="h-4 w-4" />;
      case 'negative': return <TrendingDown className="h-4 w-4" />;
      case 'at_risk': return <AlertTriangle className="h-4 w-4" />;
      default: return <Minus className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          size="lg"
          className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white shadow-lg gap-2"
        >
          <Brain className="h-5 w-5" />
          <Users className="h-5 w-5" />
          AI User Experience Report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Brain className="h-6 w-6 text-purple-600" />
            AI User Experience Analysis
          </DialogTitle>
        </DialogHeader>

        {!report ? (
          <div className="flex flex-col items-center justify-center py-12 gap-6">
            <div className="p-6 rounded-full bg-gradient-to-br from-purple-100 to-pink-100">
              <Users className="h-16 w-16 text-purple-600" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Generate User Experience Report</h3>
              <p className="text-muted-foreground max-w-md">
                AI will analyze each user's payment history, engagement patterns, risk scores, 
                and platform interactions to provide personalized insights and recommendations.
              </p>
            </div>
            <Button 
              size="lg" 
              onClick={generateReport}
              disabled={loading}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Analyzing Users...
                </>
              ) : (
                <>
                  <Brain className="h-5 w-5 mr-2" />
                  Generate Report
                </>
              )}
            </Button>
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 pb-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold text-purple-700">{report.total_users_analyzed}</p>
                    <p className="text-sm text-muted-foreground">Users Analyzed</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold text-green-700">
                      {report.user_experiences.filter(u => u.sentiment === 'positive').length}
                    </p>
                    <p className="text-sm text-muted-foreground">Happy Users</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-red-50 to-orange-50 border-red-200">
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold text-red-700">
                      {report.user_experiences.filter(u => u.sentiment === 'at_risk').length}
                    </p>
                    <p className="text-sm text-muted-foreground">At Risk</p>
                  </CardContent>
                </Card>
              </div>

              {/* Platform Insights */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Star className="h-5 w-5 text-amber-500" />
                    Platform Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {report.platform_insights.map((insight, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        {insight}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Priority Actions */}
              {report.priority_actions.length > 0 && (
                <Card className="border-amber-200 bg-amber-50/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                      Priority Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {report.priority_actions.map((action, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className="bg-amber-200 text-amber-800 rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0">
                            {idx + 1}
                          </span>
                          {action}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Individual User Experiences */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Individual User Experiences
                </h3>
                <div className="space-y-3">
                  {report.user_experiences.map((user) => (
                    <Card key={user.user_id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium">{user.user_name}</h4>
                              <Badge variant="outline" className="text-xs">{user.role}</Badge>
                              <Badge className={getSentimentColor(user.sentiment)}>
                                {getSentimentIcon(user.sentiment)}
                                <span className="ml-1 capitalize">{user.sentiment.replace('_', ' ')}</span>
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">{user.user_phone}</p>
                            <p className="text-sm">{user.summary}</p>
                            
                            {user.highlights.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-green-600 mb-1">Highlights:</p>
                                <div className="flex flex-wrap gap-1">
                                  {user.highlights.map((h, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs bg-green-100 text-green-700">
                                      {h}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {user.concerns.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-orange-600 mb-1">Concerns:</p>
                                <div className="flex flex-wrap gap-1">
                                  {user.concerns.map((c, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs bg-orange-100 text-orange-700">
                                      {c}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {user.recommended_actions.length > 0 && (
                              <div className="mt-2 p-2 bg-purple-50 rounded-lg">
                                <p className="text-xs font-medium text-purple-600 mb-1">Recommended Actions:</p>
                                <ul className="text-xs text-purple-700 space-y-1">
                                  {user.recommended_actions.map((a, i) => (
                                    <li key={i}>• {a}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          <div className="text-center">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
                              user.experience_score >= 70 ? 'bg-green-100 text-green-700' :
                              user.experience_score >= 40 ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {user.experience_score}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Score</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Report generated at {new Date(report.generated_at).toLocaleString()}
              </p>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

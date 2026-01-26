import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Zap,
  Brain,
  AlertTriangle
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface AISession {
  id: string;
  session_type: string;
  events_processed: number;
  recommendations_generated: number;
  auto_executed_actions: number;
  analysis_summary: Record<string, any> | null;
  model_used: string;
  duration_ms: number | null;
  status: string;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

interface AISessionHistoryProps {
  sessions: AISession[];
}

export function AISessionHistory({ sessions }: AISessionHistoryProps) {
  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold">No Analysis Sessions Yet</h3>
          <p className="text-sm text-muted-foreground">
            Run your first AI analysis to see the history here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((session) => (
        <Card key={session.id}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${
                  session.status === 'completed' ? 'bg-green-100' :
                  session.status === 'failed' ? 'bg-red-100' :
                  'bg-blue-100'
                }`}>
                  {session.status === 'completed' ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : session.status === 'failed' ? (
                    <XCircle className="h-5 w-5 text-red-600" />
                  ) : (
                    <Clock className="h-5 w-5 text-blue-600 animate-spin" />
                  )}
                </div>
                
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">
                      {session.session_type === 'scheduled' ? 'Scheduled Analysis' :
                       session.session_type === 'manual' ? 'Manual Analysis' :
                       'Triggered Analysis'}
                    </h4>
                    <Badge variant={session.status === 'completed' ? 'default' : 
                                   session.status === 'failed' ? 'destructive' : 'secondary'}>
                      {session.status}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mt-1">
                    {session.completed_at 
                      ? formatDistanceToNow(new Date(session.completed_at)) + ' ago'
                      : 'In progress...'}
                  </p>

                  {session.error_message && (
                    <div className="flex items-center gap-2 mt-2 text-red-600">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm">{session.error_message}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-lg font-bold">{session.events_processed}</p>
                    <p className="text-xs text-muted-foreground">Events</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-purple-600">{session.recommendations_generated}</p>
                    <p className="text-xs text-muted-foreground">Recommendations</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-600">{session.auto_executed_actions}</p>
                    <p className="text-xs text-muted-foreground">Auto-Executed</p>
                  </div>
                </div>
                
                {session.duration_ms && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Completed in {(session.duration_ms / 1000).toFixed(1)}s
                  </p>
                )}
              </div>
            </div>

            {session.analysis_summary && (
              <div className="mt-4 pt-4 border-t flex items-center gap-4 flex-wrap">
                <Badge variant="outline" className="text-purple-600">
                  <Zap className="h-3 w-3 mr-1" />
                  Risk: {session.analysis_summary.risk_recommendations || 0}
                </Badge>
                <Badge variant="outline" className="text-blue-600">
                  <Zap className="h-3 w-3 mr-1" />
                  Notifications: {session.analysis_summary.notification_recommendations || 0}
                </Badge>
                <Badge variant="outline" className="text-orange-600">
                  <Zap className="h-3 w-3 mr-1" />
                  Collection: {session.analysis_summary.collection_recommendations || 0}
                </Badge>
                <Badge variant="outline" className="text-amber-600">
                  <Zap className="h-3 w-3 mr-1" />
                  System: {session.analysis_summary.system_health_recommendations || 0}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  CheckCircle, 
  XCircle, 
  TrendingUp, 
  Bell, 
  Target,
  User,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Wrench,
  AlertTriangle
} from 'lucide-react';
import { useAIBrain } from '@/hooks/useAIBrain';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface AIRecommendationCardProps {
  recommendation: {
    id: string;
    recommendation_type: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    target_user_id: string | null;
    title: string;
    description: string;
    reasoning: string | null;
    suggested_action: Record<string, any>;
    confidence_score: number | null;
    status: string;
    created_at: string;
    review_notes?: string | null;
    executed_at?: string | null;
  };
  readonly?: boolean;
}

const priorityColors = {
  low: 'bg-slate-100 text-slate-700 border-slate-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
};

const typeIcons = {
  risk_adjustment: TrendingUp,
  notification: Bell,
  collection_action: Target,
  system_health: Wrench,
};

export function AIRecommendationCard({ recommendation, readonly = false }: AIRecommendationCardProps) {
  const { approveRecommendation, rejectRecommendation } = useAIBrain();
  const [expanded, setExpanded] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const TypeIcon = typeIcons[recommendation.recommendation_type as keyof typeof typeIcons] || Sparkles;
  const confidencePercent = recommendation.confidence_score 
    ? Math.round(recommendation.confidence_score * 100) 
    : null;

  const handleApprove = async () => {
    setProcessing(true);
    await approveRecommendation();
    setProcessing(false);
  };

  const handleReject = async () => {
    if (!rejectNotes.trim()) return;
    setProcessing(true);
    await rejectRecommendation();
    setProcessing(false);
  };

  return (
    <Card className={cn(
      "transition-all",
      recommendation.priority === 'critical' && "border-red-300 bg-red-50/30",
      recommendation.recommendation_type === 'system_health' && "border-amber-300 bg-amber-50/30"
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              recommendation.recommendation_type === 'risk_adjustment' && "bg-purple-100",
              recommendation.recommendation_type === 'notification' && "bg-blue-100",
              recommendation.recommendation_type === 'collection_action' && "bg-orange-100",
              recommendation.recommendation_type === 'system_health' && "bg-amber-100",
            )}>
              <TypeIcon className={cn(
                "h-5 w-5",
                recommendation.recommendation_type === 'risk_adjustment' && "text-purple-600",
                recommendation.recommendation_type === 'notification' && "text-blue-600",
                recommendation.recommendation_type === 'collection_action' && "text-orange-600",
                recommendation.recommendation_type === 'system_health' && "text-amber-600",
              )} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">{recommendation.title}</h3>
                <Badge className={priorityColors[recommendation.priority]}>
                  {recommendation.priority}
                </Badge>
                {confidencePercent && (
                  <Badge variant="outline" className="text-xs">
                    {confidencePercent}% confidence
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {recommendation.description}
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3">
          {recommendation.reasoning && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium mb-1">AI Reasoning</p>
              <p className="text-sm text-muted-foreground">{recommendation.reasoning}</p>
            </div>
          )}
          
          {/* Solution Steps for System Health */}
          {recommendation.recommendation_type === 'system_health' && 
           recommendation.suggested_action?.solution_steps && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <Wrench className="h-4 w-4 text-amber-600" />
                Recommended Solution Steps
              </p>
              <ol className="list-decimal list-inside space-y-1">
                {(recommendation.suggested_action.solution_steps as string[]).map((step, idx) => (
                  <li key={idx} className="text-sm text-muted-foreground">{step}</li>
                ))}
              </ol>
              {recommendation.suggested_action.requires_developer && (
                <div className="mt-2 flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs font-medium">Requires developer intervention</span>
                </div>
              )}
              {recommendation.suggested_action.estimated_impact && (
                <p className="mt-2 text-xs text-muted-foreground">
                  <strong>Impact:</strong> {recommendation.suggested_action.estimated_impact}
                </p>
              )}
            </div>
          )}
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Created {formatDistanceToNow(new Date(recommendation.created_at))} ago</span>
            {recommendation.suggested_action?.action_type && (
              <Badge variant="secondary">
                {recommendation.suggested_action.action_type.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>

          {recommendation.status === 'approved' || recommendation.status === 'auto_executed' ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">
                {recommendation.status === 'auto_executed' ? 'Auto-executed' : 'Approved'} 
                {recommendation.executed_at && ` ${formatDistanceToNow(new Date(recommendation.executed_at))} ago`}
              </span>
            </div>
          ) : recommendation.status === 'rejected' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="h-4 w-4" />
                <span className="text-sm">Rejected</span>
              </div>
              {recommendation.review_notes && (
                <p className="text-sm text-muted-foreground">
                  Reason: {recommendation.review_notes}
                </p>
              )}
            </div>
          ) : null}

          {!readonly && recommendation.status === 'pending' && (
            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={handleApprove}
                disabled={processing}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve & Execute
              </Button>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="flex-1 border-red-200 text-red-600 hover:bg-red-50">
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reject Recommendation</AlertDialogTitle>
                    <AlertDialogDescription>
                      Please provide a reason for rejecting this AI recommendation. This helps improve future suggestions.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <Textarea
                    placeholder="Reason for rejection..."
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
                    className="min-h-[100px]"
                  />
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleReject}
                      disabled={!rejectNotes.trim() || processing}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Reject
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Shield, CheckCircle2, FileText, Clock, Eye, 
  AlertTriangle, Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SupporterAgreementCardProps {
  hasAccepted: boolean;
  acceptedAt?: string | null;
  onReviewClick: () => void;
  loading?: boolean;
}

export function SupporterAgreementCard({ 
  hasAccepted, 
  acceptedAt, 
  onReviewClick,
  loading = false
}: SupporterAgreementCardProps) {
  if (loading) {
    return (
      <Card className="border-0 bg-muted/30">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (hasAccepted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-0 bg-gradient-to-r from-success/10 via-success/5 to-emerald-500/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-xl bg-success/20 shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-foreground text-sm">
                      Supporter Agreement
                    </h4>
                    <Badge className="bg-success/20 text-success border-success/30 text-[10px] px-1.5">
                      Accepted ✅
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                      {acceptedAt 
                        ? format(new Date(acceptedAt), 'MMM d, yyyy • h:mm a')
                        : 'Accepted'}
                    </span>
                  </div>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={onReviewClick}
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
              >
                <Eye className="h-3.5 w-3.5" />
                View
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card className="border-2 border-warning/50 bg-gradient-to-r from-warning/10 via-warning/5 to-orange-500/10 shadow-lg shadow-warning/10">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
              <div className="p-2.5 sm:p-3 rounded-xl bg-warning/20 shrink-0">
                <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-warning" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h4 className="font-bold text-foreground text-sm sm:text-base">
                    Supporter Participation Agreement
                  </h4>
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    Required
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    12 Months
                  </span>
                  <span>•</span>
                  <span>v1.0</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Accept to unlock tenant support features
                </p>
              </div>
            </div>
            
            <Button
              onClick={onReviewClick}
              className="w-full sm:w-auto gap-2 bg-warning hover:bg-warning/90 text-warning-foreground font-bold shadow-lg shadow-warning/25"
            >
              <FileText className="h-4 w-4" />
              Review & Accept
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

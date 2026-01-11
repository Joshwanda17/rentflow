import { AlertTriangle, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface SupporterAgreementBannerProps {
  onReviewClick: () => void;
}

export function SupporterAgreementBanner({ onReviewClick }: SupporterAgreementBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-xl border-2 border-warning bg-gradient-to-r from-warning/15 via-warning/10 to-orange-500/15 p-4 shadow-lg"
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-warning/10 rounded-full blur-3xl" />
      
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="p-3 rounded-xl bg-warning/20 shrink-0">
            <AlertTriangle className="h-6 w-6 text-warning" />
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-foreground text-sm sm:text-base">
              Acceptance Required: Supporter Participation Agreement
            </h4>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              You must accept the agreement before supporting tenants.
            </p>
          </div>
        </div>
        
        <Button
          onClick={onReviewClick}
          className="w-full sm:w-auto gap-2 bg-warning hover:bg-warning/90 text-warning-foreground font-bold shadow-lg shadow-warning/25"
        >
          <FileCheck className="h-4 w-4" />
          Review & Accept
        </Button>
      </div>
    </motion.div>
  );
}

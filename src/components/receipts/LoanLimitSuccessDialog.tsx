import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, CreditCard, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { motion, AnimatePresence } from 'framer-motion';

interface LoanLimitSuccessDialogProps {
  open: boolean;
  onClose: () => void;
  previousLimit: number;
  newLimit: number;
  receiptAmount: number;
}

const MAX_LOAN_LIMIT = 30000000;

export function LoanLimitSuccessDialog({
  open,
  onClose,
  previousLimit,
  newLimit,
  receiptAmount,
}: LoanLimitSuccessDialogProps) {
  const navigate = useNavigate();
  const [animatedLimit, setAnimatedLimit] = useState(previousLimit);
  const [showIncrease, setShowIncrease] = useState(false);
  
  const increase = newLimit - previousLimit;
  const progressPercent = (newLimit / MAX_LOAN_LIMIT) * 100;

  useEffect(() => {
    if (open) {
      setAnimatedLimit(previousLimit);
      setShowIncrease(false);
      
      // Start animation after a small delay
      const timer1 = setTimeout(() => {
        setShowIncrease(true);
      }, 300);

      // Animate the number counting up
      const timer2 = setTimeout(() => {
        const duration = 1500;
        const steps = 30;
        const stepValue = increase / steps;
        let current = previousLimit;
        let step = 0;

        const interval = setInterval(() => {
          step++;
          current += stepValue;
          setAnimatedLimit(Math.min(current, newLimit));
          
          if (step >= steps) {
            clearInterval(interval);
            setAnimatedLimit(newLimit);
          }
        }, duration / steps);

        return () => clearInterval(interval);
      }, 500);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [open, previousLimit, newLimit, increase]);

  const handleApplyForLoan = () => {
    onClose();
    navigate('/my-loans');
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">Receipt Submitted Successfully</DialogTitle>
        </DialogHeader>
        
        <div className="text-center space-y-6 py-4">
          {/* Success Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center"
          >
            <CheckCircle2 className="h-8 w-8 text-success" />
          </motion.div>

          {/* Title */}
          <div className="space-y-1">
            <h2 className="text-xl font-bold">Receipt Submitted!</h2>
            <p className="text-sm text-muted-foreground">
              Your rent access limit is increasing
            </p>
          </div>

          {/* Loan Limit Animation */}
          <div className="relative p-6 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20">
            {/* Sparkles decoration */}
            <AnimatePresence>
              {showIncrease && (
                <>
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute -top-2 -right-2"
                  >
                    <Sparkles className="h-5 w-5 text-yellow-500" />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="absolute -bottom-1 -left-1"
                  >
                    <Sparkles className="h-4 w-4 text-primary" />
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            <div className="flex items-center justify-center gap-2 mb-3">
              <CreditCard className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">Your Rent Access Limit</span>
            </div>

            {/* Animated Amount */}
            <motion.div
              className="text-3xl font-bold text-primary"
              animate={{ scale: showIncrease ? [1, 1.05, 1] : 1 }}
              transition={{ duration: 0.3 }}
            >
              {formatUGX(Math.round(animatedLimit))}
            </motion.div>

            {/* Increase Badge */}
            <AnimatePresence>
              {showIncrease && increase > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center gap-1.5 mt-3"
                >
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-success/10 text-success font-semibold text-sm">
                    <TrendingUp className="h-4 w-4" />
                    +{formatUGX(increase)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress Bar */}
            <div className="mt-4 space-y-1.5">
              <Progress value={progressPercent} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progressPercent.toFixed(1)}% unlocked</span>
                <span>Max: {formatUGX(MAX_LOAN_LIMIT)}</span>
              </div>
            </div>
          </div>

          {/* Receipt Info */}
          <p className="text-xs text-muted-foreground">
            Receipt amount: <span className="font-medium">{formatUGX(receiptAmount)}</span> → 
            <span className="text-success font-medium"> +{formatUGX(increase)}</span> limit increase
          </p>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button 
              onClick={handleApplyForLoan} 
              className="w-full gap-2"
              size="lg"
            >
              <CreditCard className="h-4 w-4" />
              Apply for a Loan Now
              <ArrowRight className="h-4 w-4 ml-auto" />
            </Button>
            
            <Button 
              variant="ghost" 
              onClick={onClose}
              className="w-full text-muted-foreground"
            >
              Continue Shopping
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

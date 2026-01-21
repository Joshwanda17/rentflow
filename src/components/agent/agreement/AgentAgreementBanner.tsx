import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ChevronDown, ChevronUp, FileText, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import AgentAgreementModal from './AgentAgreementModal';
import { useAgentAgreement } from '@/hooks/useAgentAgreement';

export default function AgentAgreementBanner() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const { isAccepted, isLoading, acceptAgreement } = useAgentAgreement();

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      return await acceptAgreement();
    } finally {
      setIsAccepting(false);
    }
  };

  if (isLoading || isAccepted) {
    return null;
  }

  return (
    <>
      <AnimatePresence>
        {!isExpanded ? (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onClick={() => setIsExpanded(true)}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-xl text-sm font-medium"
          >
            <Lock className="h-4 w-4" />
            <span>Action Required: Accept Agent Terms</span>
            <ChevronDown className="h-4 w-4" />
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="relative overflow-hidden border-amber-500/50 bg-gradient-to-r from-amber-500/10 to-orange-500/10">
              {/* Collapse button */}
              <button
                onClick={() => setIsExpanded(false)}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted/50 transition-colors"
              >
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              </button>

              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/20 shrink-0">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-amber-700 dark:text-amber-400">
                      Accept Agent Terms & Conditions
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Please review and accept the Agent Terms to unlock all agent features including registrations, earnings, and withdrawals.
                    </p>
                    
                    {/* Locked features preview */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {['Register Users', 'Withdrawals', 'Earnings'].map((feature) => (
                        <span
                          key={feature}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-xs text-muted-foreground"
                        >
                          <Lock className="h-3 w-3" />
                          {feature}
                        </span>
                      ))}
                    </div>

                    <Button
                      onClick={() => setIsModalOpen(true)}
                      size="sm"
                      className="mt-4 gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      Review & Accept
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <AgentAgreementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAccept={handleAccept}
        isAccepting={isAccepting}
      />
    </>
  );
}

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, FileCheck } from 'lucide-react';
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

  // Auto-accept on first load if not already accepted
  const handleAutoAccept = async () => {
    if (!isAccepted && !isLoading) {
      setIsAccepting(true);
      try {
        await acceptAgreement();
      } finally {
        setIsAccepting(false);
      }
    }
  };

  return (
    <>
      <AnimatePresence>
        {!isAccepted && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="relative overflow-hidden border-blue-500/50 bg-gradient-to-r from-blue-500/10 to-primary/10">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-blue-500/20 shrink-0">
                    <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-blue-700 dark:text-blue-400">
                      Agent Terms & Conditions
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      By using Welile as an Agent, you automatically agree to our Agent Terms & Conditions. 
                      You are an independent platform partner, not an employee.
                    </p>
                    
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button
                        onClick={() => setIsModalOpen(true)}
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        <FileText className="h-4 w-4" />
                        View Terms
                      </Button>
                      <Button
                        onClick={handleAutoAccept}
                        size="sm"
                        className="gap-2"
                        disabled={isAccepting}
                      >
                        {isAccepting ? (
                          <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        ) : (
                          <FileCheck className="h-4 w-4" />
                        )}
                        I Understand
                      </Button>
                    </div>
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
        viewOnly={isAccepted}
      />
    </>
  );
}

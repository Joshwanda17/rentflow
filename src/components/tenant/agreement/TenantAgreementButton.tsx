import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileCheck, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import TenantAgreementModal from './TenantAgreementModal';
import { useTenantAgreement } from '@/hooks/useTenantAgreement';
import { hapticTap } from '@/lib/haptics';

export default function TenantAgreementButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const { isAccepted, isLoading, acceptAgreement } = useTenantAgreement();

  const handleOpenModal = () => {
    hapticTap();
    setIsModalOpen(true);
  };

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      return await acceptAgreement();
    } finally {
      setIsAccepting(false);
    }
  };

  if (isLoading) {
    return null;
  }

  if (isAccepted) {
    return (
      <>
        <motion.button
          onClick={handleOpenModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors"
          whileTap={{ scale: 0.95 }}
        >
          <FileCheck className="h-3.5 w-3.5" />
          <span>Terms Accepted ✅</span>
        </motion.button>

        <TenantAgreementModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onAccept={handleAccept}
          viewOnly={true}
        />
      </>
    );
  }

  return (
    <>
      <motion.div className="relative">
        <Button
          onClick={handleOpenModal}
          size="sm"
          className={cn(
            "relative px-3 py-1.5 h-auto text-xs font-medium",
            "bg-primary hover:bg-primary/90"
          )}
        >
          <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
          Accept Terms
        </Button>
        
        {/* Red dot indicator */}
        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-red-500 rounded-full animate-pulse" />
      </motion.div>

      <TenantAgreementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAccept={handleAccept}
        isAccepting={isAccepting}
      />
    </>
  );
}

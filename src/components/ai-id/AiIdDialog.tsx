import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Fingerprint } from 'lucide-react';
import WelileAiIdCard from './WelileAiIdCard';
import { AiIdLendDialog } from './AiIdLendDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AiIdDialog({ open, onOpenChange }: Props) {
  const [lendTarget, setLendTarget] = useState<{ aiId: string; limit: number } | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-primary" />
              Welile AI ID
            </DialogTitle>
          </DialogHeader>
          <WelileAiIdCard
            onLendClick={(aiId, limit) => setLendTarget({ aiId, limit })}
          />
        </DialogContent>
      </Dialog>

      {lendTarget && (
        <AiIdLendDialog
          open={!!lendTarget}
          onOpenChange={(v) => !v && setLendTarget(null)}
          targetAiId={lendTarget.aiId}
          maxAmount={lendTarget.limit}
        />
      )}
    </>
  );
}

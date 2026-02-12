import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { History } from 'lucide-react';

interface InvestmentEditHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | null;
  accountName: string;
}

export function InvestmentEditHistoryDialog({
  open,
  onOpenChange,
  accountId,
  accountName
}: InvestmentEditHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Edit History
          </DialogTitle>
        </DialogHeader>
        <div className="py-8 text-center text-muted-foreground">
          Edit history feature is currently disabled.
        </div>
      </DialogContent>
    </Dialog>
  );
}

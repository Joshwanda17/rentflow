import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle } from 'lucide-react';

interface FundInvestmentAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: {
    id: string;
    name: string;
    balance: number;
    user_id: string;
    user_name?: string;
  } | null;
  onSuccess: () => void;
}

export function FundInvestmentAccountDialog({
  open,
  onOpenChange,
  account,
  onSuccess
}: FundInvestmentAccountDialogProps) {
  const { toast } = useToast();

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Feature Unavailable
          </DialogTitle>
        </DialogHeader>
        <div className="py-8 text-center">
          <p className="text-muted-foreground">
            Investment account funding is currently disabled.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={handleClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

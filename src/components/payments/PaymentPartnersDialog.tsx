import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import PaymentPartnersCard from './PaymentPartnersCard';

interface PaymentPartnersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardType: 'tenant' | 'supporter';
  title?: string;
}

export default function PaymentPartnersDialog({ 
  open, 
  onOpenChange, 
  dashboardType,
  title = 'Payment Partners'
}: PaymentPartnersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-80px)] p-4 pt-2">
          <PaymentPartnersCard 
            dashboardType={dashboardType}
            onPaymentSubmitted={() => onOpenChange(false)}
          />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

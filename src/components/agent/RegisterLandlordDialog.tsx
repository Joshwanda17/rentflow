import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Building2 } from 'lucide-react';
import { toast } from 'sonner';
import LandlordRegistrationForm from '@/components/shared/LandlordRegistrationForm';

interface RegisterLandlordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (landlord?: {
    id: string;
    name: string;
    phone: string;
    property_address: string | null;
    house_category?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }) => void;
  minimal?: boolean;
}

export default function RegisterLandlordDialog({ open, onOpenChange, onSuccess, minimal }: RegisterLandlordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Register Landlord
          </DialogTitle>
          <DialogDescription>
            Register a property owner for your portfolio
          </DialogDescription>
        </DialogHeader>
        <LandlordRegistrationForm
          registeredByRole="agent"
          onSuccess={onSuccess}
          onClose={() => onOpenChange(false)}
          toastFn={(opts) => {
            if (opts.variant === 'destructive') {
              toast.error(opts.title, { description: opts.description });
            } else {
              toast.success(opts.title, { description: opts.description });
            }
          }}
          minimal={minimal}
        />
      </DialogContent>
    </Dialog>
  );
}

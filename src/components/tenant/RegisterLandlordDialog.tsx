import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useGeoLocation } from '@/hooks/useGeoLocation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Building2 } from 'lucide-react';
import LandlordRegistrationForm from '@/components/shared/LandlordRegistrationForm';

interface RegisterLandlordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function RegisterLandlordDialog({ open, onOpenChange, onSuccess }: RegisterLandlordDialogProps) {
  const { toast } = useToast();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Register Landlord
          </DialogTitle>
          <DialogDescription>
            Register your landlord to qualify for rent services
          </DialogDescription>
        </DialogHeader>
        <LandlordRegistrationForm
          registeredByRole="tenant"
          onSuccess={onSuccess}
          onClose={() => onOpenChange(false)}
          toastFn={(opts) => toast(opts)}
        />
      </DialogContent>
    </Dialog>
  );
}

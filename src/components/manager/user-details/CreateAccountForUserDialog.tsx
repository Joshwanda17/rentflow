import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { AlertTriangle } from 'lucide-react';

interface CreateAccountForUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    full_name: string;
    phone: string;
  };
  onSuccess: () => void;
}

export default function CreateAccountForUserDialog({
  open,
  onOpenChange,
  user,
  onSuccess
}: CreateAccountForUserDialogProps) {
  const isMobile = useIsMobile();

  const handleClose = () => onOpenChange(false);

  const Content = () => (
    <div className="py-8 text-center">
      <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <p className="text-muted-foreground">Investment accounts feature is currently disabled.</p>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleClose}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Feature Unavailable</DrawerTitle>
          </DrawerHeader>
          <div className="px-4"><Content /></div>
          <DrawerFooter><Button onClick={handleClose} className="w-full">Close</Button></DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Feature Unavailable</DialogTitle></DialogHeader>
        <Content />
        <DialogFooter><Button onClick={handleClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useConfetti } from '@/components/Confetti';
import { useIsMobile } from '@/hooks/use-mobile';
import { Loader2, Sparkles, CheckCircle, MessageCircle, Copy } from 'lucide-react';
import { hapticTap, hapticSuccess } from '@/lib/haptics';

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

const COLORS = [
  { id: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { id: 'green', label: 'Green', class: 'bg-green-500' },
  { id: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { id: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { id: 'pink', label: 'Pink', class: 'bg-pink-500' },
];

const APP_URL = 'https://welile2.lovable.app';

interface CreatedAccountInfo {
  accountId: string;
  accountName: string;
  activationLink: string;
}

export default function CreateAccountForUserDialog({
  open,
  onOpenChange,
  user,
  onSuccess
}: CreateAccountForUserDialogProps) {
  const isMobile = useIsMobile();
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const [creating, setCreating] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<CreatedAccountInfo | null>(null);
  const { toast } = useToast();
  const { fireSuccess } = useConfetti();

  const generateActivationLink = (accountId: string) => {
    return `${APP_URL}/dashboard?activate_account=${accountId}`;
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    
    hapticTap();
    setCreating(true);
    
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      const { data: newAccount, error } = await supabase
        .from('investment_accounts')
        .insert({
          user_id: user.id,
          name: name.trim(),
          color,
          status: 'approved', // Manager-created accounts are pre-approved
          balance: 0,
          approved_by: currentUser?.id,
          approved_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) throw error;

      if (newAccount) {
        const activationLink = generateActivationLink(newAccount.id);
        
        // Notify the supporter
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: '🎉 Investment Account Created!',
          message: `A manager has created an investment account "${name.trim()}" for you. It's ready to use!`,
          type: 'success',
          metadata: { account_id: newAccount.id, account_name: name.trim() }
        });

        hapticSuccess();
        fireSuccess();
        
        setCreatedAccount({
          accountId: newAccount.id,
          accountName: name.trim(),
          activationLink
        });
        
        toast({ 
          title: '🎉 Account Created!', 
          description: 'Investment account created successfully' 
        });
        
        onSuccess();
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleShareWhatsApp = () => {
    if (!createdAccount) return;
    
    hapticTap();
    const message = `🎉 *Welile Investment Account Created!*\n\nHello ${user.full_name},\n\nYour investment account "${createdAccount.accountName}" has been created and is ready to use!\n\n💰 Start investing and earn 15% monthly interest!\n\n👉 Open Welile: ${APP_URL}`;
    
    let phone = user.phone.replace(/\D/g, '');
    if (phone.startsWith('0')) {
      phone = '256' + phone.slice(1);
    } else if (!phone.startsWith('256')) {
      phone = '256' + phone;
    }
    
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleCopyLink = async () => {
    if (!createdAccount) return;
    
    try {
      await navigator.clipboard.writeText(APP_URL);
      hapticSuccess();
      toast({ title: '✅ Link Copied!', description: 'App link copied to clipboard' });
    } catch {
      toast({ title: 'Copy failed', description: 'Please copy the link manually', variant: 'destructive' });
    }
  };

  const handleClose = () => {
    setName('');
    setColor('blue');
    setCreatedAccount(null);
    onOpenChange(false);
  };

  const FormContent = () => (
    <div className="space-y-4 py-4">
      {createdAccount ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-success/10 border border-success/30 text-center">
            <CheckCircle className="h-12 w-12 text-success mx-auto mb-3" />
            <h3 className="font-bold text-lg">Account Created!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Investment account for <strong>{user.full_name}</strong> is ready.
            </p>
          </div>

          <Button 
            onClick={handleShareWhatsApp}
            className="w-full gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white h-12"
            size="lg"
          >
            <MessageCircle className="h-5 w-5" />
            Notify on WhatsApp
          </Button>

          <Button 
            variant="outline" 
            onClick={handleCopyLink}
            className="w-full gap-2 h-12"
          >
            <Copy className="h-4 w-4" />
            Copy App Link
          </Button>
        </div>
      ) : (
        <>
          <div className="p-3 rounded-lg border bg-primary/5 border-primary/20">
            <p className="text-sm font-medium">Creating account for:</p>
            <p className="text-lg font-semibold text-primary">{user.full_name}</p>
            <p className="text-xs text-muted-foreground">{user.phone}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-name">Account Name</Label>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Rent Portfolio, High Yield..."
              className="h-12 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label>Account Color</Label>
            <RadioGroup 
              value={color} 
              onValueChange={setColor} 
              className="flex gap-3 flex-wrap"
            >
              {COLORS.map((c) => (
                <div key={c.id} className="flex items-center">
                  <RadioGroupItem value={c.id} id={`color-${c.id}`} className="sr-only" />
                  <Label
                    htmlFor={`color-${c.id}`}
                    className={`w-10 h-10 rounded-full cursor-pointer ring-2 ring-offset-2 ring-offset-background transition-all touch-manipulation active:scale-95 ${c.class} ${
                      color === c.id ? 'ring-foreground' : 'ring-transparent hover:ring-muted-foreground/50'
                    }`}
                  />
                </div>
              ))}
            </RadioGroup>
          </div>
        </>
      )}
    </div>
  );

  const FooterButtons = () => (
    <>
      {createdAccount ? (
        <Button onClick={handleClose} className="w-full h-12">
          Done
        </Button>
      ) : (
        <div className="flex gap-3 w-full">
          <Button variant="outline" onClick={handleClose} className="flex-1 h-12">
            Cancel
          </Button>
          <Button 
            onClick={handleCreate} 
            disabled={!name.trim() || creating}
            className="flex-1 gap-2 h-12"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Create
              </>
            )}
          </Button>
        </div>
      )}
    </>
  );

  // Mobile: Use Drawer for better touch experience
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleClose}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {createdAccount ? 'Account Created' : 'Create Investment Account'}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 overflow-y-auto">
            <FormContent />
          </div>
          <DrawerFooter className="pt-2">
            <FooterButtons />
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: Use Dialog
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {createdAccount ? 'Account Created' : 'Create Investment Account'}
          </DialogTitle>
        </DialogHeader>
        <FormContent />
        <DialogFooter>
          <FooterButtons />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

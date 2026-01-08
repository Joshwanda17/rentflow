import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageCircle, Copy, ExternalLink, Check } from 'lucide-react';
import { toast } from 'sonner';
import { parsePhoneNumber } from '@/lib/phoneUtils';

interface User {
  id: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
}

interface BulkWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUsers: User[];
}

export default function BulkWhatsAppDialog({
  open,
  onOpenChange,
  selectedUsers,
}: BulkWhatsAppDialogProps) {
  const [message, setMessage] = useState('');
  const [copiedNumbers, setCopiedNumbers] = useState(false);
  const [openingIndex, setOpeningIndex] = useState<number | null>(null);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getWhatsAppLinkWithMessage = (phone: string) => {
    const phoneInfo = parsePhoneNumber(phone);
    const baseLink = phoneInfo.whatsappLink;
    if (message.trim()) {
      return `${baseLink}?text=${encodeURIComponent(message)}`;
    }
    return baseLink;
  };

  const handleCopyNumbers = () => {
    const numbers = selectedUsers.map(u => {
      const phoneInfo = parsePhoneNumber(u.phone);
      return phoneInfo.formatted;
    }).join('\n');
    
    navigator.clipboard.writeText(numbers);
    setCopiedNumbers(true);
    toast.success(`${selectedUsers.length} phone numbers copied to clipboard`);
    
    setTimeout(() => setCopiedNumbers(false), 2000);
  };

  const handleOpenSingleChat = (phone: string, index: number) => {
    setOpeningIndex(index);
    window.open(getWhatsAppLinkWithMessage(phone), '_blank');
    setTimeout(() => setOpeningIndex(null), 500);
  };

  const handleOpenAllChats = () => {
    if (selectedUsers.length > 10) {
      toast.warning('Opening more than 10 chats may be blocked by your browser. Consider opening in batches.');
    }
    
    selectedUsers.forEach((user, index) => {
      setTimeout(() => {
        window.open(getWhatsAppLinkWithMessage(user.phone), '_blank');
      }, index * 300); // Stagger opening to avoid popup blockers
    });
    
    toast.success(`Opening ${selectedUsers.length} WhatsApp chats...`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-success" />
            Message {selectedUsers.length} Users
          </DialogTitle>
          <DialogDescription>
            Send a WhatsApp message to selected users
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Message Template */}
          <div className="space-y-2">
            <Label htmlFor="message">Message Template (optional)</Label>
            <Textarea
              id="message"
              placeholder="Type your message here... This will be pre-filled when opening each chat."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>

          {/* Selected Users List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Selected Users</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyNumbers}
                className="h-7 text-xs gap-1"
              >
                {copiedNumbers ? (
                  <>
                    <Check className="h-3 w-3" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy All Numbers
                  </>
                )}
              </Button>
            </div>
            
            <ScrollArea className="h-48 rounded-lg border">
              <div className="p-2 space-y-1">
                {selectedUsers.map((user, index) => {
                  const phoneInfo = parsePhoneNumber(user.phone);
                  return (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {getInitials(user.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{user.full_name}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            {!phoneInfo.isUgandan && <span>{phoneInfo.countryFlag}</span>}
                            {phoneInfo.formatted}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => handleOpenSingleChat(user.phone, index)}
                      >
                        {openingIndex === index ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleOpenAllChats}
            className="gap-2 bg-success hover:bg-success/90 text-success-foreground"
          >
            <MessageCircle className="h-4 w-4" />
            Open All Chats
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
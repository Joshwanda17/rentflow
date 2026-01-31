import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Loader2, Check, Clock, X } from 'lucide-react';
import { useWhatsAppRequests } from '@/hooks/useWhatsAppRequests';
import { getWhatsAppLink } from '@/lib/phoneUtils';
import { cn } from '@/lib/utils';
import { hapticTap, hapticSuccess } from '@/lib/haptics';

interface WhatsAppRequestButtonProps {
  targetUserId: string;
  targetName?: string;
  targetPhone?: string;
  size?: 'default' | 'sm' | 'icon';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
  showLabel?: boolean;
}

export function WhatsAppRequestButton({
  targetUserId,
  targetName,
  targetPhone,
  size = 'icon',
  variant = 'ghost',
  className,
  showLabel = false
}: WhatsAppRequestButtonProps) {
  const { sendRequest, getRequestStatus, getApprovedPhone } = useWhatsAppRequests();
  const [showDialog, setShowDialog] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const status = getRequestStatus(targetUserId);
  const approvedPhone = getApprovedPhone(targetUserId) || targetPhone;

  const handleClick = () => {
    hapticTap();
    
    if (status === 'approved' && approvedPhone) {
      // Already approved - open WhatsApp directly
      window.open(getWhatsAppLink(approvedPhone), '_blank');
    } else if (status === 'pending') {
      // Already pending - show status
    } else {
      // Show request dialog
      setShowDialog(true);
    }
  };

  const handleSendRequest = async () => {
    setLoading(true);
    hapticTap();
    
    const success = await sendRequest(targetUserId, message || undefined);
    
    if (success) {
      hapticSuccess();
      setShowDialog(false);
      setMessage('');
    }
    
    setLoading(false);
  };

  const getButtonContent = () => {
    if (status === 'approved') {
      return (
        <>
          <MessageCircle className="h-4 w-4" />
          {showLabel && <span className="ml-2">WhatsApp</span>}
        </>
      );
    }
    
    if (status === 'pending') {
      return (
        <>
          <Clock className="h-4 w-4" />
          {showLabel && <span className="ml-2">Pending</span>}
        </>
      );
    }
    
    return (
      <>
        <MessageCircle className="h-4 w-4" />
        {showLabel && <span className="ml-2">Request</span>}
      </>
    );
  };

  return (
    <>
      <Button
        variant={status === 'approved' ? 'default' : variant}
        size={size}
        onClick={handleClick}
        disabled={status === 'pending'}
        className={cn(
          status === 'approved' && 'bg-[#25D366] hover:bg-[#20BD5A] text-white',
          status === 'pending' && 'opacity-60',
          className
        )}
        title={
          status === 'approved' ? 'Open WhatsApp' :
          status === 'pending' ? 'Waiting for approval' :
          'Request WhatsApp contact'
        }
      >
        {getButtonContent()}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-[#25D366]" />
              Request WhatsApp Contact
            </DialogTitle>
            <DialogDescription>
              {targetName ? (
                <>Send a request to <strong>{targetName}</strong> to contact them on WhatsApp.</>
              ) : (
                <>Send a request to contact this user on WhatsApp.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Textarea
              placeholder="Optional: Add a message explaining why you'd like to connect..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length}/200
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSendRequest} 
              disabled={loading}
              className="bg-[#25D366] hover:bg-[#20BD5A] text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Send Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

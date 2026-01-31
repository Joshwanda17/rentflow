import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MessageCircle, Phone } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import { WhatsAppRequestButton } from './WhatsAppRequestButton';
import { hapticTap } from '@/lib/haptics';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ContactActionsBarProps {
  userId: string;
  userName?: string;
  userPhone?: string;
  showLabels?: boolean;
  className?: string;
  compact?: boolean;
}

export function ContactActionsBar({
  userId,
  userName,
  userPhone,
  showLabels = false,
  className,
  compact = false
}: ContactActionsBarProps) {
  const navigate = useNavigate();
  const { startConversation } = useChat();
  const [startingChat, setStartingChat] = useState(false);

  const handleStartChat = async () => {
    hapticTap();
    setStartingChat(true);
    
    const conversationId = await startConversation(userId);
    if (conversationId) {
      navigate(`/chat?conversation=${conversationId}`);
    }
    
    setStartingChat(false);
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        {/* In-App Chat - Primary Action */}
        <Button
          variant="default"
          size="icon"
          onClick={handleStartChat}
          disabled={startingChat}
          className="h-9 w-9 bg-primary hover:bg-primary/90"
          title="Chat in app"
        >
          <MessageCircle className="h-4 w-4" />
        </Button>

        {/* WhatsApp Request */}
        <WhatsAppRequestButton
          targetUserId={userId}
          targetName={userName}
          targetPhone={userPhone}
          size="icon"
          variant="outline"
          className="h-9 w-9"
        />

        {/* Phone Call */}
        {userPhone && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => window.open(`tel:${userPhone}`, '_self')}
            className="h-9 w-9"
            title="Call"
          >
            <Phone className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* In-App Chat - Primary Action */}
      <Button
        variant="default"
        size={showLabels ? "default" : "icon"}
        onClick={handleStartChat}
        disabled={startingChat}
        className="bg-primary hover:bg-primary/90"
        title="Chat in app"
      >
        <MessageCircle className="h-4 w-4" />
        {showLabels && <span className="ml-2">{startingChat ? 'Starting...' : 'Chat'}</span>}
      </Button>

      {/* WhatsApp Request */}
      <WhatsAppRequestButton
        targetUserId={userId}
        targetName={userName}
        targetPhone={userPhone}
        size={showLabels ? "default" : "icon"}
        variant="outline"
        showLabel={showLabels}
      />

      {/* Phone Call */}
      {userPhone && (
        <Button
          variant="outline"
          size={showLabels ? "default" : "icon"}
          onClick={() => window.open(`tel:${userPhone}`, '_self')}
          title="Call"
        >
          <Phone className="h-4 w-4" />
          {showLabels && <span className="ml-2">Call</span>}
        </Button>
      )}
    </div>
  );
}

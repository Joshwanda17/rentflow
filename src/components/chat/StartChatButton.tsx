import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '@/hooks/useChat';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

interface StartChatButtonProps {
  userId: string;
  userName: string;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'icon';
  className?: string;
}

export default function StartChatButton({ 
  userId, 
  userName, 
  variant = 'outline',
  size = 'sm',
  className 
}: StartChatButtonProps) {
  const navigate = useNavigate();
  const { startConversation } = useChat();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const conversationId = await startConversation(userId);
    
    if (conversationId) {
      navigate(`/chat?conversation=${conversationId}`);
    } else {
      toast.error('Failed to start conversation');
    }
    setLoading(false);
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={loading}
      className={className}
    >
      <MessageCircle className="h-4 w-4" />
      {size !== 'icon' && <span className="ml-2">{loading ? 'Starting...' : 'Chat'}</span>}
    </Button>
  );
}

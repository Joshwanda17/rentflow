import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { PresenceProvider } from '@/hooks/usePresence';
import ChatList from '@/components/chat/ChatList';
import ChatWindow from '@/components/chat/ChatWindow';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import MobileBottomNav from '@/components/MobileBottomNav';
export default function ChatPage() {
  const { user, role: currentRole, signOut } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(
    searchParams.get('conversation')
  );

  useEffect(() => {
    const convId = searchParams.get('conversation');
    if (convId) {
      setSelectedConversation(convId);
    }
  }, [searchParams]);

  if (!user) {
    return null;
  }

  const handleSelectConversation = (id: string) => {
    setSelectedConversation(id);
    navigate(`/chat?conversation=${id}`, { replace: true });
  };

  const handleBack = () => {
    setSelectedConversation(null);
    navigate('/chat', { replace: true });
  };

  // Mobile view: show either list or conversation
  if (isMobile) {
    return (
      <PresenceProvider>
        <div className="min-h-screen bg-background flex flex-col pb-16">
          {/* Header */}
          <div className="p-4 border-b flex items-center gap-3">
            {selectedConversation ? (
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <h1 className="font-bold text-lg">
              {selectedConversation ? '' : 'Messages'}
            </h1>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {selectedConversation ? (
              <ChatWindow conversationId={selectedConversation} onBack={handleBack} />
            ) : (
              <ChatList onSelectConversation={handleSelectConversation} />
            )}
          </div>

          <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
        </div>
      </PresenceProvider>
    );
  }

  // Desktop view: side by side
  return (
    <PresenceProvider>
      <div className="min-h-screen bg-background flex">
        {/* Sidebar */}
        <div className="w-80 border-r flex flex-col">
          <div className="p-4 border-b flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-bold text-lg">Messages</h1>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatList 
              onSelectConversation={handleSelectConversation} 
              selectedId={selectedConversation || undefined}
            />
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <ChatWindow conversationId={selectedConversation} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <div className="p-6 rounded-full bg-muted mb-4">
                <MessageCircle className="h-12 w-12" />
              </div>
              <h2 className="font-semibold text-lg mb-1">Select a conversation</h2>
              <p className="text-sm">Choose a conversation from the list to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </PresenceProvider>
  );
}

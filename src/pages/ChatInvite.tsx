import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, LogIn, UserPlus, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface InviterProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  roles: string[];
}

export default function ChatInvitePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { startConversation } = useChat();
  const [inviter, setInviter] = useState<InviterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    async function fetchInviter() {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        const [profileRes, rolesRes] = await Promise.all([
          supabase.from('profiles').select('id, full_name, avatar_url').eq('id', userId).single(),
          supabase.from('user_roles').select('role').eq('user_id', userId)
        ]);

        if (profileRes.data) {
          setInviter({
            id: profileRes.data.id,
            full_name: profileRes.data.full_name,
            avatar_url: profileRes.data.avatar_url,
            roles: rolesRes.data?.map(r => r.role) || []
          });
        }
      } catch (error) {
        console.error('Error fetching inviter:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchInviter();
  }, [userId]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'manager': return 'bg-primary text-primary-foreground';
      case 'agent': return 'bg-amber-500 text-white';
      case 'supporter': return 'bg-success text-success-foreground';
      case 'landlord': return 'bg-blue-500 text-white';
      case 'tenant': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const handleStartChat = async () => {
    if (!user || !userId) return;

    // Don't allow chatting with yourself
    if (user.id === userId) {
      toast.error("You can't start a conversation with yourself");
      return;
    }

    setStarting(true);
    try {
      const conversationId = await startConversation(userId);
      if (conversationId) {
        navigate(`/chat?conversation=${conversationId}`);
      } else {
        toast.error('Failed to start conversation');
      }
    } catch (error) {
      console.error('Error starting chat:', error);
      toast.error('Failed to start conversation');
    } finally {
      setStarting(false);
    }
  };

  const handleLogin = () => {
    // Save the invite URL to redirect back after login
    sessionStorage.setItem('chatInviteRedirect', window.location.pathname);
    navigate('/auth');
  };

  const handleSignUp = () => {
    sessionStorage.setItem('chatInviteRedirect', window.location.pathname);
    navigate('/auth?mode=signup');
  };

  // Check for redirect after login
  useEffect(() => {
    if (user && !authLoading) {
      const redirectPath = sessionStorage.getItem('chatInviteRedirect');
      if (redirectPath === window.location.pathname) {
        sessionStorage.removeItem('chatInviteRedirect');
        // Auto-start conversation after login
        if (userId && user.id !== userId) {
          handleStartChat();
        }
      }
    }
  }, [user, authLoading, userId]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Skeleton className="h-20 w-20 rounded-full mx-auto mb-4" />
            <Skeleton className="h-6 w-40 mx-auto mb-2" />
            <Skeleton className="h-4 w-60 mx-auto" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!inviter) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto p-4 rounded-full bg-muted mb-4">
              <MessageCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>User Not Found</CardTitle>
            <CardDescription>
              This chat invitation link is invalid or the user no longer exists.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Avatar className="h-20 w-20 mx-auto mb-4">
            <AvatarImage src={inviter.avatar_url || undefined} />
            <AvatarFallback className="text-2xl">{getInitials(inviter.full_name)}</AvatarFallback>
          </Avatar>
          <CardTitle className="text-xl">{inviter.full_name}</CardTitle>
          {inviter.roles.length > 0 && (
            <div className="flex gap-1 justify-center mt-2">
              {inviter.roles.map(role => (
                <Badge key={role} className={getRoleBadgeColor(role)}>
                  {role}
                </Badge>
              ))}
            </div>
          )}
          <CardDescription className="mt-3">
            {user
              ? `Start a conversation with ${inviter.full_name.split(' ')[0]}`
              : `${inviter.full_name.split(' ')[0]} invited you to chat on Welile`
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {user ? (
            user.id === userId ? (
              <div className="text-center text-muted-foreground text-sm">
                This is your own chat invite link
              </div>
            ) : (
              <Button 
                onClick={handleStartChat} 
                className="w-full gap-2" 
                size="lg"
                disabled={starting}
              >
                <MessageCircle className="h-5 w-5" />
                {starting ? 'Starting chat...' : 'Start Chatting'}
              </Button>
            )
          ) : (
            <>
              <Button onClick={handleLogin} className="w-full gap-2" size="lg">
                <LogIn className="h-5 w-5" />
                Log In to Chat
              </Button>
              <Button onClick={handleSignUp} variant="outline" className="w-full gap-2" size="lg">
                <UserPlus className="h-5 w-5" />
                Create Account
              </Button>
            </>
          )}

          <div className="text-center">
            <Button 
              variant="link" 
              onClick={() => navigate('/')} 
              className="text-muted-foreground"
            >
              Learn more about Welile
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

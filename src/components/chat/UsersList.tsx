import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import { usePresenceContext } from '@/hooks/usePresence';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Users, Search, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import OnlineIndicator from './OnlineIndicator';

interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  roles: string[];
}

interface UsersListProps {
  onStartConversation: (conversationId: string) => void;
}

const fetchAllUsers = async (userId: string): Promise<UserProfile[]> => {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .neq('id', userId)
    .order('full_name', { ascending: true });

  if (error || !profiles || profiles.length === 0) return [];

  const userIds = profiles.map(p => p.id);
  const { data: rolesData } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('user_id', userIds);

  const rolesMap = new Map<string, string[]>();
  rolesData?.forEach(r => {
    const existing = rolesMap.get(r.user_id) || [];
    rolesMap.set(r.user_id, [...existing, r.role]);
  });

  return profiles.map(p => ({
    id: p.id,
    full_name: p.full_name,
    avatar_url: p.avatar_url,
    roles: rolesMap.get(p.id) || []
  }));
};

export default function UsersList({ onStartConversation }: UsersListProps) {
  const { user } = useAuth();
  const { startConversation } = useChat();
  const { isOnline } = usePresenceContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [startingChat, setStartingChat] = useState<string | null>(null);

  const { data: users = [], isLoading: loading } = useQuery({
    queryKey: ['all-users-list', user?.id],
    queryFn: () => fetchAllUsers(user!.id),
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

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

  const handleUserClick = async (userId: string) => {
    setStartingChat(userId);
    const conversationId = await startConversation(userId);
    
    if (conversationId) {
      onStartConversation(conversationId);
    } else {
      toast.error('Failed to start conversation');
    }
    setStartingChat(null);
  };

  const filteredUsers = users.filter(u =>
    u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.roles.some(r => r.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Users list */}
      <ScrollArea className="flex-1">
        {filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="p-4 rounded-full bg-muted mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">No users found</h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'Try a different search term' : 'No other users in the app yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredUsers.map((userProfile) => (
              <button
                key={userProfile.id}
                onClick={() => handleUserClick(userProfile.id)}
                disabled={startingChat === userProfile.id}
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
              >
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={userProfile.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {getInitials(userProfile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <OnlineIndicator 
                    isOnline={isOnline(userProfile.id)} 
                    size="sm"
                    className="absolute bottom-0 right-0"
                  />
                </div>
                
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm block truncate">
                    {userProfile.full_name}
                  </span>
                  {userProfile.roles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {userProfile.roles.slice(0, 2).map(role => (
                        <Badge 
                          key={role} 
                          className={`text-[10px] h-4 px-1.5 ${getRoleBadgeColor(role)}`}
                        >
                          {role}
                        </Badge>
                      ))}
                      {userProfile.roles.length > 2 && (
                        <Badge className="text-[10px] h-4 px-1.5 bg-muted text-muted-foreground">
                          +{userProfile.roles.length - 2}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

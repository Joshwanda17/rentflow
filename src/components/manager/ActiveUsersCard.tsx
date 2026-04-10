import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Wifi, WifiOff } from 'lucide-react';
import { motion } from 'framer-motion';
import OnlineIndicator from '@/components/chat/OnlineIndicator';
import BoringAvatar from 'boring-avatars';
import { MARBLE_COLORS } from '@/components/UserAvatar';

interface ActiveUser {
  id: string;
  full_name: string;
  avatar_url: string | null;
  roles: string[];
}

interface ActiveUsersCardProps {
  activeUsers: ActiveUser[];
  totalUsers: number;
  onUserClick?: (userId: string) => void;
}

const roleColors: Record<string, string> = {
  tenant: 'text-blue-600 dark:text-blue-400',
  agent: 'text-amber-600 dark:text-amber-400',
  supporter: 'text-emerald-600 dark:text-emerald-400',
  landlord: 'text-purple-600 dark:text-purple-400',
  manager: 'text-rose-600 dark:text-rose-400',
};

export function ActiveUsersCard({ activeUsers, totalUsers, onUserClick }: ActiveUsersCardProps) {
  const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  };

  const activeCount = activeUsers.length;

  return (
    <Card className="border-2 border-success/30 bg-gradient-to-br from-success/5 via-background to-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-success/20">
              <Wifi className="h-5 w-5 text-success" />
            </div>
            <div>
              <h3 className="font-bold text-base">Active Now</h3>
              <p className="text-xs text-muted-foreground">Users currently online</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm font-semibold bg-success/10 border-success/30 text-success">
              <span className="relative flex h-2 w-2 mr-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
              {activeCount}
            </Badge>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              / {totalUsers}
            </Badge>
          </div>
        </div>

        {activeCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 rounded-full bg-muted/50 mb-3">
              <WifiOff className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No users currently online</p>
          </div>
        ) : (
          <ScrollArea className="h-[180px]">
            <div className="space-y-2">
              {activeUsers.map((user, index) => (
                <motion.button
                  key={user.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => onUserClick?.(user.id)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10 border-2 border-background">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                        <BoringAvatar size={40} name={user.full_name} variant="marble" colors={MARBLE_COLORS} />
                      </AvatarFallback>
                    </Avatar>
                    <OnlineIndicator 
                      isOnline={true} 
                      size="sm" 
                      className="absolute bottom-0 right-0"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate flex items-center gap-1">{user.full_name}</p>
                    <div className="flex gap-1">
                      {user.roles.slice(0, 2).map((role) => (
                        <span 
                          key={role} 
                          className={`text-xs font-medium capitalize ${roleColors[role] || 'text-muted-foreground'}`}
                        >
                          {role}
                        </span>
                      ))}
                      {user.roles.length > 2 && (
                        <span className="text-xs text-muted-foreground">+{user.roles.length - 2}</span>
                      )}
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

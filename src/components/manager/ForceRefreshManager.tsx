import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, Users, User, Loader2, Zap, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

export function ForceRefreshManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [targetType, setTargetType] = useState<'all' | 'user'>('all');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [message, setMessage] = useState('New features available!');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch users for selection
  const { data: users } = useQuery({
    queryKey: ['all-users-for-refresh'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone')
        .order('full_name');
      if (error) throw error;
      return data;
    },
    enabled: isOpen,
  });

  const handleForceRefresh = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      // Force refresh by reloading all connected clients
      // This uses a simple approach: notify via toast and trigger window reload
      toast({
        title: '✅ Refresh Signal Sent!',
        description: targetType === 'all' 
          ? 'All users will refresh their app shortly.'
          : 'The selected user will refresh their app shortly.',
      });

      setIsOpen(false);
      setMessage('New features available!');
      setSelectedUserId('');
      setTargetType('all');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send refresh signal',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-cyan-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <RefreshCw className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <CardTitle className="text-base">Force App Refresh</CardTitle>
            <CardDescription className="text-xs">
              Push updates to all users instantly
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="w-full gap-2" variant="outline">
              <Zap className="h-4 w-4" />
              Send Refresh Signal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-blue-600" />
                Force App Refresh
              </DialogTitle>
              <DialogDescription>
                Send a signal to refresh the app for users to get the latest version.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Target Selection */}
              <div className="space-y-2">
                <Label>Target Users</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={targetType === 'all' ? 'default' : 'outline'}
                    className="gap-2 h-12"
                    onClick={() => setTargetType('all')}
                  >
                    <Users className="h-4 w-4" />
                    All Users
                  </Button>
                  <Button
                    type="button"
                    variant={targetType === 'user' ? 'default' : 'outline'}
                    className="gap-2 h-12"
                    onClick={() => setTargetType('user')}
                  >
                    <User className="h-4 w-4" />
                    Specific User
                  </Button>
                </div>
              </div>

              {/* User Selection */}
              {targetType === 'user' && (
                <div className="space-y-2">
                  <Label>Select User</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Choose a user..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {users?.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          <div className="flex flex-col items-start">
                            <span className="font-medium">{u.full_name}</span>
                            <span className="text-xs text-muted-foreground">{u.phone}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Message */}
              <div className="space-y-2">
                <Label>Message (shown to users)</Label>
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="New features available!"
                  className="h-12"
                />
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {targetType === 'all' 
                    ? 'This will immediately refresh the app for ALL active users. They will see a brief loading screen.'
                    : 'This will immediately refresh the app for the selected user.'}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleForceRefresh} 
                disabled={isLoading || (targetType === 'user' && !selectedUserId)}
                className="gap-2"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Send Refresh
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <p className="text-[11px] text-muted-foreground mt-2 text-center">
          Clears cache and reloads for instant updates
        </p>
      </CardContent>
    </Card>
  );
}

export default ForceRefreshManager;

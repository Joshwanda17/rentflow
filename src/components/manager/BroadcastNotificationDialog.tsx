import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Megaphone, Send, Loader2, Users, AlertCircle, Info, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BroadcastNotificationDialogProps {
  trigger?: React.ReactNode;
}

const notificationTypes = [
  { value: 'info', label: 'Information', icon: Info, color: 'text-blue-500' },
  { value: 'success', label: 'Success', icon: CheckCircle, color: 'text-green-500' },
  { value: 'warning', label: 'Warning', icon: AlertTriangle, color: 'text-yellow-500' },
  { value: 'error', label: 'Important', icon: AlertCircle, color: 'text-red-500' },
];

export default function BroadcastNotificationDialog({ trigger }: BroadcastNotificationDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('info');
  const [sending, setSending] = useState(false);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  const fetchUserCount = async () => {
    setLoadingCount(true);
    try {
      const { count, error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });

      if (error) throw error;
      setUserCount(count);
    } catch (error) {
      console.error('Error fetching user count:', error);
    } finally {
      setLoadingCount(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      fetchUserCount();
    } else {
      // Reset form when closing
      setTitle('');
      setMessage('');
      setType('info');
    }
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error('Please fill in both title and message');
      return;
    }

    setSending(true);
    try {
      // Fetch all user IDs
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id');

      if (profilesError) throw profilesError;

      if (!profiles || profiles.length === 0) {
        toast.error('No users found to notify');
        setSending(false);
        return;
      }

      // Create notifications for all users in batches
      const batchSize = 100;
      const userIds = profiles.map(p => p.id);
      let successCount = 0;

      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        const notifications = batch.map(userId => ({
          user_id: userId,
          title: title.trim(),
          message: message.trim(),
          type,
          read: false
        }));

        const { error } = await supabase
          .from('notifications')
          .insert(notifications);

        if (error) {
          console.error('Batch insert error:', error);
        } else {
          successCount += batch.length;
        }
      }

      // Also send push notifications to all devices
      try {
        await supabase.functions.invoke('send-push-notification', {
          body: {
            all: true,
            payload: {
              title: title.trim(),
              body: message.trim(),
              type,
              icon: '/welile-logo.png',
              url: '/dashboard'
            }
          }
        });
      } catch (pushError) {
        console.log('Push notification send attempted:', pushError);
        // Don't fail the whole operation if push fails
      }

      toast.success(`Notification broadcasted to ${successCount} users!`, {
        icon: <Megaphone className="h-4 w-4" />,
      });
      
      setTitle('');
      setMessage('');
      setType('info');
      setOpen(false);
    } catch (error) {
      console.error('Error broadcasting notifications:', error);
      toast.error('Failed to broadcast notification');
    } finally {
      setSending(false);
    }
  };

  const selectedType = notificationTypes.find(t => t.value === type);
  const TypeIcon = selectedType?.icon || Info;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Megaphone className="h-4 w-4" />
            Broadcast to All
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Broadcast Notification
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {loadingCount ? (
              <span>Loading user count...</span>
            ) : (
              <span>Send to <Badge variant="secondary">{userCount?.toLocaleString() || 0}</Badge> users</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Notification Type */}
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {notificationTypes.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex items-center gap-2">
                      <t.icon className={`h-4 w-4 ${t.color}`} />
                      {t.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Notification title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground text-right">
              {title.length}/100
            </p>
          </div>
          
          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              placeholder="Write your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length}/500
            </p>
          </div>

          {/* Preview */}
          {(title || message) && (
            <div className="p-3 rounded-lg border bg-muted/30">
              <p className="text-xs text-muted-foreground mb-2">Preview:</p>
              <div className="flex items-start gap-2">
                <TypeIcon className={`h-4 w-4 mt-0.5 ${selectedType?.color}`} />
                <div>
                  <p className="font-medium text-sm">{title || 'Title'}</p>
                  <p className="text-xs text-muted-foreground">{message || 'Message'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={sending || !title.trim() || !message.trim()}
            className="gap-2"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Broadcasting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send to All Users
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

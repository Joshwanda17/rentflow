import { useState, useEffect } from 'react';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Clock, Share2, Send, Loader2, ChevronRight, UserPlus, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface PendingInvite {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  temp_password: string;
  activation_token: string;
  role: string;
  created_at: string;
}

const roleConfig: Record<string, { label: string; emoji: string }> = {
  tenant: { label: 'Tenant', emoji: '🏠' },
  landlord: { label: 'Landlord', emoji: '🏢' },
  agent: { label: 'Agent', emoji: '💼' },
  supporter: { label: 'Supporter', emoji: '💰' },
  manager: { label: 'Manager', emoji: '👑' },
};

interface PendingInvitesWidgetProps {
  onViewAll?: () => void;
  /** When true, renders content without Card wrapper for use in collapsible sections */
  minimal?: boolean;
}

export function PendingInvitesWidget({ onViewAll, minimal = false }: PendingInvitesWidgetProps) {
  const { toast } = useToast();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [bulkResending, setBulkResending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  const fetchPendingInvites = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('supporter_invites')
      .select('id, email, full_name, phone, temp_password, activation_token, role, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!error && data) {
      setInvites(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPendingInvites();
  }, []);

  const getShareLink = (token: string) => {
    return `${getPublicOrigin()}/join?t=${token}`;
  };

  const generateNewPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleResendInvite = async (invite: PendingInvite) => {
    setResendingId(invite.id);
    
    try {
      const newPassword = generateNewPassword();
      
      const { error } = await supabase
        .from('supporter_invites')
        .update({ temp_password: newPassword })
        .eq('id', invite.id);

      if (error) throw error;

      // Update local state
      setInvites(prev => prev.map(inv => 
        inv.id === invite.id ? { ...inv, temp_password: newPassword } : inv
      ));

      // Open WhatsApp with new password
      const roleInfo = roleConfig[invite.role] || { label: 'User', emoji: '👤' };
      const message = `${roleInfo.emoji} Welcome to Welile, ${invite.full_name}!

You've been invited to join as a ${roleInfo.label}!

🔐 Your password: ${newPassword}

👉 Activate your account here:
${getShareLink(invite.activation_token)}

Just click the link and enter your password to get started!`;
      
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
      
      toast({ 
        title: '✅ Invite Resent', 
        description: `WhatsApp opened for ${invite.full_name}.` 
      });
    } catch (error: any) {
      toast({ 
        title: 'Resend Failed', 
        description: error.message || 'Failed to resend invite', 
        variant: 'destructive' 
      });
    } finally {
      setResendingId(null);
    }
  };

  const handleBulkResend = async () => {
    if (invites.length === 0) return;
    
    setBulkResending(true);
    setBulkProgress({ current: 0, total: invites.length });
    let successCount = 0;
    
    try {
      for (let i = 0; i < invites.length; i++) {
        const invite = invites[i];
        setBulkProgress({ current: i + 1, total: invites.length });
        
        const newPassword = generateNewPassword();
        
        const { error } = await supabase
          .from('supporter_invites')
          .update({ temp_password: newPassword })
          .eq('id', invite.id);

        if (!error) {
          const roleInfo = roleConfig[invite.role] || { label: 'User', emoji: '👤' };
          const message = `${roleInfo.emoji} Welcome to Welile, ${invite.full_name}!

You've been invited to join as a ${roleInfo.label}!

🔐 Your password: ${newPassword}

👉 Activate your account here:
${getShareLink(invite.activation_token)}

Just click the link and enter your password to get started!`;
          
          window.open(`https://wa.me/${invite.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
          successCount++;
          
          // Small delay between opening tabs
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      await fetchPendingInvites();
      
      toast({ 
        title: '✅ Bulk Resend Complete', 
        description: `Opened WhatsApp for ${successCount} of ${invites.length} invites.` 
      });
    } catch (error: any) {
      toast({ 
        title: 'Bulk Resend Failed', 
        description: error.message || 'Some invites could not be resent', 
        variant: 'destructive' 
      });
    } finally {
      setBulkResending(false);
      setBulkProgress({ current: 0, total: 0 });
    }
  };

  // Content for both minimal and full modes
  const content = (
    <div className="space-y-2">
      {invites.map(invite => (
        <div 
          key={invite.id} 
          className="flex items-center justify-between p-3 rounded-lg bg-background/80 border border-border/50"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="text-xl">{(roleConfig[invite.role] || { emoji: '👤' }).emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{invite.full_name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {(roleConfig[invite.role] || { label: 'User' }).label}
                </Badge>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(invite.created_at), { addSuffix: true })}</span>
                <span>•</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-600 border-green-500/30">
                  ∞ Never expires
                </Badge>
              </div>
            </div>
          </div>
          
          <Button 
            variant="default" 
            size="sm" 
            className="h-8 gap-1 text-xs shrink-0"
            onClick={() => handleResendInvite(invite)}
            disabled={resendingId === invite.id}
          >
            {resendingId === invite.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Resend
          </Button>
        </div>
      ))}

      {onViewAll && (
        <Button 
          variant="ghost" 
          className="w-full h-9 text-sm gap-1 mt-2"
          onClick={onViewAll}
        >
          View All Invites
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  if (loading) {
    if (minimal) {
      return (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      );
    }
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (invites.length === 0) {
    if (minimal) {
      return (
        <div className="text-center py-6 text-muted-foreground text-sm">
          No pending activations
        </div>
      );
    }
    return null; // Don't show widget if no pending invites
  }

  // Minimal mode - just the content without Card wrapper
  if (minimal) {
    return content;
  }

  // Full mode - with Card wrapper
  return (
    <Card className="border-warning/30 bg-gradient-to-br from-warning/5 to-warning/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-warning/20">
              <Clock className="h-4 w-4 text-warning" />
            </div>
            Pending Activations
            <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30 ml-1">
              {invites.length}
            </Badge>
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 gap-1 text-xs"
            onClick={fetchPendingInvites}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 gap-1 text-xs"
                disabled={bulkResending || invites.length === 0}
              >
                {bulkResending ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {bulkProgress.current}/{bulkProgress.total}
                  </>
                ) : (
                  <>
                    <Send className="h-3 w-3" />
                    Resend All
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Resend All Invites?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will generate new passwords and open WhatsApp for all {invites.length} pending invite{invites.length !== 1 ? 's' : ''}. 
                  Each invite will open in a new tab.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleBulkResend}>
                  Yes, Resend All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <p className="text-xs text-muted-foreground">
          Users who haven't activated their accounts yet
        </p>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
}

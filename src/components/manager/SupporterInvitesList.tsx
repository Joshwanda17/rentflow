import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Users, Clock, CheckCircle, Share2, Copy, Check, RefreshCw, ClipboardList, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDistanceToNow } from 'date-fns';

interface SupporterInvite {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  temp_password: string;
  activation_token: string;
  status: string;
  role: string;
  created_at: string;
  activated_at: string | null;
}

const roleConfig: Record<string, { label: string; emoji: string; color: string }> = {
  tenant: { label: 'Tenant', emoji: '🏠', color: 'text-blue-500' },
  agent: { label: 'Agent', emoji: '💼', color: 'text-amber-500' },
  supporter: { label: 'Supporter', emoji: '💰', color: 'text-rose-500' },
};

export function SupporterInvitesList() {
  const { toast } = useToast();
  const [invites, setInvites] = useState<SupporterInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const fetchInvites = async () => {
    setLoading(true);
    let query = supabase
      .from('supporter_invites')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (roleFilter !== 'all') {
      query = query.eq('role', roleFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching invites:', error);
    } else {
      setInvites(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInvites();
  }, [roleFilter]);

  const getShareLink = (token: string) => {
    return `${window.location.origin}/activate-supporter?token=${token}`;
  };

  const handleCopyLink = async (invite: SupporterInvite) => {
    const link = getShareLink(invite.activation_token);
    await navigator.clipboard.writeText(link);
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: 'Link copied!' });
  };

  const handleCopyAll = async (invite: SupporterInvite) => {
    const text = `Activation Link: ${getShareLink(invite.activation_token)}
Password: ${invite.temp_password}`;
    await navigator.clipboard.writeText(text);
    setCopiedId(`all-${invite.id}`);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: 'Link & password copied!' });
  };

  const handleShareWhatsApp = (invite: SupporterInvite) => {
    const roleInfo = roleConfig[invite.role] || roleConfig.supporter;
    const message = `${roleInfo.emoji} Welcome to Welile, ${invite.full_name}!

You've been invited to join as a ${roleInfo.label}!

🔐 Your password: ${invite.temp_password}

👉 Activate your account here:
${getShareLink(invite.activation_token)}

Just click the link and enter your password to get started!`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    toast({ title: 'Opening WhatsApp...', description: 'Share the activation link with the user.' });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            User Invites
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (invites.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            User Invites
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No invites yet. Create one using the button above!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            User Invites
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="tenant">🏠 Tenant</SelectItem>
                <SelectItem value="agent">💼 Agent</SelectItem>
                <SelectItem value="supporter">💰 Supporter</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchInvites}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {invites.map(invite => (
          <div 
            key={invite.id} 
            className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg">{(roleConfig[invite.role] || roleConfig.supporter).emoji}</span>
                <p className="font-medium text-sm truncate">{invite.full_name}</p>
                <Badge variant="secondary" className="text-xs">
                  {(roleConfig[invite.role] || roleConfig.supporter).label}
                </Badge>
                <Badge 
                  variant="outline" 
                  className={invite.status === 'activated' 
                    ? 'bg-success/10 text-success border-success/30' 
                    : 'bg-warning/10 text-warning border-warning/30'
                  }
                >
                  {invite.status === 'activated' ? (
                    <><CheckCircle className="h-3 w-3 mr-1" /> Activated</>
                  ) : (
                    <><Clock className="h-3 w-3 mr-1" /> Pending</>
                  )}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">{invite.email}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(invite.created_at), { addSuffix: true })}
              </p>
            </div>
            
            {invite.status === 'pending' && (
              <div className="flex gap-1 ml-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => handleCopyAll(invite)}
                  title="Copy link & password"
                >
                  {copiedId === `all-${invite.id}` ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <ClipboardList className="h-4 w-4" />
                  )}
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => handleCopyLink(invite)}
                  title="Copy link only"
                >
                  {copiedId === invite.id ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-green-600"
                  onClick={() => handleShareWhatsApp(invite)}
                  title="Share on WhatsApp"
                >
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

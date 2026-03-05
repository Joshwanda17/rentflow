import { useState, useEffect } from 'react';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Users, Clock, CheckCircle, Share2, Copy, Check, RefreshCw, ClipboardList, Filter, ChevronLeft, ChevronRight, Search, Send, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
  landlord: { label: 'Landlord', emoji: '🏢', color: 'text-emerald-500' },
  agent: { label: 'Agent', emoji: '💼', color: 'text-amber-500' },
  supporter: { label: 'Supporter', emoji: '💰', color: 'text-rose-500' },
};

export function SupporterInvitesList() {
  const { toast } = useToast();
  const [invites, setInvites] = useState<SupporterInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 10;

  const fetchInvites = async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('supporter_invites')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (roleFilter !== 'all') {
      query = query.eq('role', roleFilter);
    }

    if (searchQuery.trim()) {
      query = query.or(`full_name.ilike.%${searchQuery.trim()}%,email.ilike.%${searchQuery.trim()}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching invites:', error);
    } else {
      setInvites(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchInvites();
    }, searchQuery ? 300 : 0);
    return () => clearTimeout(debounce);
  }, [roleFilter, page, searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [roleFilter, searchQuery]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getShareLink = (token: string, password?: string) => {
    const encodedToken = encodeURIComponent(token);
    if (!password) return `${getPublicOrigin()}/activate-supporter?token=${encodedToken}`;
    return `${getPublicOrigin()}/activate-supporter?token=${encodedToken}&password=${encodeURIComponent(password)}`;
  };

  const handleCopyLink = async (invite: SupporterInvite) => {
    const link = getShareLink(invite.activation_token, invite.temp_password);
    await navigator.clipboard.writeText(link);
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: 'Link copied!' });
  };

  const handleCopyAll = async (invite: SupporterInvite) => {
    const text = `Activation Link: ${getShareLink(invite.activation_token, invite.temp_password)}\nPassword: ${invite.temp_password}`;
    await navigator.clipboard.writeText(text);
    setCopiedId(`all-${invite.id}`);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: 'Link & password copied!' });
  };

  const handleShareWhatsApp = (invite: SupporterInvite, customPassword?: string) => {
    const roleInfo = roleConfig[invite.role] || roleConfig.supporter;
    const passwordToUse = customPassword || invite.temp_password;
    const message = `${roleInfo.emoji} Welcome to Welile, ${invite.full_name}!

You've been invited to join as a ${roleInfo.label}!

🔐 Your password: ${passwordToUse}

👉 Activate your account here:
${getShareLink(invite.activation_token, passwordToUse)}

Just click the link and enter your password to get started!`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    toast({ title: 'Opening WhatsApp...', description: 'Share the activation link with the user.' });
  };

  const generateNewPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleResendInvite = async (invite: SupporterInvite) => {
    setResendingId(invite.id);
    
    try {
      // Generate new password
      const newPassword = generateNewPassword();
      
      // Update the invite with the new password
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
      handleShareWhatsApp({ ...invite, temp_password: newPassword });
      
      toast({ 
        title: '✅ Invite Resent', 
        description: `New password generated and WhatsApp opened for ${invite.full_name}.` 
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
                <SelectItem value="landlord">🏢 Landlord</SelectItem>
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
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1 text-warning">
            <Clock className="h-3 w-3" />
            {invites.filter(i => i.status === 'pending').length} pending
          </span>
          <span className="flex items-center gap-1 text-success">
            <CheckCircle className="h-3 w-3" />
            {invites.filter(i => i.status === 'activated').length} activated
          </span>
        </div>
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
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(invite.created_at), { addSuffix: true })}
                </p>
                {invite.status === 'pending' && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-green-500/10 text-green-600 border-green-500/30">
                    ∞ Never expires
                  </Badge>
                )}
              </div>
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
                <Button 
                  variant="default" 
                  size="sm" 
                  className="h-8 gap-1 text-xs"
                  onClick={() => handleResendInvite(invite)}
                  disabled={resendingId === invite.id}
                  title="Resend with new password"
                >
                  {resendingId === invite.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                  Resend
                </Button>
              </div>
            )}
          </div>
        ))}
        
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} ({totalCount} total)
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

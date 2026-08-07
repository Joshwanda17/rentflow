import { useEffect, useState } from 'react';
import { Copy, Share2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface PartnerLeadInvite {
  code: string;
  uses_count: number;
  expires_at: string | null;
  revoked: boolean;
}

export default function MyProxyInviteLink() {
  const [invite, setInvite] = useState<PartnerLeadInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fetchInvite = async () => {
    try {
      const { data, error } = await supabase.rpc('my_partner_lead_invite');
      if (error) {
        toast.error(error.message);
        return;
      }
      const rows = (data ?? []) as unknown as PartnerLeadInvite[];
      setInvite(rows[0] ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load invite link');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchInvite();
  }, []);

  const handleCopy = async () => {
    if (!invite) return;
    const link = `${window.location.origin}/pa/${invite.code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Invite link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const handleWhatsApp = () => {
    if (!invite) return;
    const link = `${window.location.origin}/pa/${invite.code}`;
    const text = encodeURIComponent(
      `Join Welile as my proxy agent using this link: ${link}`,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const handleRevoke = async () => {
    if (!invite) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('revoke_partner_lead_invite');
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Invite link revoked');
      await fetchInvite();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revoke invite');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !invite) return null;

  const link = `${window.location.origin}/pa/${invite.code}`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">My proxy agent invite link</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="rounded-md border border-border bg-muted/40 p-2">
          <p className="select-all break-all text-sm font-medium text-foreground">
            {link}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handleCopy}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy
          </Button>
          <Button size="sm" variant="outline" onClick={handleWhatsApp}>
            <Share2 className="mr-1.5 h-3.5 w-3.5" />
            WhatsApp
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={busy}>
                Revoke
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke invite link?</AlertDialogTitle>
                <AlertDialogDescription>
                  Existing attachments stay in place. New sign-ups through this
                  link will stop.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRevoke} disabled={busy}>
                  Revoke
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <p className="text-xs text-muted-foreground">
          {invite.uses_count} proxy agent{invite.uses_count === 1 ? '' : 's'} joined
          through this link
        </p>
      </CardContent>
    </Card>
  );
}

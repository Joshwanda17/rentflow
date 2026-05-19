import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Loader2, ArchiveRestore, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface ArchivedRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

export default function ArchivedAccountsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<ArchivedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<ArchivedRow | null>(null);
  const [overrideEmail, setOverrideEmail] = useState('');
  const [overridePhone, setOverridePhone] = useState('');
  const [reason, setReason] = useState('');
  const [restoring, setRestoring] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, email, created_at')
      .ilike('full_name', '[ARCHIVED]%')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      toast({ title: 'Failed to load archived accounts', description: error.message, variant: 'destructive' });
    } else {
      setRows((data as ArchivedRow[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.full_name || '').toLowerCase().includes(q) ||
      (r.phone || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const openRestore = (row: ArchivedRow) => {
    setActive(row);
    setOverrideEmail('');
    setOverridePhone('');
    setReason('');
  };

  const submitRestore = async () => {
    if (!active) return;
    if (reason.trim().length < 10) {
      toast({ title: 'Reason too short', description: 'Provide at least 10 characters explaining the restore.', variant: 'destructive' });
      return;
    }
    setRestoring(true);
    try {
      const { data, error } = await supabase.functions.invoke('restore-archived-account', {
        body: {
          user_id: active.id,
          reason: reason.trim(),
          email: overrideEmail.trim() || undefined,
          phone: overridePhone.trim() || undefined,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({
        title: 'Account restored',
        description: `${(data as any)?.restored_name || 'User'} can now sign in again.`,
      });
      setActive(null);
      await load();
    } catch (e: any) {
      toast({ title: 'Restore failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Archived Accounts</h1>
            <p className="text-sm text-muted-foreground">
              Restore soft-deleted accounts. This clears the deletion timestamp and re-attaches the original email/phone so the user can sign in again.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">{loading ? 'Loading…' : `${filtered.length} archived account${filtered.length === 1 ? '' : 's'}`}</CardTitle>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search name, phone, email, id…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No archived accounts match.</p>
            ) : (
              <div className="divide-y">
                {filtered.map(row => (
                  <div key={row.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{row.full_name || '—'}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {row.phone || '—'} · {row.email || '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{row.id}</p>
                    </div>
                    <Button size="sm" onClick={() => openRestore(row)}>
                      <ArchiveRestore className="h-4 w-4 mr-1.5" />
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArchiveRestore className="h-5 w-5" />
              Restore archived account
            </DialogTitle>
            <DialogDescription>
              This will clear the deletion flag on{' '}
              <strong>{active?.full_name?.replace(/^\[ARCHIVED\]\s*/i, '') || 'the account'}</strong>{' '}
              and re-attach the email/phone so the user can sign in again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-muted rounded-md p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">Original phone:</span> {active?.phone || <Badge variant="outline">none</Badge>}</div>
              <div><span className="text-muted-foreground">Original email:</span> {active?.email || <Badge variant="outline">none</Badge>}</div>
            </div>

            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>If the original email or phone is now used by another live account, the restore will fail. Use the override fields below to assign new ones in that case.</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ov-email">Override email (optional)</Label>
                <Input id="ov-email" placeholder="leave blank to use original" value={overrideEmail} onChange={(e) => setOverrideEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ov-phone">Override phone (optional)</Label>
                <Input id="ov-phone" placeholder="leave blank to use original" value={overridePhone} onChange={(e) => setOverridePhone(e.target.value)} />
              </div>
            </div>

            <div>
              <Label htmlFor="reason">Reason (min 10 chars, audited)</Label>
              <Textarea
                id="reason"
                placeholder="Why is this account being restored?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)} disabled={restoring}>Cancel</Button>
            <Button onClick={submitRestore} disabled={restoring || reason.trim().length < 10}>
              {restoring ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArchiveRestore className="h-4 w-4 mr-2" />}
              Restore Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
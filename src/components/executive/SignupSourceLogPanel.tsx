import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Shield, ShieldAlert, ShieldOff, UserCheck, Ban } from 'lucide-react';
import { format } from 'date-fns';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type Breakdown = {
  path: string;
  utm_source: string;
  total_attempts: number;
  allowed: number;
  blocked_ip: number;
  blocked_device: number;
  blocked_verification: number;
  successful_signups: number;
};

type AttemptRow = {
  id: string;
  ip: string | null;
  device_fp: string | null;
  path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  status: string;
  reason: string | null;
  actor_role: string | null;
  user_agent: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  allowed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  blocked_ip: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  blocked_device: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  blocked_verification: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

export function SignupSourceLogPanel() {
  const [days, setDays] = useState<number>(7);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [blockIp, setBlockIp] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const qc = useQueryClient();

  const blockedIps = useQuery({
    queryKey: ['blocked-signup-ips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blocked_signup_ips' as any)
        .select('ip, reason, blocked_by_role, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ ip: string; reason: string; blocked_by_role: string | null; created_at: string }>;
    },
    staleTime: 60_000,
  });

  const blockedSet = new Set((blockedIps.data ?? []).map((b) => b.ip));

  const blockMutation = useMutation({
    mutationFn: async ({ ip, reason }: { ip: string; reason: string }) => {
      const { error } = await (supabase as any).rpc('block_signup_ip', { p_ip: ip, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('IP blocked from future signups');
      setBlockIp(null);
      setBlockReason('');
      qc.invalidateQueries({ queryKey: ['blocked-signup-ips'] });
      qc.invalidateQueries({ queryKey: ['signup-attempt-log'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to block IP'),
  });

  const unblockMutation = useMutation({
    mutationFn: async (ip: string) => {
      const { error } = await (supabase as any).rpc('unblock_signup_ip', { p_ip: ip });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('IP unblocked');
      qc.invalidateQueries({ queryKey: ['blocked-signup-ips'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to unblock IP'),
  });

  const breakdown = useQuery({
    queryKey: ['signup-source-breakdown', days],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_signup_source_breakdown', { p_days: days });
      if (error) throw error;
      return (data ?? []) as Breakdown[];
    },
    staleTime: 60_000,
  });

  const log = useQuery({
    queryKey: ['signup-attempt-log', days, statusFilter],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_signup_attempt_log', {
        p_days: days,
        p_limit: 300,
        p_status: statusFilter === 'all' ? null : statusFilter,
      });
      if (error) throw error;
      return (data ?? []) as AttemptRow[];
    },
    staleTime: 30_000,
  });

  const totals = (breakdown.data ?? []).reduce(
    (acc, r) => ({
      total: acc.total + Number(r.total_attempts || 0),
      allowed: acc.allowed + Number(r.allowed || 0),
      blocked: acc.blocked + Number(r.blocked_ip || 0) + Number(r.blocked_device || 0) + Number(r.blocked_verification || 0),
      signups: acc.signups + Number(r.successful_signups || 0),
    }),
    { total: 0, allowed: 0, blocked: 0, signups: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Signup Sources & Anti-Bot Log</h2>
          <p className="text-sm text-muted-foreground">
            Every self-service signup attempt across <code>/auth</code>, <code>/funder-onboarding</code>, campaign links, etc.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24h</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { breakdown.refetch(); log.refetch(); }}
            disabled={breakdown.isFetching || log.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${breakdown.isFetching || log.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total attempts</div>
            <div className="text-2xl font-semibold">{totals.total.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" /> Allowed</div>
            <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{totals.allowed.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5" /> Blocked</div>
            <div className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{totals.blocked.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> Successful signups</div>
            <div className="text-2xl font-semibold">{totals.signups.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">By path & UTM source</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Path</TableHead>
                <TableHead>UTM source</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Allowed</TableHead>
                <TableHead className="text-right">Blocked IP</TableHead>
                <TableHead className="text-right">Blocked Device</TableHead>
                <TableHead className="text-right">Blocked OTP</TableHead>
                <TableHead className="text-right">Signed up</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(breakdown.data ?? []).map((r, i) => (
                <TableRow key={`${r.path}-${r.utm_source}-${i}`}>
                  <TableCell className="font-mono text-xs">{r.path}</TableCell>
                  <TableCell className="text-xs">{r.utm_source}</TableCell>
                  <TableCell className="text-right">{Number(r.total_attempts).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-emerald-600">{Number(r.allowed).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-amber-600">{Number(r.blocked_ip).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-orange-600">{Number(r.blocked_device).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-red-600">{Number(r.blocked_verification).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-medium">{Number(r.successful_signups).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {(!breakdown.data || breakdown.data.length === 0) && !breakdown.isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">No signup attempts recorded in this window.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Recent attempts</CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="allowed">Allowed</SelectItem>
              <SelectItem value="blocked_ip">Blocked (IP)</SelectItem>
              <SelectItem value="blocked_device">Blocked (Device)</SelectItem>
              <SelectItem value="blocked_verification">Blocked (OTP)</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>UTM</TableHead>
                <TableHead>Email / Phone</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(log.data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">{format(new Date(r.created_at), 'MMM d, HH:mm')}</TableCell>
                  <TableCell className="font-mono text-xs">{r.path || '—'}</TableCell>
                  <TableCell className="text-xs">{r.utm_source || '—'}</TableCell>
                  <TableCell className="text-xs">
                    <div>{r.email || '—'}</div>
                    <div className="text-muted-foreground">{r.phone || ''}</div>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{r.ip || '—'}</TableCell>
                  <TableCell className="text-xs font-mono">{r.device_fp ? r.device_fp.slice(0, 10) + '…' : '—'}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[r.status] || 'bg-muted text-foreground'} variant="secondary">
                      {r.status}
                    </Badge>
                    {r.actor_role && <div className="text-[10px] text-muted-foreground mt-0.5">by {r.actor_role}</div>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">{r.reason || (r.user_id ? '✓ account created' : '')}</TableCell>
                  <TableCell className="text-right">
                    {r.ip ? (
                      blockedSet.has(r.ip) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => unblockMutation.mutate(r.ip!)}
                          disabled={unblockMutation.isPending}
                        >
                          <ShieldOff className="h-3.5 w-3.5 mr-1" /> Unblock
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => { setBlockIp(r.ip); setBlockReason(''); }}
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" /> Block IP
                        </Button>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!log.data || log.data.length === 0) && !log.isLoading && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">No entries.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(blockedIps.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Ban className="h-4 w-4 text-destructive" /> Blocked IPs ({blockedIps.data?.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Blocked by</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(blockedIps.data ?? []).map((b) => (
                  <TableRow key={b.ip}>
                    <TableCell className="font-mono text-xs">{b.ip}</TableCell>
                    <TableCell className="text-xs">{b.reason}</TableCell>
                    <TableCell className="text-xs">{b.blocked_by_role || '—'}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(b.created_at), 'MMM d, HH:mm')}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unblockMutation.mutate(b.ip)}
                        disabled={unblockMutation.isPending}
                      >
                        <ShieldOff className="h-3.5 w-3.5 mr-1" /> Unblock
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!blockIp} onOpenChange={(o) => { if (!o) { setBlockIp(null); setBlockReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block IP address</DialogTitle>
            <DialogDescription>
              Signups from <span className="font-mono">{blockIp}</span> will be refused. Existing sessions are not affected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason (min 5 chars, required)</label>
            <Textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="e.g. Bot-farming account creation from this IP on 2026-07-25"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setBlockIp(null); setBlockReason(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={blockReason.trim().length < 5 || blockMutation.isPending}
              onClick={() => blockIp && blockMutation.mutate({ ip: blockIp, reason: blockReason.trim() })}
            >
              <Ban className="h-4 w-4 mr-1" /> Block IP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SignupSourceLogPanel;
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Shield, ShieldAlert, UserCheck } from 'lucide-react';
import { format } from 'date-fns';

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
                </TableRow>
              ))}
              {(!log.data || log.data.length === 0) && !log.isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">No entries.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default SignupSourceLogPanel;
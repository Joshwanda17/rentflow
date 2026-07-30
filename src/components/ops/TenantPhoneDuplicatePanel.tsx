import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  ShieldAlert,
  RefreshCw,
  Loader2,
  Phone,
  Check,
  EyeOff,
  Settings2,
  ChevronDown,
} from 'lucide-react';
import { TenantPhoneDuplicateSettingsDialog } from './TenantPhoneDuplicateSettingsDialog';

interface DuplicateAlert {
  id: string;
  signature: string;
  match_type: string;
  phone_key: string;
  member_ids: string[];
  member_count: number;
  sample_names: string[];
  sample_phones: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Surfaces tenant phone near-duplicates flagged by the recurring monitor
 * (`detect_tenant_phone_near_duplicates`, scheduled hourly via pg_cron).
 * Near-duplicates share the last 8 digits but differ on the full number —
 * a common signature of typo'd or fraudulent re-registrations that slip past
 * the exact-match unique constraint.
 */
export function TenantPhoneDuplicatePanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState<boolean>(true);

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ['tenant-phone-duplicate-alerts', showResolved],
    queryFn: async (): Promise<DuplicateAlert[]> => {
      let q = supabase
        .from('tenant_phone_duplicate_alerts')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (!showResolved) q = q.eq('status', 'open');
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DuplicateAlert[];
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const rescan = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('detect_tenant_phone_near_duplicates');
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (newCount) => {
      toast({
        title: 'Scan complete',
        description:
          newCount > 0
            ? `${newCount} new near-duplicate group${newCount === 1 ? '' : 's'} detected.`
            : 'No new near-duplicates found.',
      });
      queryClient.invalidateQueries({ queryKey: ['tenant-phone-duplicate-alerts'] });
    },
    onError: (e) =>
      toast({ title: 'Scan failed', description: (e as Error).message, variant: 'destructive' }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'resolved' | 'ignored' | 'open' }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('tenant_phone_duplicate_alerts')
        .update({
          status,
          resolved_by: status === 'open' ? null : u.user?.id ?? null,
          resolved_at: status === 'open' ? null : new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-phone-duplicate-alerts'] });
    },
    onError: (e) =>
      toast({ title: 'Update failed', description: (e as Error).message, variant: 'destructive' }),
  });

  const rows = data ?? [];
  const openCount = useMemo(() => rows.filter((r) => r.status === 'open').length, [rows]);

  return (
    <Card className="border-amber-500/30">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
            className="min-w-0 flex-1 text-left rounded-md -m-1 p-1 hover:bg-muted/40 transition-colors"
          >
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Tenant Phone Duplicate Monitor
              {openCount > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {openCount} open
                </Badge>
              )}
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  panelOpen ? 'rotate-180' : ''
                }`}
              />
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Runs automatically every hour. Flags tenant phone numbers that nearly match an
              existing record (same last 8 digits) — likely typos or duplicate sign-ups.
            </p>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowResolved((v) => !v)}
              className="text-xs"
            >
              {showResolved ? 'Open only' : 'Show all'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              className="text-xs"
            >
              <Settings2 className="h-4 w-4 mr-1" /> Settings
            </Button>
            <Button
              onClick={() => rescan.mutate()}
              disabled={rescan.isPending}
              size="sm"
              variant="secondary"
            >
              {rescan.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Scan now
            </Button>
          </div>
        </div>
      </CardHeader>
      {panelOpen && (
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {(error as Error).message}
          </div>
        )}

        {isFetching && rows.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading alerts…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
            No phone near-duplicates detected. The monitor will alert here automatically if any appear.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-md border p-3 text-xs flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Phone className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span className="font-mono font-medium">…{r.phone_key}</span>
                    <Badge variant="outline">{r.member_count} records</Badge>
                    {r.status !== 'open' && (
                      <Badge variant={r.status === 'ignored' ? 'secondary' : 'default'}>
                        {r.status}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">{timeAgo(r.updated_at)}</span>
                  </div>
                  <div className="text-muted-foreground truncate">
                    {r.sample_names.filter(Boolean).join(', ') || 'Unnamed'}
                  </div>
                  <div className="text-muted-foreground font-mono truncate">
                    {r.sample_phones.filter(Boolean).join('  •  ')}
                  </div>
                </div>
                {r.status === 'open' ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ id: r.id, status: 'resolved' })}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Resolve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ id: r.id, status: 'ignored' })}
                    >
                      <EyeOff className="h-3.5 w-3.5 mr-1" /> Ignore
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ id: r.id, status: 'open' })}
                    className="shrink-0"
                  >
                    Reopen
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      )}
      <TenantPhoneDuplicateSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Card>
  );
}
import { useMemo } from 'react';
import { MonitorSmartphone, Smartphone, Laptop, LogOut, CheckCircle2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useDeviceSessions, type DeviceSession } from '@/hooks/useDeviceSessions';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function DeviceRow({
  session,
  onSignOut,
}: {
  session: DeviceSession;
  onSignOut: (deviceId: string) => void;
}) {
  const isPhone = /Android|iPhone|iPad/i.test(session.device_label ?? '');
  const Icon = isPhone ? Smartphone : Laptop;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-3 py-2.5">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', session.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground">
            {session.device_label || 'Unknown device'}
          </p>
          {session.isCurrent && (
            <Badge variant="primary" size="sm" className="shrink-0">This device</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {session.isActive ? 'Active' : 'Last seen'} · {timeAgo(session.last_seen_at)}
        </p>
      </div>
      {!session.isCurrent && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
          title="Sign out this device"
          onClick={() => onSignOut(session.device_id)}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function DeviceSessionIndicator({ userId }: { userId: string | undefined }) {
  const { sessions, activeCount, isMultiDevice, loading, signOutDevice } = useDeviceSessions(userId);

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent)),
    [sessions],
  );

  if (loading && sessions.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
            isMultiDevice
              ? 'border-warning/30 bg-warning/10 text-warning'
              : 'border-border/50 bg-muted/50 text-muted-foreground',
          )}
        >
          <MonitorSmartphone className="h-3.5 w-3.5" />
          <span>{activeCount} {activeCount === 1 ? 'device' : 'devices'}</span>
          {isMultiDevice && <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Active devices</p>
          <span className="text-xs text-muted-foreground">{activeCount} active</span>
        </div>
        {isMultiDevice ? (
          <div className="mb-2 flex items-start gap-2 rounded-lg bg-warning/10 px-2.5 py-2 text-xs text-warning">
            <MonitorSmartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Your account is signed in on {activeCount} devices right now.</span>
          </div>
        ) : (
          <div className="mb-2 flex items-start gap-2 rounded-lg bg-success/10 px-2.5 py-2 text-xs text-success">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Only this device is active.</span>
          </div>
        )}
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {sortedSessions.map((s) => (
            <DeviceRow key={s.id} session={s} onSignOut={signOutDevice} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
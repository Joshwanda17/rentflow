import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CloudUpload, WifiOff, UserPlus, ShieldCheck, User as UserIcon, Wallet } from 'lucide-react';
import { useTrustProfile } from '@/hooks/useTrustProfile';
import { useProfile } from '@/hooks/useProfile';
import { generateWelileAiId } from '@/lib/welileAiId';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/UserAvatar';
import { getEntries, getQueuedEntries } from '@/lib/fieldCollectStore';

/**
 * Agent dashboard priority grid — 4 large, finger-friendly tiles.
 *
 * The four most important things an agent does or wants to see:
 *   1. Field Collect   — record cash today (live total)
 *   2. New Tenant      — start a rent request
 *   3. Welile Vouch    — guaranteed credit limit (live amount)
 *   4. Profile         — avatar shortcut to settings/profile
 *
 * Designed for low-end Android browsers: 1.5x icon size, ≥80px tap target,
 * minimal text, plain language. No data fetched if not needed (Vouch tile
 * only loads trust data, Field Collect uses local IndexedDB so it works offline).
 */

interface Props {
  agentId: string;
  onOpenFieldCollect: () => void;
  onOpenNewTenant: () => void;
}

export function AgentPriorityGrid({ agentId, onOpenFieldCollect, onOpenNewTenant }: Props) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const aiId = agentId ? generateWelileAiId(agentId) : undefined;
  const { profile: trust } = useTrustProfile(aiId);

  // Field Collect live state (mirrors FieldCollectCard logic)
  const [collectedToday, setCollectedToday] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const refresh = useCallback(async () => {
    if (!agentId) return;
    try {
      const [all, queued] = await Promise.all([
        getEntries(agentId),
        getQueuedEntries(agentId),
      ]);
      // Today (local midnight)
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayMs = startOfDay.getTime();
      const today = all.filter(e => e.capturedAt >= todayMs);
      setCollectedToday(today.reduce((s, e) => s + Number(e.amount || 0), 0));
      setPendingCount(queued.length);
    } catch {
      /* ignore */
    }
  }, [agentId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [refresh]);

  const vouch = trust?.trust?.borrowing_limit_ugx ?? 0;
  const score = Math.round(trust?.trust?.score ?? 0);
  const fieldCollectActive = collectedToday > 0 || pendingCount > 0;
  const fieldCollectAttention = !online || pendingCount > 0;

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {/* 1. Field Collect — biggest daily action */}
      <PriorityTile
        onClick={() => { hapticTap(); onOpenFieldCollect(); }}
        icon={<Wallet className="h-6 w-6" strokeWidth={2.2} />}
        iconBg="bg-primary text-primary-foreground"
        label="Field Collect"
        valueLabel={fieldCollectActive ? formatUGX(collectedToday) : 'No cash yet'}
        sub={
          fieldCollectAttention
            ? !online
              ? 'Offline · saved locally'
              : `${pendingCount} to send`
            : fieldCollectActive
              ? `${collectedToday > 0 ? 'Today' : ' '}`
              : 'Tap to record first payment'
        }
        statusIcon={
          fieldCollectAttention
            ? !online
              ? <WifiOff className="h-3 w-3" />
              : <CloudUpload className="h-3 w-3" />
            : null
        }
      />

      {/* 2. New Tenant — rent request */}
      <PriorityTile
        onClick={() => { hapticTap(); onOpenNewTenant(); }}
        icon={<UserPlus className="h-6 w-6" strokeWidth={2.2} />}
        iconBg="bg-[hsl(var(--chart-1))] text-white"
        label="New Tenant"
        valueLabel="Add tenant"
        sub="Start a rent request"
      />

      {/* 3. Welile Vouch — live guaranteed credit */}
      <PriorityTile
        onClick={() => { hapticTap(); aiId && navigate(`/profile/${aiId}`); }}
        icon={<ShieldCheck className="h-6 w-6" strokeWidth={2.2} />}
        iconBg="bg-emerald-600 text-white"
        label="Welile Vouch"
        valueLabel={vouch > 0 ? formatUGX(vouch) : 'No limit yet'}
        sub={vouch > 0 ? `Score ${score}` : 'Collect to unlock credit'}
      />

      {/* 4. Profile — avatar shortcut */}
      <PriorityTile
        onClick={() => { hapticTap(); navigate('/settings'); }}
        icon={
          profile?.avatar_url
            ? <UserAvatar avatarUrl={profile.avatar_url} fullName={profile.full_name} size="md" />
            : <UserIcon className="h-6 w-6" strokeWidth={2.2} />
        }
        iconBg={profile?.avatar_url ? 'bg-transparent' : 'bg-muted text-foreground'}
        label="Profile"
        valueLabel={profile?.full_name ? 'My account' : 'Finish setup'}
        sub={
          profile?.verified
            ? 'Verified ✓'
            : profile?.avatar_url
              ? 'Get verified'
              : 'Add photo & details'
        }
      />
    </div>
  );
}

/* ───────── Tile ───────── */

function PriorityTile({
  onClick,
  icon,
  iconBg,
  label,
  valueLabel,
  sub,
  statusIcon,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  valueLabel: string;
  sub?: string;
  statusIcon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-2 p-4 rounded-2xl bg-card border border-border/60 active:scale-[0.97] active:bg-accent/40 transition-all min-h-[112px] text-left hover:border-border touch-manipulation"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="flex items-center justify-between w-full">
        <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center shadow-sm shrink-0', iconBg)}>
          {icon}
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
      <div className="min-w-0 w-full">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
        <p className="text-base font-bold tabular-nums leading-tight tracking-tight truncate mt-0.5">
          {valueLabel}
        </p>
        {(sub || statusIcon) && (
          <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 truncate">
            {statusIcon}
            <span className="truncate">{sub}</span>
          </p>
        )}
      </div>
    </button>
  );
}

export default AgentPriorityGrid;
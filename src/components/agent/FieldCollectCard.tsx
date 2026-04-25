import { useEffect, useState, useCallback } from 'react';
import { Banknote, WifiOff, Wifi, CloudUpload } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getEntries, getQueuedEntries } from '@/lib/fieldCollectStore';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

interface FieldCollectCardProps {
  onOpen: () => void;
}

/** Prominent card under "My Tenants" — opens offline field collection dialog. */
export function FieldCollectCard({ onOpen }: FieldCollectCardProps) {
  const { user } = useAuth();
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [all, queued] = await Promise.all([
        getEntries(user.id),
        getQueuedEntries(user.id),
      ]);
      setTotal(all.reduce((s, e) => s + Number(e.amount || 0), 0));
      setPending(queued.length);
    } catch { /* ignore */ }
  }, [user?.id]);

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

  const hasActivity = total > 0 || pending > 0;

  return (
    <button
      onClick={onOpen}
      aria-label="Open Field Collect to record a cash payment"
      className={cn(
        'w-full text-left rounded-3xl p-5',
        'bg-primary text-primary-foreground',
        'shadow-lg shadow-primary/15 active:scale-[0.99] transition-all touch-manipulation',
        'flex items-center gap-4 min-h-[88px]',
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="h-14 w-14 rounded-2xl bg-primary-foreground/15 flex items-center justify-center shrink-0">
        <Banknote className="h-7 w-7" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-base leading-tight">Collect cash</p>
        {hasActivity ? (
          <p className="text-[22px] font-bold tabular-nums leading-tight mt-1">
            {formatUGX(total)}
          </p>
        ) : (
          <p className="text-sm opacity-90 mt-0.5">Tap to record a payment</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] opacity-90">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? 'Online' : 'Saving offline'}
          </span>
          {pending > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary-foreground/20 font-medium">
              <CloudUpload className="h-3 w-3" />
              {pending} to send
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default FieldCollectCard;
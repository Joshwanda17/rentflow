import { useEffect, useState, useCallback } from 'react';
import { Banknote, WifiOff, Wifi, ChevronRight, CloudUpload } from 'lucide-react';
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

  return (
    <button
      onClick={onOpen}
      className={cn(
        'w-full text-left rounded-2xl p-4',
        'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground',
        'shadow-md shadow-primary/20 active:scale-[0.99] transition-all touch-manipulation',
        'flex items-center gap-3'
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="h-12 w-12 rounded-xl bg-primary-foreground/15 flex items-center justify-center shrink-0">
        <Banknote className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="font-bold text-[14px] leading-tight">Field Collect</p>
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary-foreground/20 font-semibold">
            {online ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
            {online ? 'Online' : 'Offline'}
          </span>
        </div>
        <p className="text-[11px] opacity-90 mt-0.5">
          Collect cash door-to-door · works without internet
        </p>
        {(total > 0 || pending > 0) && (
          <p className="text-[11px] mt-1 font-semibold">
            Today: {formatUGX(total)}
            {pending > 0 && (
              <span className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-950">
                <CloudUpload className="h-2.5 w-2.5" />
                {pending} to sync
              </span>
            )}
          </p>
        )}
      </div>
      <ChevronRight className="h-5 w-5 opacity-80 shrink-0" />
    </button>
  );
}

export default FieldCollectCard;
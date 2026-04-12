import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import { MOCK_FEED_EVENTS } from './mockData';

const formatCompact = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
};

export function AngelActivityFeed() {
  const [visibleCount, setVisibleCount] = useState(5);
  const [newIndex, setNewIndex] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulate live feed — add one item every 8 seconds
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setVisibleCount((prev) => {
        const next = Math.min(prev + 1, MOCK_FEED_EVENTS.length);
        setNewIndex(next - 1);
        return next;
      });
    }, 8000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Clear highlight after animation
  useEffect(() => {
    if (newIndex >= 0) {
      const t = setTimeout(() => setNewIndex(-1), 1500);
      return () => clearTimeout(t);
    }
  }, [newIndex]);

  const events = MOCK_FEED_EVENTS.slice(0, visibleCount);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="relative">
            <Activity className="h-4 w-4 text-primary" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-success rounded-full animate-pulse" />
          </div>
          Live Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 max-h-64 overflow-y-auto">
        {events.map((evt, i) => (
          <div
            key={evt.id}
            className={`flex items-center gap-2 py-1.5 px-2 rounded-lg text-sm transition-all duration-500 ${
              i === newIndex ? 'bg-primary/10 scale-[1.01]' : ''
            }`}
          >
            <span className={`text-xs font-bold ${evt.type === 'secured' ? 'text-success' : 'text-primary'}`}>
              +
            </span>
            <span className="font-semibold">UGX {formatCompact(evt.amount)}</span>
            <span className="text-muted-foreground text-xs">
              {evt.type === 'secured' ? 'secured' : 'pledged'} — {evt.name}
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">{evt.timestamp}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

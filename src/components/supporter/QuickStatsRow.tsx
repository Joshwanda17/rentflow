import { staggerDelay, animations } from '@/lib/cssAnimations';

interface QuickStat {
  emoji: string;
  label: string;
  value: string;
  color?: string;
}

interface QuickStatsRowProps {
  stats: QuickStat[];
}

export function QuickStatsRow({ stats }: QuickStatsRowProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={`p-3 rounded-xl bg-muted/50 text-center border border-border/50 ${animations.fadeIn}`}
          style={staggerDelay(index, 100)}
        >
          <span className="text-xl mb-1 block">{stat.emoji}</span>
          <p className={`text-sm font-black ${stat.color || 'text-foreground'}`}>{stat.value}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
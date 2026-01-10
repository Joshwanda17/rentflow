import { motion } from 'framer-motion';

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
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.1 }}
          className="p-3 rounded-xl bg-muted/50 text-center border border-border/50"
        >
          <span className="text-xl mb-1 block">{stat.emoji}</span>
          <p className={`text-sm font-black ${stat.color || 'text-foreground'}`}>{stat.value}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</p>
        </motion.div>
      ))}
    </div>
  );
}

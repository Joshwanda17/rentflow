import { Users, Wifi, UserCheck, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompactUserStatsProps {
  totalUsers: number;
  onlineCount: number;
  verifiedCount: number;
  inactiveCount: number;
}

export function CompactUserStats({ 
  totalUsers, 
  onlineCount, 
  verifiedCount,
  inactiveCount 
}: CompactUserStatsProps) {
  const stats = [
    { 
      icon: Users, 
      value: totalUsers, 
      label: 'Total',
      color: 'text-[#8696a0]',
      bg: 'bg-[#2a3942]'
    },
    { 
      icon: Wifi, 
      value: onlineCount, 
      label: 'Online',
      color: 'text-[#00a884]',
      bg: 'bg-[#00a884]/15'
    },
    { 
      icon: UserCheck, 
      value: verifiedCount, 
      label: 'Verified',
      color: 'text-[#53bdeb]',
      bg: 'bg-[#53bdeb]/15'
    },
    { 
      icon: Clock, 
      value: inactiveCount, 
      label: 'Inactive',
      color: 'text-[#e67e22]',
      bg: 'bg-[#e67e22]/15'
    },
  ];

  return (
    <div className="flex gap-1.5 px-2 py-1.5 overflow-x-auto scrollbar-hide">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-lg shrink-0",
            stat.bg
          )}
        >
          <stat.icon className={cn("h-3 w-3", stat.color)} />
          <span className={cn("text-[11px] font-bold tabular-nums", stat.color)}>
            {stat.value}
          </span>
          <span className="text-[9px] text-[#8696a0] font-medium">
            {stat.label}
          </span>
        </div>
      ))}
    </div>
  );
}

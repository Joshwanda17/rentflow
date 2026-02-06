import { UserStats } from '@/hooks/useUserStats';
import { Users, Building, UsersRound, Heart, Wallet } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface UserStatsSectionProps {
  stats: UserStats;
  loading: boolean;
}

interface StatItemProps {
  icon: React.ElementType;
  label: string;
  value: number;
  iconColor: string;
}

function StatItem({ icon: Icon, label, value, iconColor }: StatItemProps) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2 text-sm">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

export function UserStatsSection({ stats, loading }: UserStatsSectionProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const hasStats =
    stats.tenantsRegistered > 0 ||
    stats.landlordsRegistered > 0 ||
    stats.subAgentsRecruited > 0 ||
    stats.supportersRegistered > 0 ||
    stats.tenantsEarningFrom > 0;

  if (!hasStats) return null;

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium mb-2">Activity Stats</p>
      <div className="bg-muted/30 rounded-lg p-3 space-y-0.5">
        <StatItem
          icon={Users}
          label="Tenants Registered"
          value={stats.tenantsRegistered}
          iconColor="text-blue-500"
        />
        <StatItem
          icon={Building}
          label="Landlords Registered"
          value={stats.landlordsRegistered}
          iconColor="text-purple-500"
        />
        <StatItem
          icon={UsersRound}
          label="Sub-Agents Recruited"
          value={stats.subAgentsRecruited}
          iconColor="text-orange-500"
        />
        <StatItem
          icon={Heart}
          label="Supporters Registered"
          value={stats.supportersRegistered}
          iconColor="text-pink-500"
        />
        <StatItem
          icon={Wallet}
          label="Tenants Earning From"
          value={stats.tenantsEarningFrom}
          iconColor="text-green-500"
        />
      </div>
    </div>
  );
}

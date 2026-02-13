import { useUserSnapshot } from '@/hooks/useUserSnapshot';

export function ReferralStatsCard({ userId }: { userId: string }) {
  const { snapshot, loading } = useUserSnapshot(userId);

  if (loading || snapshot.referralCount === 0) return null;

  const totalEarned = snapshot.referrals
    .filter((r: any) => r.credited)
    .reduce((sum: number, r: any) => sum + Number(r.bonus_amount), 0);

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
      <div className="text-sm">
        <span className="font-semibold text-foreground">{snapshot.referralCount}</span>
        <span className="text-muted-foreground ml-1">referrals</span>
      </div>
      {totalEarned > 0 && (
        <div className="text-sm font-semibold text-primary">
          +{totalEarned.toLocaleString()} UGX earned
        </div>
      )}
    </div>
  );
}

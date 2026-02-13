// UserReferralsSection - DB calls stubbed for performance
import { Users } from 'lucide-react';

interface UserReferralsSectionProps {
  userId: string;
}

export default function UserReferralsSection({ userId }: UserReferralsSectionProps) {
  // Referral queries removed to reduce database load
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Users className="h-12 w-12 text-muted-foreground mb-3" />
      <p className="text-muted-foreground font-medium">Referral tracking paused</p>
      <p className="text-xs text-muted-foreground mt-1">
        Data optimized for performance
      </p>
    </div>
  );
}

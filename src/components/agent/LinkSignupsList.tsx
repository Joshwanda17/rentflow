import { useUserSnapshot } from '@/hooks/useUserSnapshot';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Users } from 'lucide-react';

export function LinkSignupsList() {
  const { user } = useAuth();
  const { snapshot } = useUserSnapshot(user?.id);
  const signups = snapshot.linkSignups || [];

  if (signups.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No link sign-ups yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {signups.map((signup: any) => (
        <div key={signup.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <Users className="h-4 w-4 text-green-500" />
            </div>
            <div>
              <p className="font-medium text-sm">{signup.full_name}</p>
              <p className="text-xs text-muted-foreground">{signup.phone}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {format(new Date(signup.created_at), 'MMM d, yyyy')}
          </p>
        </div>
      ))}
    </div>
  );
}

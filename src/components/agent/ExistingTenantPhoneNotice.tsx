import { Loader2, ShieldAlert, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExistingTenantMatch } from '@/hooks/useExistingTenantByPhone';

interface ExistingTenantPhoneNoticeProps {
  match: ExistingTenantMatch | null;
  checking: boolean;
  /** Optional: tap to auto-fill the form with this existing person. */
  onUse?: (match: ExistingTenantMatch) => void;
}

/**
 * Inline banner shown under a tenant phone field. While an agent types a number
 * we check the platform and, if the number already belongs to someone, reveal
 * their name so the agent cannot register the same number twice (fraud guard).
 */
export function ExistingTenantPhoneNotice({ match, checking, onUse }: ExistingTenantPhoneNoticeProps) {
  if (checking && !match) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking if this number is already registered…
      </p>
    );
  }

  if (!match) return null;

  const name = match.full_name?.trim() || 'an existing user';

  return (
    <div className="rounded-xl border-2 border-warning/50 bg-warning/10 p-3 text-warning-foreground">
      <div className="flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-bold text-warning">
            This number is already registered to {name}
          </p>
          <p className="text-[11px] leading-snug text-foreground/80">
            You cannot enter the same number twice. If this is the same person, use
            their existing record instead of creating a duplicate.
          </p>
          {match.national_id && (
            <p className="text-[11px] text-foreground/70">
              National ID on file: <span className="font-mono font-semibold">{match.national_id}</span>
            </p>
          )}
          {onUse && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 h-8 gap-1.5 text-xs"
              onClick={() => onUse(match)}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Use {name}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

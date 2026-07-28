import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { formatUGX } from '@/lib/agentAdvanceCalculations';
import { cn } from '@/lib/utils';

export interface DuplicateAccount {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  is_frozen: boolean | null;
  created_at: string;
  match_type: 'name' | 'national_id' | 'mobile_money';
  active_advances: number;
  outstanding: number;
}

export type DuplicateMap = Record<string, DuplicateAccount[]>;

/** Fetches possible duplicate accounts (same name / national ID / mobile money) for a set of agents. */
export function useAgentDuplicateMap(agentIds: string[]) {
  const ids = Array.from(new Set(agentIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ['agent-duplicate-accounts', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 120_000,
    queryFn: async (): Promise<DuplicateMap> => {
      const { data, error } = await (supabase.rpc as any)('get_agent_duplicate_accounts', {
        _agent_ids: ids,
      });
      if (error) throw error;
      const map: DuplicateMap = {};
      for (const row of (data ?? []) as any[]) {
        map[row.agent_id] = (row.duplicates ?? []) as DuplicateAccount[];
      }
      return map;
    },
  });
}

const MATCH_LABEL: Record<string, string> = {
  name: 'Same name',
  national_id: 'Same national ID',
  mobile_money: 'Same mobile money number',
};

/** Compact inline flag for list cards. */
export function DuplicateAccountBadge({ dups }: { dups?: DuplicateAccount[] }) {
  if (!dups || dups.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950/40 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-400">
      <AlertTriangle className="h-3 w-3" />
      {dups.length} duplicate account{dups.length > 1 ? 's' : ''}
    </span>
  );
}

/** Full breakdown for the review dialog. */
export function DuplicateAccountAlert({
  dups,
  className,
}: { dups?: DuplicateAccount[]; className?: string }) {
  if (!dups || dups.length === 0) {
    return (
      <div className={cn('rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-2.5', className)}>
        <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" /> No duplicate account detected for this agent
        </p>
      </div>
    );
  }
  return (
    <div className={cn('rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-2.5 space-y-2', className)}>
      <p className="text-[11px] font-bold text-red-700 dark:text-red-400 inline-flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        Possible duplicate account{dups.length > 1 ? 's' : ''} ({dups.length}) — review for fraud before approving
      </p>
      <div className="space-y-1.5">
        {dups.map((d) => (
          <div key={d.id} className="rounded-lg bg-background/70 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold truncate">{d.full_name || 'Unnamed'}</p>
              <span className="text-[9px] font-bold uppercase tracking-wide text-red-600 shrink-0">
                {MATCH_LABEL[d.match_type] || d.match_type}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              {d.phone || d.email || '—'}
              {d.is_frozen ? ' • BLOCKED' : ''}
            </p>
            {d.active_advances > 0 && (
              <p className="text-[10px] font-semibold text-amber-600">
                {d.active_advances} active advance{d.active_advances > 1 ? 's' : ''} • outstanding {formatUGX(d.outstanding)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ShieldCheck, Search, Loader2 } from 'lucide-react';

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
};

const PAGE_SIZE = 20;

export function CTOKycLevelPanel() {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [newLevel, setNewLevel] = useState<1 | 2 | 3>(2);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const term = debounced;
  const {
    data: pages,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['cto-kyc-search', term],
    enabled: term.length >= 3,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await (supabase as any).rpc('cto_search_profiles', {
        p_term: term,
        p_limit: PAGE_SIZE,
        p_offset: pageParam as number,
      });
      if (error) throw error;
      return (data || []) as ProfileRow[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
    staleTime: 60_000,
    retry: false,
  });

  const results = pages?.pages.flat() ?? [];
  const isInitialLoading = isFetching && !isFetchingNextPage;

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      el.scrollTop + el.clientHeight >= el.scrollHeight - 40
    ) {
      fetchNextPage();
    }
  };

  const { data: currentKyc, refetch: refetchKyc } = useQuery({
    queryKey: ['cto-kyc-current', selected?.id],
    enabled: !!selected?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('kyc_profiles')
        .select('kyc_level, level_source, upgraded_at, last_reviewed_at')
        .eq('user_id', selected!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ['cto-kyc-history', selected?.id],
    enabled: !!selected?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('kyc_level_change_audit')
        .select('action, old_level, new_level, reason, actor_id, created_at')
        .eq('user_id', selected!.id)
        .order('created_at', { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  const submit = async () => {
    if (!selected) return;
    if (reason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters');
      return;
    }
    setSubmitting(true);
    const { error } = await (supabase as any).rpc('cto_set_kyc_level', {
      p_user_id: selected.id,
      p_new_level: newLevel,
      p_reason: reason.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message || 'Failed to update KYC level');
      return;
    }
    toast.success(`KYC level set to ${newLevel} for ${selected.full_name || 'user'}`);
    setReason('');
    refetchKyc();
    refetchHistory();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold">KYC Level Override (CTO only)</h2>
            <p className="text-xs text-muted-foreground">
              Manually set a user's KYC level (1, 2, or 3). Every change is recorded in the KYC audit trail.
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, phone, or email (min 3 chars)"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm"
          />
        </div>

        {q.trim().length >= 3 && (
          <div
            onScroll={onScroll}
            className="mt-3 max-h-60 overflow-y-auto rounded-xl border border-border divide-y divide-border"
          >
            {(isInitialLoading || q.trim() !== term) && (
              <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching...
              </div>
            )}
            {!isFetching && q.trim() === term && results.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground">No matches</div>
            )}
            {!isInitialLoading && results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                  selected?.id === r.id ? 'bg-primary/10' : ''
                }`}
              >
                <div className="font-medium">{r.full_name || '—'}</div>
                <div className="text-xs text-muted-foreground">
                  {r.phone || '—'} · {r.email || '—'}
                </div>
              </button>
            ))}
            {isFetchingNextPage && (
              <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading more...
              </div>
            )}
            {!isFetchingNextPage && hasNextPage && results.length > 0 && (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                className="w-full py-2 text-xs font-medium text-primary hover:bg-muted"
              >
                Load more
              </button>
            )}
          </div>
        )}
      </div>

      {selected && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div>
            <div className="text-sm font-semibold">{selected.full_name || 'Unnamed user'}</div>
            <div className="text-xs text-muted-foreground">
              {selected.phone || '—'} · {selected.email || '—'}
            </div>
            <div className="mt-2 text-xs">
              Current KYC level:{' '}
              <span className="font-semibold">{currentKyc?.kyc_level ?? 1}</span>
              {currentKyc?.level_source && (
                <span className="text-muted-foreground"> ({currentKyc.level_source})</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setNewLevel(lvl as 1 | 2 | 3)}
                className={`py-2 rounded-xl border text-sm font-semibold ${
                  newLevel === lvl
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                Level {lvl}
              </button>
            ))}
          </div>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for the change (min 10 characters, recorded in audit trail)"
            rows={3}
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
          />

          <button
            type="button"
            onClick={submit}
            disabled={submitting || reason.trim().length < 10}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? 'Applying...' : `Set KYC to Level ${newLevel}`}
          </button>

          {(history?.length ?? 0) > 0 && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Recent changes</p>
              <ul className="space-y-1 text-xs">
                {history!.map((h: any, i) => (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <span>
                      <span className="font-medium capitalize">{h.action}</span>{' '}
                      {h.old_level ?? '—'} → {h.new_level}
                      <span className="text-muted-foreground"> · {h.reason}</span>
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {new Date(h.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CTOKycLevelPanel;
/**
 * Approvals inbox. What appears here is decided by the position the signed-in
 * user holds (hr_my_approvals), never by their app role.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import HRPlaceholderPage from '@/hr/pages/HRPlaceholderPage';
import { Card, CardContent } from '@/components/ui/card';
import { myApprovals } from '@/hr/pay/api/workflow';

interface ApprovalItem {
  item_type: string;
  item_id: string;
  title: string;
  detail: string | null;
  raised_by: string | null;
  raised_at: string | null;
  action_required: string | null;
  route: string | null;
}

export default function Approvals() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [authorities, setAuthorities] = useState<
    Array<{ function_code: string; title: string | null; holders: string[] }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { supabase } = await import('@/hr/api/client');
      const { data: rows } = await supabase
        .from('hr_pay_authorities')
        .select('function_code, position_id, hr_positions(title)')
        .is('effective_to', null);
      if (!alive || !rows) return;
      const positionIds = rows.map((r: any) => r.position_id).filter(Boolean);
      const { data: assignments } = await supabase
        .from('hr_assignments')
        .select('position_id, hr_staff(user_id)')
        .in('position_id', positionIds)
        .is('ended_on', null);
      const userIds = Array.from(
        new Set((assignments ?? []).map((a: any) => a.hr_staff?.user_id).filter(Boolean)),
      ) as string[];
      const nameById: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        (profiles ?? []).forEach((p: any) => {
          if (p.full_name) nameById[p.id] = p.full_name;
        });
      }
      if (!alive) return;
      setAuthorities(
        rows.map((r: any) => ({
          function_code: r.function_code,
          title: r.hr_positions?.title ?? null,
          holders: (assignments ?? [])
            .filter((a: any) => a.position_id === r.position_id)
            .map((a: any) => nameById[a.hr_staff?.user_id] ?? 'Unnamed')
            .filter(Boolean),
        })),
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    myApprovals()
      .then(async (rows) => {
        if (!alive) return;
        setItems(rows as ApprovalItem[]);
        const ids = Array.from(new Set(rows.map((r) => r.raised_by).filter(Boolean))) as string[];
        if (ids.length > 0) {
          const { supabase } = await import('@/hr/api/client');
          const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids);
          if (!alive) return;
          const map: Record<string, string> = {};
          (data ?? []).forEach((p: any) => {
            if (p.full_name) map[p.id] = p.full_name;
          });
          setNames(map);
        }
      })
      .catch((err) => {
        if (alive) setError((err as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <HRPlaceholderPage
      heading="Approvals"
      subtitle="Items waiting on you. This list reflects the position you hold, not your role."
    >
      {loading && (
        <p className="text-sm text-muted-foreground">
          <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
          Loading…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm font-semibold">Nothing waiting on you.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Items appear here when your position holds the authority to act on them.
            </p>
            {authorities.length > 0 && (
              <div className="mx-auto mt-4 max-w-md space-y-1 rounded-md border border-border bg-muted/40 p-3 text-left">
                <p className="text-xs font-semibold">Who currently holds payroll authority</p>
                {authorities.map((a) => (
                  <p key={a.function_code} className="text-xs text-muted-foreground">
                    <span className="font-medium capitalize">{a.function_code}</span>
                    {' · '}
                    {a.title ?? 'Unassigned position'}
                    {a.holders.length > 0 ? ` — ${a.holders.join(', ')}` : ' — no one assigned'}
                  </p>
                ))}
                <p className="pt-1 text-[11px] text-muted-foreground">
                  A submitted run only appears for the account holding the position with
                  approve authority.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {items.map((item) => {
          const provisional = (item.detail ?? '').includes('PROVISIONAL');
          const body = (
            <CardContent className="space-y-1 py-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{item.title}</p>
                {provisional && (
                  <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    PROVISIONAL
                  </span>
                )}
              </div>
              {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
              {item.action_required && (
                <p className="text-xs font-medium">{item.action_required}</p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Raised by {(item.raised_by && names[item.raised_by]) || 'System'}
                {item.raised_at ? ` · ${new Date(item.raised_at).toLocaleString('en-GB')}` : ''}
              </p>
            </CardContent>
          );
          return item.route ? (
            <Link key={`${item.item_type}-${item.item_id}`} to={item.route} className="block">
              <Card className="transition-colors hover:bg-muted/40">{body}</Card>
            </Link>
          ) : (
            <Card key={`${item.item_type}-${item.item_id}`}>{body}</Card>
          );
        })}
      </div>
    </HRPlaceholderPage>
  );
}
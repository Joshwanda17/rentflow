import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Shield, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
}

interface AccessRow {
  profile: ProfileRow;
  roles: string[];
  permissions: string[];
  requests: Array<{
    id: string;
    requested_role: string;
    status: string;
    reason: string | null;
    rejection_reason: string | null;
    created_at: string;
  }>;
}

function statusBadge(status: string) {
  if (status === 'approved') {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> approved
      </Badge>
    );
  }
  if (status === 'rejected') {
    return (
      <Badge variant="outline" className="gap-1 border-red-500/40 text-red-700">
        <XCircle className="h-3 w-3" /> rejected
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700">
      <Clock className="h-3 w-3" /> {status}
    </Badge>
  );
}

export default function AccessAuditPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('avin');
  const [debounced, setDebounced] = useState('avin');
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!debounced) {
        setRows([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const term = `%${debounced}%`;
        const { data: profiles, error: profErr } = await supabase
          .from('profiles')
          .select('id, full_name, phone, email')
          .or(`full_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`)
          .order('full_name', { ascending: true })
          .limit(50);
        if (profErr) throw profErr;
        const ids = (profiles || []).map((p) => p.id);
        if (ids.length === 0) {
          if (!cancelled) setRows([]);
          return;
        }

        const [rolesRes, permsRes, reqsRes] = await Promise.all([
          supabase.from('user_roles').select('user_id, role').in('user_id', ids),
          supabase.from('staff_permissions').select('user_id, permitted_dashboard').in('user_id', ids),
          supabase
            .from('role_access_requests')
            .select('id, user_id, requested_role, status, reason, rejection_reason, created_at')
            .in('user_id', ids)
            .order('created_at', { ascending: false }),
        ]);

        const rolesByUser = new Map<string, string[]>();
        (rolesRes.data || []).forEach((r: any) => {
          const arr = rolesByUser.get(r.user_id) || [];
          arr.push(r.role);
          rolesByUser.set(r.user_id, arr);
        });
        const permsByUser = new Map<string, string[]>();
        (permsRes.data || []).forEach((r: any) => {
          const arr = permsByUser.get(r.user_id) || [];
          arr.push(r.permitted_dashboard);
          permsByUser.set(r.user_id, arr);
        });
        const reqsByUser = new Map<string, AccessRow['requests']>();
        (reqsRes.data || []).forEach((r: any) => {
          const arr = reqsByUser.get(r.user_id) || [];
          arr.push(r);
          reqsByUser.set(r.user_id, arr);
        });

        const merged: AccessRow[] = (profiles as ProfileRow[]).map((p) => ({
          profile: p,
          roles: rolesByUser.get(p.id) || [],
          permissions: permsByUser.get(p.id) || [],
          requests: reqsByUser.get(p.id) || [],
        }));
        if (!cancelled) setRows(merged);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load access audit');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const summary = useMemo(() => {
    const totalPending = rows.reduce(
      (n, r) => n + r.requests.filter((x) => x.status === 'pending').length,
      0,
    );
    return { users: rows.length, pending: totalPending };
  }, [rows]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>

        <header className="space-y-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> Access Audit
          </h1>
          <p className="text-sm text-muted-foreground">
            View each user's roles, dashboard permissions, and role-access requests. Defaults to
            users matching "avin".
          </p>
        </header>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone or email"
            className="pl-9 h-11"
            autoFocus
          />
        </div>

        <div className="text-xs text-muted-foreground">
          {loading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </span>
          ) : (
            <>
              {summary.users} user(s) · {summary.pending} pending request(s)
            </>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.profile.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span>{r.profile.full_name || '—'}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {r.profile.phone || r.profile.email || r.profile.id.slice(0, 8)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Roles ({r.roles.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.roles.length ? (
                      r.roles.map((role) => (
                        <Badge key={role} variant="secondary">
                          {role}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">none</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Staff dashboard permissions ({r.permissions.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.permissions.length ? (
                      r.permissions.map((p) => (
                        <Badge key={p} variant="outline" className="border-primary/30">
                          {p}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">none</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Role access requests ({r.requests.length})
                  </div>
                  {r.requests.length ? (
                    <div className="space-y-1.5">
                      {r.requests.map((rq) => (
                        <div
                          key={rq.id}
                          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
                        >
                          <Badge variant="secondary">{rq.requested_role}</Badge>
                          {statusBadge(rq.status)}
                          <span className="text-xs text-muted-foreground">
                            {new Date(rq.created_at).toLocaleDateString()}
                          </span>
                          {rq.rejection_reason && (
                            <span className="text-xs text-red-700 italic">
                              “{rq.rejection_reason}”
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">none</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {!loading && rows.length === 0 && debounced && (
            <div className="text-center text-sm text-muted-foreground py-8">
              No users match “{debounced}”.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
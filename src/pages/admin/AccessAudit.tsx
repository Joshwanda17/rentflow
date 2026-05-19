import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Shield, Loader2, CheckCircle2, XCircle, Clock, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { AppRole } from '@/hooks/auth/types';

const ASSIGNABLE_ROLES: AppRole[] = [
  'manager',
  'employee',
  'operations',
  'ceo',
  'coo',
  'cfo',
  'cto',
  'cmo',
  'crm',
  'hr',
];
const ASSIGNABLE_DASHBOARDS = [
  'ceo',
  'coo',
  'cfo',
  'cto',
  'cmo',
  'crm',
  'hr',
  'financial-ops',
  'company-ops',
  'agent-ops',
  'tenant-ops',
  'landlord-ops',
  'partner-ops',
];

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
  const { user: actor, roles: actorRoles } = useAuth();
  const { toast } = useToast();
  const canGrant = actorRoles.some((r) => r === 'super_admin' || r === 'manager');

  const [query, setQuery] = useState('avin');
  const [debounced, setDebounced] = useState('avin');
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Grant dialog state
  const [grantTarget, setGrantTarget] = useState<AccessRow | null>(null);
  const [pickedRoles, setPickedRoles] = useState<Set<AppRole>>(new Set());
  const [pickedDashboards, setPickedDashboards] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [granting, setGranting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const loadRows = useMemo(() => async (term: string, cancelledRef: { current: boolean }) => {
    if (!term) {
      if (!cancelledRef.current) setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const like = `%${term}%`;
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, full_name, phone, email')
        .or(`full_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
        .order('full_name', { ascending: true })
        .limit(50);
      if (profErr) throw profErr;
      const ids = (profiles || []).map((p) => p.id);
      if (ids.length === 0) {
        if (!cancelledRef.current) setRows([]);
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
      if (!cancelledRef.current) setRows(merged);
    } catch (e: any) {
      if (!cancelledRef.current) setError(e?.message || 'Failed to load access audit');
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };
    loadRows(debounced, cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [debounced, loadRows]);

  const summary = useMemo(() => {
    const totalPending = rows.reduce(
      (n, r) => n + r.requests.filter((x) => x.status === 'pending').length,
      0,
    );
    return { users: rows.length, pending: totalPending };
  }, [rows]);

  const openGrant = (row: AccessRow) => {
    setGrantTarget(row);
    setPickedRoles(new Set());
    setPickedDashboards(new Set());
    setReason('');
  };

  const toggleSet = <T extends string>(s: Set<T>, v: T): Set<T> => {
    const next = new Set(s);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const handleGrant = async () => {
    if (!grantTarget || !actor) return;
    if (reason.trim().length < 10) {
      toast({ title: 'Reason must be at least 10 characters', variant: 'destructive' });
      return;
    }
    if (pickedRoles.size === 0 && pickedDashboards.size === 0) {
      toast({ title: 'Pick at least one role or permission', variant: 'destructive' });
      return;
    }
    setGranting(true);
    try {
      const userId = grantTarget.profile.id;

      // 1) Assign roles (skip ones already held)
      const newRoles = Array.from(pickedRoles).filter(
        (r) => !grantTarget.roles.includes(r),
      );
      if (newRoles.length) {
        const { error: roleErr } = await supabase
          .from('user_roles')
          .insert(newRoles.map((role) => ({ user_id: userId, role })) as any);
        if (roleErr) throw new Error(`Roles: ${roleErr.message}`);
      }

      // 2) Grant dashboard permissions (skip already granted)
      const newDashboards = Array.from(pickedDashboards).filter(
        (d) => !grantTarget.permissions.includes(d),
      );
      if (newDashboards.length) {
        const { error: permErr } = await supabase
          .from('staff_permissions')
          .insert(
            newDashboards.map((permitted_dashboard) => ({
              user_id: userId,
              permitted_dashboard,
              granted_by: actor.id,
            })),
          );
        if (permErr) throw new Error(`Permissions: ${permErr.message}`);
      }

      // 3) Audit log (single combined entry)
      await supabase.from('audit_logs').insert({
        user_id: actor.id,
        action_type: 'staff_access_granted',
        table_name: 'user_roles+staff_permissions',
        record_id: userId,
        metadata: {
          target_user_id: userId,
          target_name: grantTarget.profile.full_name,
          roles_added: newRoles,
          permissions_added: newDashboards,
          reason: reason.trim(),
        },
      });

      toast({
        title: 'Access granted',
        description: `${newRoles.length} role(s), ${newDashboards.length} permission(s) added.`,
      });
      setGrantTarget(null);
      // refresh
      const cancelledRef = { current: false };
      loadRows(debounced, cancelledRef);
    } catch (e: any) {
      toast({ title: 'Grant failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setGranting(false);
    }
  };

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
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
                <CardTitle className="text-base flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span>{r.profile.full_name || '—'}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {r.profile.phone || r.profile.email || r.profile.id.slice(0, 8)}
                  </span>
                </CardTitle>
                {canGrant && (
                  <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => openGrant(r)}>
                    <KeyRound className="h-3.5 w-3.5" />
                    Grant access
                  </Button>
                )}
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

        <Dialog open={!!grantTarget} onOpenChange={(o) => !o && setGrantTarget(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Grant access</DialogTitle>
            </DialogHeader>
            {grantTarget && (
              <div className="space-y-4">
                <div className="text-sm">
                  <div className="font-semibold">{grantTarget.profile.full_name || '—'}</div>
                  <div className="text-xs text-muted-foreground">
                    {grantTarget.profile.phone || grantTarget.profile.email}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Staff roles
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ASSIGNABLE_ROLES.map((r) => {
                      const owned = grantTarget.roles.includes(r);
                      return (
                        <label
                          key={r}
                          className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm cursor-pointer hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={pickedRoles.has(r)}
                            onCheckedChange={() => setPickedRoles((s) => toggleSet(s, r))}
                            disabled={owned}
                          />
                          <span className={owned ? 'text-muted-foreground line-through' : ''}>
                            {r}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Dashboard permissions
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ASSIGNABLE_DASHBOARDS.map((d) => {
                      const owned = grantTarget.permissions.includes(d);
                      return (
                        <label
                          key={d}
                          className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm cursor-pointer hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={pickedDashboards.has(d)}
                            onCheckedChange={() => setPickedDashboards((s) => toggleSet(s, d))}
                            disabled={owned}
                          />
                          <span className={owned ? 'text-muted-foreground line-through' : ''}>
                            {d}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Reason (min 10 chars, audited)
                  </div>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why is this access being granted?"
                    rows={3}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setGrantTarget(null)} disabled={granting}>
                Cancel
              </Button>
              <Button onClick={handleGrant} disabled={granting} className="gap-2">
                {granting && <Loader2 className="h-4 w-4 animate-spin" />}
                Grant
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
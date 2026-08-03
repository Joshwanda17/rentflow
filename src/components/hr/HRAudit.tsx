import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

/** The only action types this register surfaces: people & access events. */
const AUDIT_ACTION_TYPES = [
  'staff_role_enabled',
  'staff_role_disabled',
  'permission_granted',
  'permission_revoked',
  'role_assigned',
  'role_disabled',
  'role_removed',
  'forced_default_role_set',
  'staff_password_reset',
  'staff_password_provisioned',
  'staff_password_changed',
  'staff_password_revert',
  'cto_temp_password_issued',
  'forced_password_reset_completed',
  'delete_account',
  'archive_account',
  'admin_user_deletion',
  'account_deletion',
  'hr_department_created',
  'hr_disciplinary_issued',
] as const;

const DASH = '—';

interface AuditRow {
  id: string;
  created_at: string | null;
  user_id: string | null;
  action_type: string | null;
  table_name: string | null;
  record_id: string | null;
  metadata: Record<string, unknown> | null;
}

const readable = (value?: string | null) => {
  if (!value) return DASH;
  const words = value.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const shortWhen = (iso?: string | null) => {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
};

const text = (value: unknown) => {
  if (value === null || value === undefined || value === '') return DASH;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export default function HRAudit() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Bounded to the last 90 days — audit_logs holds 250k+ rows and must never
  // be read unfiltered.
  const sinceIso = useMemo(
    () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    [],
  );

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['hr-people-access-audit', sinceIso],
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, created_at, user_id, action_type, table_name, record_id, metadata')
        .in('action_type', AUDIT_ACTION_TYPES as unknown as string[])
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as AuditRow[];
    },
  });

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-foreground">People &amp; Access Audit Register</h2>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No people or access events in the last 90 days
        </p>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">When</TableHead>
                <TableHead className="whitespace-nowrap">Who acted</TableHead>
                <TableHead className="whitespace-nowrap">Action</TableHead>
                <TableHead className="whitespace-nowrap">Target</TableHead>
                <TableHead className="whitespace-nowrap">Surface</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map(log => {
                const isOpen = expanded.has(log.id);
                const meta = (log.metadata && typeof log.metadata === 'object')
                  ? log.metadata as Record<string, unknown>
                  : {};
                const detailEntries = Object.entries(meta);
                return (
                  <>
                    <TableRow
                      key={log.id}
                      onClick={() => toggle(log.id)}
                      aria-expanded={isOpen}
                      className="cursor-pointer"
                    >
                      <TableCell className="text-xs whitespace-nowrap">{shortWhen(log.created_at)}</TableCell>
                      <TableCell className="text-xs font-mono">{text(log.user_id)}</TableCell>
                      <TableCell className="text-xs">{readable(log.action_type)}</TableCell>
                      <TableCell className="text-xs font-mono">{text(log.record_id)}</TableCell>
                      <TableCell className="text-xs">{readable(log.table_name)}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={`${log.id}-details`} className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={5} className="text-xs">
                          {detailEntries.length === 0 ? (
                            <p className="text-muted-foreground">No further details recorded</p>
                          ) : (
                            <div className="space-y-1">
                              {detailEntries.map(([key, value]) => (
                                <p key={key} className="break-words">
                                  <span className="text-muted-foreground">{readable(key)}: </span>
                                  <span>{text(value)}</span>
                                </p>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Application actions only. Database schema changes are not recorded here.
      </p>
    </div>
  );
}

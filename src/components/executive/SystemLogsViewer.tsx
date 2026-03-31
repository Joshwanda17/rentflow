import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { format } from 'date-fns';
import { Shield, LogIn, Key, UserCog, Trash2, RefreshCw, Monitor } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Json } from '@/integrations/supabase/types';

type AuditLog = {
  id: string;
  user_id: string | null;
  action_type: string;
  table_name: string | null;
  record_id: string | null;
  metadata: Json | null;
  created_at: string | null;
  user_name?: string;
};

const ACTION_ICONS: Record<string, typeof Shield> = {
  staff_portal_login: LogIn,
  staff_login: LogIn,
  staff_password_reset: Key,
  staff_password_change: Key,
  role_change: UserCog,
  account_delete: Trash2,
};

const ACTION_COLORS: Record<string, string> = {
  staff_portal_login: 'bg-blue-500/10 text-blue-600',
  staff_login: 'bg-blue-500/10 text-blue-600',
  staff_password_reset: 'bg-amber-500/10 text-amber-700',
  staff_password_change: 'bg-amber-500/10 text-amber-700',
  role_change: 'bg-purple-500/10 text-purple-600',
  account_delete: 'bg-destructive/10 text-destructive',
};

export function SystemLogsViewer() {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['system-audit-logs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!data) return [];

      // Fetch user names for logs that have user_ids
      const userIds = [...new Set(data.map(l => l.user_id).filter(Boolean))] as string[];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      const nameMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

      return data.map(log => ({
        ...log,
        user_name: log.user_id ? nameMap.get(log.user_id) || 'Unknown' : 'System',
      })) as AuditLog[];
    },
    staleTime: 30000,
  });

  // Get unique action types for filter
  const actionTypes = [...new Set(logs?.map(l => l.action_type) || [])].sort();

  const filtered = (logs || []).filter(log => {
    if (actionFilter !== 'all' && log.action_type !== actionFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const meta = log.metadata as Record<string, unknown> | null;
      const metaStr = meta ? JSON.stringify(meta).toLowerCase() : '';
      return (
        log.action_type.toLowerCase().includes(term) ||
        (log.user_name || '').toLowerCase().includes(term) ||
        (log.table_name || '').toLowerCase().includes(term) ||
        metaStr.includes(term)
      );
    }
    return true;
  });

  // Stats
  const loginCount = (logs || []).filter(l => l.action_type.includes('login')).length;
  const passwordEvents = (logs || []).filter(l => l.action_type.includes('password')).length;
  const totalLogs = (logs || []).length;

  const columns: Column<AuditLog>[] = [
    {
      key: 'created_at',
      label: 'Time',
      render: (v) => v ? (
        <span className="text-xs whitespace-nowrap">{format(new Date(v as string), 'dd MMM yy HH:mm')}</span>
      ) : '—',
    },
    {
      key: 'action_type',
      label: 'Action',
      render: (v) => {
        const action = String(v);
        const colorClass = ACTION_COLORS[action] || 'bg-muted text-muted-foreground';
        const Icon = ACTION_ICONS[action] || Shield;
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
            <Icon className="w-3 h-3" />
            {action.replace(/_/g, ' ')}
          </span>
        );
      },
    },
    {
      key: 'user_name' as keyof AuditLog,
      label: 'User',
      render: (_v, row) => (
        <span className="text-sm font-medium">{row.user_name || 'System'}</span>
      ),
    },
    {
      key: 'metadata',
      label: 'Details',
      className: 'max-w-[300px]',
      render: (v) => {
        if (!v || typeof v !== 'object') return '—';
        const meta = v as Record<string, unknown>;
        const parts: string[] = [];
        if (meta.device) parts.push(`📱 ${String(meta.device)}`);
        if (meta.browser) parts.push(`🌐 ${String(meta.browser)}`);
        if (meta.method) parts.push(`via ${String(meta.method)}`);
        if (meta.reason) parts.push(`Reason: ${String(meta.reason)}`);
        if (meta.username && !parts.some(p => p.includes(String(meta.username)))) {
          parts.push(`👤 ${String(meta.username)}`);
        }
        return parts.length > 0 ? (
          <span className="text-xs text-muted-foreground">{parts.join(' · ')}</span>
        ) : (
          <span className="text-xs text-muted-foreground truncate block max-w-[250px]">
            {JSON.stringify(v).slice(0, 80)}
          </span>
        );
      },
    },
    {
      key: 'table_name',
      label: 'Table',
      render: (v) => v ? <span className="text-xs font-mono text-muted-foreground">{String(v)}</span> : '—',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">System Logs</h1>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xl font-bold text-foreground">{totalLogs}</p>
          <p className="text-xs text-muted-foreground">Total Events</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xl font-bold text-blue-600">{loginCount}</p>
          <p className="text-xs text-muted-foreground">Portal Logins</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xl font-bold text-amber-600">{passwordEvents}</p>
          <p className="text-xs text-muted-foreground">Password Events</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Input
          placeholder="Search logs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs"
        />
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {actionTypes.map(a => (
              <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <ExecutiveDataTable
        data={filtered}
        columns={columns}
        loading={isLoading}
        title="Audit Trail"
      />
    </div>
  );
}

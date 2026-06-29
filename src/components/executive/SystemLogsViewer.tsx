import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Shield, LogIn, Key, UserCog, Trash2, RefreshCw, ChevronDown, ChevronRight, Edit, PlusCircle, CheckCircle, XCircle, Eye, DollarSign, Compass, CalendarIcon, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
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
  create: PlusCircle,
  update: Edit,
  approve: CheckCircle,
  reject: XCircle,
  view: Eye,
  deposit: DollarSign,
  forced_default_role_set: Compass,
  forced_default_role_cleared: Compass,
};

const ACTION_COLORS: Record<string, string> = {
  staff_portal_login: 'bg-blue-500/10 text-blue-600 border-blue-200',
  staff_login: 'bg-blue-500/10 text-blue-600 border-blue-200',
  staff_password_reset: 'bg-amber-500/10 text-amber-700 border-amber-200',
  staff_password_change: 'bg-amber-500/10 text-amber-700 border-amber-200',
  role_change: 'bg-purple-500/10 text-purple-600 border-purple-200',
  account_delete: 'bg-destructive/10 text-destructive border-destructive/20',
  create: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  update: 'bg-sky-500/10 text-sky-700 border-sky-200',
  approve: 'bg-green-500/10 text-green-700 border-green-200',
  reject: 'bg-red-500/10 text-red-700 border-red-200',
  forced_default_role_set: 'bg-indigo-500/10 text-indigo-700 border-indigo-200',
  forced_default_role_cleared: 'bg-indigo-500/10 text-indigo-700 border-indigo-200',
};

const DEFAULT_ROLE_ACTIONS = ['forced_default_role_set', 'forced_default_role_cleared'];

// High-volume automated events that drown out everything else in the feed.
// Hidden by default so the System Logs show the full variety of activity.
const NOISE_ACTIONS = ['cashout_claim_auto_released', 'roi_payout_requested'];

function formatActionLabel(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function MetadataDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 py-1">
      <span className="text-xs font-medium text-muted-foreground min-w-[100px]">{label}:</span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  );
}

function ExpandedRow({ log }: { log: AuditLog }) {
  const meta = (log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata))
    ? log.metadata as Record<string, unknown>
    : {};

  const entries = Object.entries(meta).filter(([, v]) => v !== null && v !== undefined && v !== '');

  const friendlyLabels: Record<string, string> = {
    username: 'Staff Name',
    device: 'Device',
    browser: 'Browser',
    login_at: 'Login Time',
    method: 'Method',
    reason: 'Reason',
    amount: 'Amount',
    old_role: 'Previous Role',
    new_role: 'New Role',
    target_user: 'Target User',
    ip_address: 'IP Address',
    status: 'Status',
    table: 'Table',
    field: 'Field Changed',
    old_value: 'Old Value',
    new_value: 'New Value',
    reset_by: 'Reset By',
    reset_for: 'Reset For',
  };

  return (
    <TableRow className="bg-muted/30">
      <TableCell colSpan={5} className="py-3 px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0">
          <MetadataDetail label="Event ID" value={log.id.slice(0, 8)} />
          <MetadataDetail label="Action" value={formatActionLabel(log.action_type)} />
          <MetadataDetail label="User" value={log.user_name || 'System'} />
          <MetadataDetail label="Time" value={log.created_at ? format(new Date(log.created_at), 'dd MMM yyyy HH:mm:ss') : '—'} />
          {log.table_name && <MetadataDetail label="Table" value={log.table_name} />}
          {log.record_id && <MetadataDetail label="Record ID" value={log.record_id.slice(0, 8)} />}
          {entries.map(([key, val]) => {
            const label = friendlyLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            let display = '';
            if (typeof val === 'object') {
              display = JSON.stringify(val, null, 2);
            } else if (key === 'amount' && typeof val === 'number') {
              display = `UGX ${val.toLocaleString()}`;
            } else if (key.includes('_at') || key.includes('time') || key.includes('login_at')) {
              try {
                display = format(new Date(String(val)), 'dd MMM yyyy HH:mm:ss');
              } catch {
                display = String(val);
              }
            } else {
              display = String(val);
            }
            return <MetadataDetail key={key} label={label} value={display} />;
          })}
          {entries.length === 0 && (
            <div className="col-span-2 text-xs text-muted-foreground italic py-1">No additional details recorded.</div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function SystemLogsViewer() {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [defaultRoleOnly, setDefaultRoleOnly] = useState(false);
  const [defaultRoleValue, setDefaultRoleValue] = useState<string>('all');
  const [targetUser, setTargetUser] = useState('');
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['system-audit-logs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!data) return [];

      const userIds = [...new Set(data.map(l => l.user_id).filter(Boolean))] as string[];
      const recordIds = [...new Set(data.map(l => l.record_id).filter(Boolean))] as string[];
      const allIds = [...new Set([...userIds, ...recordIds])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', allIds);

      const nameMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

      return data.map(log => ({
        ...log,
        user_name: log.user_id ? nameMap.get(log.user_id) || 'Unknown' : 'System',
        target_name: log.record_id ? nameMap.get(log.record_id) || null : null,
      })) as AuditLog[];
    },
    staleTime: 30000,
  });

  const actionTypes = [...new Set(logs?.map(l => l.action_type) || [])].sort();

  const filtered = (logs || []).filter(log => {
    if (defaultRoleOnly && !DEFAULT_ROLE_ACTIONS.includes(log.action_type)) return false;
    if (actionFilter !== 'all' && log.action_type !== actionFilter) return false;

    if (defaultRoleValue !== 'all') {
      if (!DEFAULT_ROLE_ACTIONS.includes(log.action_type)) return false;
      const meta = (log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata))
        ? log.metadata as Record<string, unknown>
        : {};
      const roleVal = meta.forced_default_role;
      if (defaultRoleValue === 'cleared') {
        if (log.action_type !== 'forced_default_role_cleared' && roleVal !== null) return false;
      } else if (roleVal !== defaultRoleValue) {
        return false;
      }
    }

    if (fromDate && log.created_at && new Date(log.created_at) < fromDate) return false;
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      if (log.created_at && new Date(log.created_at) > end) return false;
    }

    if (targetUser.trim()) {
      const t = targetUser.trim().toLowerCase();
      const tn = ((log as any).target_name || '').toLowerCase();
      const rid = (log.record_id || '').toLowerCase();
      const uid = (log.user_id || '').toLowerCase();
      const un = (log.user_name || '').toLowerCase();
      if (!tn.includes(t) && !rid.includes(t) && !uid.includes(t) && !un.includes(t)) return false;
    }

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

  const loginCount = (logs || []).filter(l => l.action_type.includes('login')).length;
  const passwordEvents = (logs || []).filter(l => l.action_type.includes('password')).length;
  const totalLogs = (logs || []).length;
  const defaultRoleCount = (logs || []).filter(l => DEFAULT_ROLE_ACTIONS.includes(l.action_type)).length;

  const clearAll = () => {
    setDefaultRoleOnly(false);
    setDefaultRoleValue('all');
    setTargetUser('');
    setFromDate(undefined);
    setToDate(undefined);
    setActionFilter('all');
    setSearchTerm('');
  };
  const anyFilter = defaultRoleOnly || defaultRoleValue !== 'all' || !!targetUser || !!fromDate || !!toDate || actionFilter !== 'all' || !!searchTerm;

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
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search logs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs"
        />
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {actionTypes.map(a => (
              <SelectItem key={a} value={a}>{formatActionLabel(a)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={defaultRoleOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDefaultRoleOnly(v => !v)}
          className="gap-1.5"
        >
          <Compass className="w-3.5 h-3.5" />
          Default Role Events
          <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">{defaultRoleCount}</Badge>
        </Button>
        <Select value={defaultRoleValue} onValueChange={setDefaultRoleValue}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Any default role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any default role</SelectItem>
            <SelectItem value="tenant">🏠 Tenant</SelectItem>
            <SelectItem value="agent">💼 Agent</SelectItem>
            <SelectItem value="landlord">🏢 Landlord</SelectItem>
            <SelectItem value="supporter">💰 Funder</SelectItem>
            <SelectItem value="cleared">↩️ Cleared</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Target user (name or ID)..."
          value={targetUser}
          onChange={(e) => setTargetUser(e.target.value)}
          className="max-w-[220px]"
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn('gap-1.5', !fromDate && 'text-muted-foreground')}>
              <CalendarIcon className="w-3.5 h-3.5" />
              {fromDate ? format(fromDate, 'dd MMM yy') : 'From'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={fromDate} onSelect={setFromDate} initialFocus className={cn('p-3 pointer-events-auto')} />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn('gap-1.5', !toDate && 'text-muted-foreground')}>
              <CalendarIcon className="w-3.5 h-3.5" />
              {toDate ? format(toDate, 'dd MMM yy') : 'To'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus className={cn('p-3 pointer-events-auto')} />
          </PopoverContent>
        </Popover>
        {anyFilter && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1.5 text-muted-foreground">
            <X className="w-3.5 h-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <ScrollArea className="h-[500px] rounded-lg border border-border">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No logs found</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(log => {
                const isExpanded = expandedId === log.id;
                const Icon = ACTION_ICONS[log.action_type] || Shield;
                const colorClass = ACTION_COLORS[log.action_type] || 'bg-muted text-muted-foreground border-border';
                const meta = (log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata))
                  ? log.metadata as Record<string, unknown>
                  : {};

                // Build a human-readable summary
                const summaryParts: string[] = [];
                if (meta.device) summaryParts.push(`${String(meta.device)}`);
                if (meta.browser) summaryParts.push(`${String(meta.browser)}`);
                if (meta.reason) summaryParts.push(`Reason: ${String(meta.reason)}`);
                if (meta.amount) summaryParts.push(`UGX ${Number(meta.amount).toLocaleString()}`);
                if (log.table_name) summaryParts.push(`on ${log.table_name.replace(/_/g, ' ')}`);
                const summary = summaryParts.join(' · ') || '—';

                return (
                  <>
                    <TableRow
                      key={log.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <TableCell className="w-8 px-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {log.created_at ? format(new Date(log.created_at), 'dd MMM yy HH:mm') : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 text-xs ${colorClass}`}>
                          <Icon className="w-3 h-3" />
                          {formatActionLabel(log.action_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{log.user_name || 'System'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">{summary}</TableCell>
                    </TableRow>
                    {isExpanded && <ExpandedRow key={`${log.id}-detail`} log={log} />}
                  </>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ScrollArea>
      <p className="text-xs text-muted-foreground">Showing {filtered.length} of {totalLogs} events</p>
    </div>
  );
}

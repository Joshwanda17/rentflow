import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Search, User, ArrowUpDown, Users } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { cn } from '@/lib/utils';
import HREmployeeDetailDrawer from './HREmployeeDetailDrawer';

import type { AppRole } from '@/hooks/auth/types';

const INTERNAL_ROLES: AppRole[] = ['manager', 'super_admin', 'employee', 'operations', 'ceo', 'coo', 'cfo', 'cto', 'cmo', 'crm', 'hr'];

const roleColors: Record<string, string> = {
  manager: 'bg-primary/15 text-primary border-primary/20',
  super_admin: 'bg-destructive/15 text-destructive border-destructive/20',
  ceo: 'bg-warning/15 text-warning border-warning/20',
  coo: 'bg-success/15 text-success border-success/20',
  cfo: 'bg-accent/40 text-accent-foreground border-accent/30',
  cto: 'bg-primary/15 text-primary border-primary/20',
  cmo: 'bg-warning/15 text-warning border-warning/20',
  crm: 'bg-muted text-muted-foreground border-border',
  hr: 'bg-primary/10 text-primary border-primary/15',
  employee: 'bg-muted text-muted-foreground border-border',
  operations: 'bg-success/15 text-success border-success/20',
};

interface RoleRecord {
  id: string;
  role: string;
  enabled: boolean;
}

interface EmployeeRecord {
  user_id: string;
  roles: string[];
  roleRecords: RoleRecord[];
  enabled: boolean;
  profile: { full_name: string | null; email: string | null; phone: string | null; avatar_url: string | null; verified: boolean } | null;
  staffProfile: { employee_id: string | null; department: string | null; position: string | null } | null;
}

type SortKey = 'name' | 'department' | 'status';

export default function HREmployeeDirectory() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['hr-employees-full'],
    queryFn: async () => {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('id, user_id, role, enabled')
        .in('role', INTERNAL_ROLES as any);

      if (!roleData || roleData.length === 0) return [];

      const userMap = new Map<string, { roles: string[]; roleRecords: RoleRecord[]; enabled: boolean }>();
      roleData.forEach((r: any) => {
        const existing = userMap.get(r.user_id);
        if (existing) {
          existing.roles.push(r.role);
          existing.roleRecords.push({ id: r.id, role: r.role, enabled: r.enabled });
          if (!r.enabled) existing.enabled = false;
        } else {
          userMap.set(r.user_id, {
            roles: [r.role],
            roleRecords: [{ id: r.id, role: r.role, enabled: r.enabled }],
            enabled: r.enabled,
          });
        }
      });

      const userIds = Array.from(userMap.keys());

      const [{ data: profiles }, { data: staffProfiles }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, phone, avatar_url, verified').in('id', userIds),
        supabase.from('staff_profiles').select('user_id, employee_id, department, position').in('user_id', userIds),
      ]);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const staffMap = new Map((staffProfiles || []).map((s: any) => [s.user_id, s]));

      return userIds.map((uid) => {
        const info = userMap.get(uid)!;
        return {
          user_id: uid,
          roles: info.roles,
          roleRecords: info.roleRecords,
          enabled: info.enabled,
          profile: profileMap.get(uid) || null,
          staffProfile: staffMap.get(uid) || null,
        } as EmployeeRecord;
      });
    },
  });

  const departments = useMemo(() => {
    const depts = new Set<string>();
    employees.forEach(e => { if (e.staffProfile?.department) depts.add(e.staffProfile.department); });
    return Array.from(depts).sort();
  }, [employees]);

  const filtered = useMemo(() => {
    let result = employees.filter((emp) => {
      if (roleFilter !== 'all' && !emp.roles.includes(roleFilter)) return false;
      if (statusFilter === 'active' && !emp.enabled) return false;
      if (statusFilter === 'disabled' && emp.enabled) return false;
      if (deptFilter !== 'all' && emp.staffProfile?.department !== deptFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      const name = emp.profile?.full_name?.toLowerCase() || '';
      const email = emp.profile?.email?.toLowerCase() || '';
      const phone = emp.profile?.phone || '';
      const eid = emp.staffProfile?.employee_id?.toLowerCase() || '';
      return name.includes(q) || email.includes(q) || phone.includes(q) || eid.includes(q);
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = (a.profile?.full_name || '').localeCompare(b.profile?.full_name || '');
      else if (sortKey === 'department') cmp = (a.staffProfile?.department || '').localeCompare(b.staffProfile?.department || '');
      else if (sortKey === 'status') cmp = (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1);
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [employees, search, roleFilter, statusFilter, deptFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const activeCount = filtered.filter(e => e.enabled).length;
  const disabledCount = filtered.filter(e => !e.enabled).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5" /> Employee Directory
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filtered.length} employees · {activeCount} active{disabledCount > 0 ? ` · ${disabledCount} disabled` : ''}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {INTERNAL_ROLES.map((r) => (
              <SelectItem key={r} value={r} className="capitalize">{r.replace('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
        {departments.length > 0 && (
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Depts</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <User className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No employees found</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[280px]">
                  <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                    Employee <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden lg:table-cell">Phone</TableHead>
                <TableHead className="hidden md:table-cell">
                  <button onClick={() => toggleSort('department')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                    Department <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">Position</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="w-[80px]">
                  <button onClick={() => toggleSort('status')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                    Status <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp) => (
                <TableRow
                  key={emp.user_id}
                  className={cn(
                    "cursor-pointer transition-colors",
                    !emp.enabled && "opacity-50"
                  )}
                  onClick={() => setSelectedEmployee(emp)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <UserAvatar avatarUrl={emp.profile?.avatar_url} fullName={emp.profile?.full_name} size="sm" />
                      <span className="font-medium text-sm truncate">{emp.profile?.full_name || 'Unknown'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground truncate max-w-[200px]">
                    {emp.profile?.email || '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {emp.profile?.phone || '—'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs">
                    {emp.staffProfile?.department || '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs">
                    {emp.staffProfile?.position || '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {emp.roles.slice(0, 3).map((role) => (
                        <Badge key={role} variant="outline" className={cn("text-[9px] h-4 px-1.5 capitalize", roleColors[role] || '')}>
                          {role.replace('_', ' ')}
                        </Badge>
                      ))}
                      {emp.roles.length > 3 && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">
                          +{emp.roles.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={emp.enabled ? 'default' : 'destructive'} className="text-[10px] h-5">
                      {emp.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <HREmployeeDetailDrawer
        employee={selectedEmployee}
        open={!!selectedEmployee}
        onOpenChange={(open) => { if (!open) setSelectedEmployee(null); }}
      />
    </div>
  );
}

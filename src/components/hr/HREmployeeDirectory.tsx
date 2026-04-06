import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Search, User, ArrowUpDown, Users, UserPlus, Download, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Building2, Shield } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { cn } from '@/lib/utils';
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

interface RoleRecord { id: string; role: string; enabled: boolean; }
interface EmployeeRecord {
  user_id: string;
  roles: string[];
  roleRecords: RoleRecord[];
  enabled: boolean;
  profile: { full_name: string | null; email: string | null; phone: string | null; avatar_url: string | null; verified: boolean } | null;
  staffProfile: { employee_id: string | null; department: string | null; position: string | null } | null;
}

type SortKey = 'name' | 'department' | 'status' | 'position';
const PAGE_SIZE = 15;

export default function HREmployeeDirectory() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

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
          userMap.set(r.user_id, { roles: [r.role], roleRecords: [{ id: r.id, role: r.role, enabled: r.enabled }], enabled: r.enabled });
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
        return { user_id: uid, roles: info.roles, roleRecords: info.roleRecords, enabled: info.enabled, profile: profileMap.get(uid) || null, staffProfile: staffMap.get(uid) || null } as EmployeeRecord;
      });
    },
  });

  const departments = useMemo(() => {
    const depts = new Set<string>();
    employees.forEach(e => { if (e.staffProfile?.department) depts.add(e.staffProfile.department); });
    return Array.from(depts).sort();
  }, [employees]);

  // Stats
  const totalCount = employees.length;
  const activeCount = employees.filter(e => e.enabled).length;
  const disabledCount = totalCount - activeCount;
  const deptCount = departments.length;

  const filtered = useMemo(() => {
    let result = employees.filter((emp) => {
      if (roleFilter !== 'all' && !emp.roles.includes(roleFilter)) return false;
      if (statusFilter === 'active' && !emp.enabled) return false;
      if (statusFilter === 'disabled' && emp.enabled) return false;
      if (deptFilter !== 'all' && emp.staffProfile?.department !== deptFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (emp.profile?.full_name?.toLowerCase() || '').includes(q) ||
        (emp.profile?.email?.toLowerCase() || '').includes(q) ||
        (emp.profile?.phone || '').includes(q) ||
        (emp.staffProfile?.employee_id?.toLowerCase() || '').includes(q);
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = (a.profile?.full_name || '').localeCompare(b.profile?.full_name || '');
      else if (sortKey === 'department') cmp = (a.staffProfile?.department || '').localeCompare(b.staffProfile?.department || '');
      else if (sortKey === 'position') cmp = (a.staffProfile?.position || '').localeCompare(b.staffProfile?.position || '');
      else if (sortKey === 'status') cmp = (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1);
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [employees, search, roleFilter, statusFilter, deptFilter, sortKey, sortAsc]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
    setPage(0);
  };

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === paged.length) setSelected(new Set());
    else setSelected(new Set(paged.map(e => e.user_id)));
  }, [paged, selected.size]);

  const handleExport = () => {
    const rows = filtered.map(e => ({
      Name: e.profile?.full_name || '',
      Email: e.profile?.email || '',
      Phone: e.profile?.phone || '',
      Department: e.staffProfile?.department || '',
      Position: e.staffProfile?.position || '',
      Roles: e.roles.join(', '),
      Status: e.enabled ? 'Active' : 'Disabled',
    }));
    const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'employees.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFilterClick = (filter: string) => {
    if (filter === 'active') { setStatusFilter('active'); setRoleFilter('all'); setDeptFilter('all'); }
    else if (filter === 'disabled') { setStatusFilter('disabled'); setRoleFilter('all'); setDeptFilter('all'); }
    else { setStatusFilter('all'); setRoleFilter('all'); setDeptFilter('all'); }
    setPage(0);
  };

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button onClick={() => handleFilterClick('all')} className="text-left">
          <Card className={cn("border-border/40 hover:border-primary/40 transition-colors cursor-pointer", statusFilter === 'all' && roleFilter === 'all' && "border-primary/60 bg-primary/5")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Staff</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{totalCount}</p>
                </div>
                <div className="p-2 rounded-lg bg-primary/10"><Users className="h-4 w-4 text-primary" /></div>
              </div>
            </CardContent>
          </Card>
        </button>
        <button onClick={() => handleFilterClick('active')} className="text-left">
          <Card className={cn("border-border/40 hover:border-success/40 transition-colors cursor-pointer", statusFilter === 'active' && "border-success/60 bg-success/5")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Active</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{activeCount}</p>
                </div>
                <div className="p-2 rounded-lg bg-success/10"><CheckCircle2 className="h-4 w-4 text-success" /></div>
              </div>
            </CardContent>
          </Card>
        </button>
        <button onClick={() => handleFilterClick('disabled')} className="text-left">
          <Card className={cn("border-border/40 hover:border-destructive/40 transition-colors cursor-pointer", statusFilter === 'disabled' && "border-destructive/60 bg-destructive/5")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Disabled</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{disabledCount}</p>
                </div>
                <div className="p-2 rounded-lg bg-destructive/10"><XCircle className="h-4 w-4 text-destructive" /></div>
              </div>
            </CardContent>
          </Card>
        </button>
        <Card className="border-border/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Departments</p>
                <p className="text-2xl font-bold text-foreground mt-0.5">{deptCount}</p>
              </div>
              <div className="p-2 rounded-lg bg-accent/20"><Building2 className="h-4 w-4 text-accent-foreground" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Control Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone, ID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 h-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {INTERNAL_ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
        {departments.length > 0 && (
          <Select value={deptFilter} onValueChange={v => { setDeptFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Depts</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-xs font-medium text-primary">{selected.size} selected</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <User className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No employees found</p>
          <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-10">
                    <Checkbox checked={selected.size === paged.length && paged.length > 0} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead className="min-w-[200px]">
                    <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                      Employee <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden md:table-cell text-xs font-semibold uppercase tracking-wider">ID</TableHead>
                  <TableHead className="hidden md:table-cell">
                    <button onClick={() => toggleSort('department')} className="flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                      Dept <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    <button onClick={() => toggleSort('position')} className="flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                      Position <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Roles</TableHead>
                  <TableHead className="w-[80px]">
                    <button onClick={() => toggleSort('status')} className="flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                      Status <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden lg:table-cell text-xs font-semibold uppercase tracking-wider">Contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((emp) => (
                  <TableRow key={emp.user_id} className={cn("cursor-pointer transition-colors group", !emp.enabled && "opacity-50")}>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selected.has(emp.user_id)} onCheckedChange={() => toggleSelect(emp.user_id)} />
                    </TableCell>
                    <TableCell onClick={() => navigate(`/hr/profiles/${emp.user_id}`)}>
                      <div className="flex items-center gap-2.5">
                        <UserAvatar avatarUrl={emp.profile?.avatar_url} fullName={emp.profile?.full_name} size="sm" />
                        <span className="font-medium text-sm truncate group-hover:text-primary transition-colors">{emp.profile?.full_name || 'Unknown'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground font-mono" onClick={() => navigate(`/hr/profiles/${emp.user_id}`)}>
                      {emp.staffProfile?.employee_id || '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs" onClick={() => navigate(`/hr/profiles/${emp.user_id}`)}>
                      {emp.staffProfile?.department || '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs" onClick={() => navigate(`/hr/profiles/${emp.user_id}`)}>
                      {emp.staffProfile?.position || '—'}
                    </TableCell>
                    <TableCell onClick={() => navigate(`/hr/profiles/${emp.user_id}`)}>
                      <div className="flex flex-wrap gap-1">
                        {emp.roles.slice(0, 2).map(role => (
                          <Badge key={role} variant="outline" className={cn("text-[9px] h-4 px-1.5 capitalize", roleColors[role] || '')}>
                            {role.replace('_', ' ')}
                          </Badge>
                        ))}
                        {emp.roles.length > 2 && (
                          <Badge variant="secondary" className="text-[9px] h-4 px-1">+{emp.roles.length - 2}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={() => navigate(`/hr/profiles/${emp.user_id}`)}>
                      <Badge variant={emp.enabled ? 'default' : 'destructive'} className="text-[10px] h-5">
                        {emp.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground" onClick={() => navigate(`/hr/profiles/${emp.user_id}`)}>
                      {emp.profile?.email?.split('@')[0] || emp.profile?.phone || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = page < 3 ? i : page > totalPages - 3 ? totalPages - 5 + i : page - 2 + i;
                if (p < 0 || p >= totalPages) return null;
                return (
                  <Button key={p} variant={p === page ? 'default' : 'ghost'} size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setPage(p)}>
                    {p + 1}
                  </Button>
                );
              })}
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

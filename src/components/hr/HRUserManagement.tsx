import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Users, ArrowUpDown, ChevronLeft, ChevronRight, Download, CheckCircle2, XCircle, Shield, UserPlus, Plus } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { AppRole } from '@/hooks/auth/types';

const ALL_ROLES: AppRole[] = ['tenant', 'agent', 'landlord', 'supporter', 'manager', 'super_admin', 'employee', 'operations', 'ceo', 'coo', 'cfo', 'cto', 'cmo', 'crm', 'hr'];

interface UserRecord {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  verified: boolean;
  is_frozen: boolean;
  roles: { id: string; role: string; enabled: boolean }[];
}

type SortKey = 'name' | 'email' | 'status' | 'roles';
const PAGE_SIZE = 20;

export default function HRUserManagement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Add role dialog
  const [addRoleUser, setAddRoleUser] = useState<UserRecord | null>(null);
  const [newRole, setNewRole] = useState<AppRole>('employee');
  const [auditReason, setAuditReason] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['hr-system-users'],
    queryFn: async () => {
      // Fetch all profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, avatar_url, verified, is_frozen')
        .order('full_name');
      if (!profiles) return [];

      // Fetch all roles (paginate past 1000)
      const allRoles: any[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data } = await supabase.from('user_roles').select('id, user_id, role, enabled').range(offset, offset + 999);
        if (data && data.length > 0) { allRoles.push(...data); offset += 1000; hasMore = data.length === 1000; }
        else hasMore = false;
      }

      const roleMap = new Map<string, { id: string; role: string; enabled: boolean }[]>();
      allRoles.forEach((r: any) => {
        const existing = roleMap.get(r.user_id) || [];
        existing.push({ id: r.id, role: r.role, enabled: r.enabled });
        roleMap.set(r.user_id, existing);
      });

      return profiles.map((p: any): UserRecord => ({
        ...p,
        roles: roleMap.get(p.id) || [],
      }));
    },
  });

  const filtered = useMemo(() => {
    let result = users.filter(u => {
      if (roleFilter !== 'all' && !u.roles.some(r => r.role === roleFilter && r.enabled)) return false;
      if (statusFilter === 'active' && u.is_frozen) return false;
      if (statusFilter === 'frozen' && !u.is_frozen) return false;
      if (statusFilter === 'verified' && !u.verified) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (u.full_name?.toLowerCase() || '').includes(q) ||
        (u.email?.toLowerCase() || '').includes(q) ||
        (u.phone || '').includes(q) ||
        u.roles.some(r => r.role.includes(q));
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = (a.full_name || '').localeCompare(b.full_name || '');
      else if (sortKey === 'email') cmp = (a.email || '').localeCompare(b.email || '');
      else if (sortKey === 'status') cmp = (a.is_frozen === b.is_frozen ? 0 : a.is_frozen ? 1 : -1);
      else if (sortKey === 'roles') cmp = a.roles.length - b.roles.length;
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [users, search, roleFilter, statusFilter, sortKey, sortAsc]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
    setPage(0);
  };

  const totalCount = users.length;
  const frozenCount = users.filter(u => u.is_frozen).length;
  const verifiedCount = users.filter(u => u.verified).length;

  const assignRoleMutation = useMutation({
    mutationFn: async () => {
      if (!addRoleUser || !user) throw new Error('Missing data');
      if (auditReason.length < 10) throw new Error('Audit reason must be at least 10 characters');
      const { error } = await supabase.from('user_roles').insert({ user_id: addRoleUser.id, role: newRole as any });
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user.id, action_type: 'hr_role_assigned', record_id: addRoleUser.id, table_name: 'user_roles',
        metadata: { role: newRole, reason: auditReason, assigned_by: user.id },
      });
    },
    onSuccess: () => {
      toast.success(`Role "${newRole}" assigned`);
      setAddRoleUser(null); setAuditReason('');
      queryClient.invalidateQueries({ queryKey: ['hr-system-users'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleExport = () => {
    const rows = filtered.map(u => ({
      Name: u.full_name || '', Email: u.email || '', Phone: u.phone || '',
      Roles: u.roles.filter(r => r.enabled).map(r => r.role).join(', '),
      Status: u.is_frozen ? 'Frozen' : 'Active', Verified: u.verified ? 'Yes' : 'No',
    }));
    if (rows.length === 0) return;
    const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'system_users.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">System Users</h2>
        <p className="text-xs text-muted-foreground mt-0.5">View and manage all platform users with roles and permissions</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-border/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Users</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{totalCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Verified</p>
            <p className="text-2xl font-bold text-success mt-0.5">{verifiedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Frozen</p>
            <p className="text-2xl font-bold text-destructive mt-0.5">{frozenCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Active</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{totalCount - frozenCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, email, phone, role..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-9 h-9" />
        </div>
        <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ALL_ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="frozen">Frozen</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs ml-auto" onClick={handleExport} disabled={filtered.length === 0}>
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No users found</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>
                    <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                      User <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <button onClick={() => toggleSort('email')} className="flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                      Contact <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort('roles')} className="flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                      Roles <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Verified</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort('status')} className="flex items-center gap-1 hover:text-foreground transition-colors text-xs font-semibold uppercase tracking-wider">
                      Status <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map(u => (
                  <TableRow key={u.id} className={cn(u.is_frozen && "opacity-60 bg-destructive/5")}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <UserAvatar avatarUrl={u.avatar_url} fullName={u.full_name} size="sm" />
                        <span className="font-medium text-sm truncate">{u.full_name || 'Unnamed'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div>
                        <p className="text-xs text-muted-foreground truncate">{u.email || '—'}</p>
                        {u.phone && <p className="text-[10px] text-muted-foreground">{u.phone}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-0.5">
                        {u.roles.filter(r => r.enabled).slice(0, 3).map(r => (
                          <Badge key={r.id} variant="outline" className="text-[8px] h-4 px-1 capitalize">{r.role.replace('_', ' ')}</Badge>
                        ))}
                        {u.roles.filter(r => r.enabled).length > 3 && (
                          <Badge variant="secondary" className="text-[8px] h-4 px-1">+{u.roles.filter(r => r.enabled).length - 3}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.verified ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.is_frozen ? 'destructive' : 'default'} className="text-[10px]">
                        {u.is_frozen ? 'Frozen' : 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setAddRoleUser(u); setNewRole('employee'); }}>
                        <Plus className="h-3 w-3" /> Role
                      </Button>
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

      {/* Add Role Dialog */}
      <Dialog open={!!addRoleUser} onOpenChange={() => { setAddRoleUser(null); setAuditReason(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Assign Role</DialogTitle>
            <DialogDescription>Assign a role to {addRoleUser?.full_name || 'this user'}. This action is audited.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Role</Label>
              <Select value={newRole} onValueChange={v => setNewRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.filter(r => !addRoleUser?.roles.some(ur => ur.role === r)).map(r => (
                    <SelectItem key={r} value={r} className="capitalize">{r.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Audit Reason (min 10 characters)</Label>
              <Textarea value={auditReason} onChange={e => setAuditReason(e.target.value)} placeholder="Why is this role being assigned..." className="min-h-[60px] text-xs" />
              <p className="text-[10px] text-muted-foreground mt-1">{auditReason.length}/10 characters</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddRoleUser(null); setAuditReason(''); }}>Cancel</Button>
            <Button onClick={() => assignRoleMutation.mutate()} disabled={auditReason.length < 10 || assignRoleMutation.isPending}>
              {assignRoleMutation.isPending ? 'Assigning...' : 'Assign Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

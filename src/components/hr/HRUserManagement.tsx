import { useState } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Search, UserCog, Shield, ShieldOff, Plus, ChevronRight, UserPlus, History } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { cn } from '@/lib/utils';
import type { AppRole } from '@/hooks/auth/types';

const ALL_ROLES: AppRole[] = [
  'tenant', 'agent', 'landlord', 'supporter',
  'manager', 'super_admin', 'employee', 'operations',
  'ceo', 'coo', 'cfo', 'cto', 'cmo', 'crm', 'hr',
];

const INTERNAL_ROLES: AppRole[] = [
  'manager', 'super_admin', 'employee', 'operations',
  'ceo', 'coo', 'cfo', 'cto', 'cmo', 'crm', 'hr',
];

interface UserRecord {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  roles: { role: string; enabled: boolean; id: string }[];
}

export default function HRUserManagement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [addRoleDialog, setAddRoleDialog] = useState(false);
  const [newRole, setNewRole] = useState<AppRole>('employee');
  const [auditReason, setAuditReason] = useState('');
  const [toggleReason, setToggleReason] = useState('');
  const [toggleTarget, setToggleTarget] = useState<{ roleId: string; userId: string; role: string; enabled: boolean } | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['hr-all-users'],
    queryFn: async () => {
      // Get all profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, avatar_url')
        .order('full_name');

      if (!profiles) return [];

      const userIds = profiles.map((p: any) => p.id);

      // Get all roles
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('id, user_id, role, enabled')
        .in('user_id', userIds);

      const roleMap = new Map<string, { role: string; enabled: boolean; id: string }[]>();
      (roleData || []).forEach((r: any) => {
        const existing = roleMap.get(r.user_id) || [];
        existing.push({ role: r.role, enabled: r.enabled, id: r.id });
        roleMap.set(r.user_id, existing);
      });

      return profiles.map((p: any): UserRecord => ({
        ...p,
        roles: roleMap.get(p.id) || [],
      }));
    },
  });

  const { data: roleHistory = [] } = useQuery({
    queryKey: ['hr-role-history', selectedUser?.id],
    enabled: !!selectedUser,
    queryFn: async () => {
      if (!selectedUser) return [];
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('record_id', selectedUser.id)
        .in('action_type', ['hr_role_assigned', 'hr_role_toggled', 'hr_role_removed', 'role_assigned', 'role_toggled'])
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  // Assign a new role
  const assignRoleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser || !user) throw new Error('No user selected');
      if (auditReason.length < 10) throw new Error('Audit reason must be at least 10 characters');

      // Insert role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({ user_id: selectedUser.id, role: newRole as any });
      if (roleError) throw roleError;

      // Audit log
      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert({
          user_id: user.id,
          action_type: 'hr_role_assigned',
          record_id: selectedUser.id,
          table_name: 'user_roles',
          metadata: { role: newRole, reason: auditReason, assigned_by: user.id },
        });
      if (auditError) console.error('Audit log error:', auditError);
    },
    onSuccess: () => {
      toast.success(`Role "${newRole}" assigned successfully`);
      setAddRoleDialog(false);
      setAuditReason('');
      queryClient.invalidateQueries({ queryKey: ['hr-all-users'] });
      queryClient.invalidateQueries({ queryKey: ['hr-role-history', selectedUser?.id] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Toggle role enabled/disabled
  const toggleRoleMutation = useMutation({
    mutationFn: async () => {
      if (!toggleTarget || !user) throw new Error('No target');
      if (toggleReason.length < 10) throw new Error('Audit reason must be at least 10 characters');

      const { error } = await supabase
        .from('user_roles')
        .update({ enabled: !toggleTarget.enabled })
        .eq('id', toggleTarget.roleId);
      if (error) throw error;

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'hr_role_toggled',
        record_id: toggleTarget.userId,
        table_name: 'user_roles',
        metadata: {
          role: toggleTarget.role,
          new_status: !toggleTarget.enabled ? 'enabled' : 'disabled',
          reason: toggleReason,
          toggled_by: user.id,
        },
      });
    },
    onSuccess: () => {
      toast.success('Role status updated');
      setToggleTarget(null);
      setToggleReason('');
      queryClient.invalidateQueries({ queryKey: ['hr-all-users'] });
      queryClient.invalidateQueries({ queryKey: ['hr-role-history', selectedUser?.id] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.includes(q) ||
      u.roles.some(r => r.role.includes(q))
    );
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">User Management</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Manage roles, permissions & access for all platform users</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search users by name, email, phone, or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredUsers.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelectedUser(u)}
              className="w-full text-left rounded-xl border border-border/40 bg-card hover:bg-muted/30 p-3 transition-all active:scale-[0.98] touch-manipulation"
            >
              <div className="flex items-center gap-3">
                <UserAvatar avatarUrl={u.avatar_url} fullName={u.full_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{u.full_name || 'Unnamed User'}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{u.email || u.phone || u.id.slice(0, 8)}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex gap-0.5">
                    {u.roles.slice(0, 3).map((r) => (
                      <Badge
                        key={r.id}
                        variant="outline"
                        className={cn(
                          "text-[8px] h-3.5 px-1 capitalize",
                          !r.enabled && "opacity-40 line-through"
                        )}
                      >
                        {r.role.replace('_', ' ')}
                      </Badge>
                    ))}
                    {u.roles.length > 3 && (
                      <Badge variant="secondary" className="text-[8px] h-3.5 px-1">+{u.roles.length - 3}</Badge>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </div>
            </button>
          ))}
          {filteredUsers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">No users found</p>
          )}
        </div>
      )}

      {/* User Detail Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-4 w-4" />
              Manage User
            </DialogTitle>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              {/* User info */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                <UserAvatar avatarUrl={selectedUser.avatar_url} fullName={selectedUser.full_name} size="md" />
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{selectedUser.full_name || 'Unnamed'}</p>
                  <p className="text-xs text-muted-foreground truncate">{selectedUser.email}</p>
                  {selectedUser.phone && <p className="text-xs text-muted-foreground">{selectedUser.phone}</p>}
                </div>
              </div>

              {/* Current Roles */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assigned Roles</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => setAddRoleDialog(true)}
                  >
                    <Plus className="h-3 w-3" /> Add Role
                  </Button>
                </div>
                {selectedUser.roles.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No roles assigned</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedUser.roles.map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-card">
                        <div className="flex items-center gap-2">
                          {r.enabled ? (
                            <Shield className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <ShieldOff className="h-3.5 w-3.5 text-destructive" />
                          )}
                          <span className="text-sm font-medium capitalize">{r.role.replace('_', ' ')}</span>
                        </div>
                        <Button
                          size="sm"
                          variant={r.enabled ? 'destructive' : 'default'}
                          className="h-6 text-[10px] px-2"
                          onClick={() => setToggleTarget({
                            roleId: r.id,
                            userId: selectedUser.id,
                            role: r.role,
                            enabled: r.enabled,
                          })}
                        >
                          {r.enabled ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Role History */}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-2">
                  <History className="h-3 w-3" /> Role Change History
                </Label>
                {roleHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No role changes recorded</p>
                ) : (
                  <div className="space-y-1">
                    {roleHistory.map((log: any) => (
                      <div key={log.id} className="text-[10px] py-1.5 border-b border-border/20 last:border-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground capitalize">
                            {(log.action_type as string).replace(/_/g, ' ')}
                          </span>
                          <span className="text-muted-foreground">
                            {new Date(log.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {log.metadata && (
                          <p className="text-muted-foreground mt-0.5">
                            {typeof log.metadata === 'object' && (log.metadata as any).reason
                              ? (log.metadata as any).reason
                              : JSON.stringify(log.metadata).slice(0, 80)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Role Dialog */}
      <Dialog open={addRoleDialog} onOpenChange={setAddRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Assign Role
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Assigning role to: <span className="font-semibold text-foreground">{selectedUser?.full_name}</span>
            </p>
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.filter(r => !selectedUser?.roles.some(ur => ur.role === r)).map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">{r.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Audit Reason (min 10 characters)</Label>
              <Textarea
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                placeholder="Why is this role being assigned..."
                className="min-h-[60px] text-xs"
              />
              <p className="text-[10px] text-muted-foreground mt-1">{auditReason.length}/10 characters</p>
            </div>
            <Button
              onClick={() => assignRoleMutation.mutate()}
              disabled={assignRoleMutation.isPending || auditReason.length < 10}
              className="w-full"
            >
              {assignRoleMutation.isPending ? 'Assigning...' : 'Assign Role'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toggle Role Confirmation Dialog */}
      <Dialog open={!!toggleTarget} onOpenChange={(open) => !open && setToggleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {toggleTarget?.enabled ? 'Disable' : 'Enable'} Role: {toggleTarget?.role.replace('_', ' ')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              This will {toggleTarget?.enabled ? 'revoke' : 'restore'} the <span className="font-semibold capitalize">{toggleTarget?.role.replace('_', ' ')}</span> role. This action is audited.
            </p>
            <div>
              <Label className="text-xs">Audit Reason (min 10 characters)</Label>
              <Textarea
                value={toggleReason}
                onChange={(e) => setToggleReason(e.target.value)}
                placeholder="Reason for this change..."
                className="min-h-[60px] text-xs"
              />
              <p className="text-[10px] text-muted-foreground mt-1">{toggleReason.length}/10 characters</p>
            </div>
            <Button
              onClick={() => toggleRoleMutation.mutate()}
              disabled={toggleRoleMutation.isPending || toggleReason.length < 10}
              variant={toggleTarget?.enabled ? 'destructive' : 'default'}
              className="w-full"
            >
              {toggleRoleMutation.isPending ? 'Updating...' : `${toggleTarget?.enabled ? 'Disable' : 'Enable'} Role`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

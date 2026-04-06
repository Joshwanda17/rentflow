import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, type AppRole } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserAvatar } from '@/components/UserAvatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Mail, Phone, Building2, Briefcase, IdCard, Clock, Plus, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const ALL_ROLES: AppRole[] = ['manager', 'super_admin', 'employee', 'operations', 'ceo', 'coo', 'cfo', 'cto', 'cmo', 'crm', 'hr'];

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

interface Props {
  employee: EmployeeRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function HREmployeeDetailDrawer({ employee, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [addRoleDialog, setAddRoleDialog] = useState(false);
  const [newRole, setNewRole] = useState<string>('employee');
  const [auditReason, setAuditReason] = useState('');
  const [toggleTarget, setToggleTarget] = useState<RoleRecord | null>(null);
  const [toggleReason, setToggleReason] = useState('');

  const { data: roleHistory = [] } = useQuery({
    queryKey: ['hr-role-history', employee?.user_id],
    enabled: !!employee,
    queryFn: async () => {
      if (!employee) return [];
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('record_id', employee.user_id)
        .in('action_type', ['hr_role_assigned', 'hr_role_toggled', 'hr_role_removed', 'role_assigned', 'role_toggled'])
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: async () => {
      if (!employee || !user) throw new Error('No user selected');
      if (auditReason.length < 10) throw new Error('Audit reason must be at least 10 characters');

      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({ user_id: employee.user_id, role: newRole as any });
      if (roleError) throw roleError;

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'hr_role_assigned',
        record_id: employee.user_id,
        table_name: 'user_roles',
        metadata: { role: newRole, reason: auditReason, assigned_by: user.id },
      });
    },
    onSuccess: () => {
      toast.success(`Role "${newRole}" assigned`);
      setAddRoleDialog(false);
      setAuditReason('');
      queryClient.invalidateQueries({ queryKey: ['hr-employees-full'] });
      queryClient.invalidateQueries({ queryKey: ['hr-role-history', employee?.user_id] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleRoleMutation = useMutation({
    mutationFn: async () => {
      if (!toggleTarget || !user || !employee) throw new Error('No target');
      if (toggleReason.length < 10) throw new Error('Audit reason must be at least 10 characters');

      const { error } = await supabase
        .from('user_roles')
        .update({ enabled: !toggleTarget.enabled })
        .eq('id', toggleTarget.id);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'hr_role_toggled',
        record_id: employee.user_id,
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
      queryClient.invalidateQueries({ queryKey: ['hr-employees-full'] });
      queryClient.invalidateQueries({ queryKey: ['hr-role-history', employee?.user_id] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (!employee) return null;

  const existingRoles = employee.roleRecords.map(r => r.role);
  const availableRoles = ALL_ROLES.filter(r => !existingRoles.includes(r));

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <UserAvatar avatarUrl={employee.profile?.avatar_url} fullName={employee.profile?.full_name} size="lg" />
              <div>
                <SheetTitle className="text-lg">{employee.profile?.full_name || 'Unknown'}</SheetTitle>
                <SheetDescription className="text-xs">
                  {employee.staffProfile?.position || 'No position'} · {employee.staffProfile?.department || 'No dept'}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {/* Contact Info */}
          <div className="py-4 space-y-2 border-b border-border">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact</h4>
            {employee.profile?.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{employee.profile.email}</span>
              </div>
            )}
            {employee.profile?.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{employee.profile.phone}</span>
              </div>
            )}
            {employee.staffProfile?.employee_id && (
              <div className="flex items-center gap-2 text-sm">
                <IdCard className="h-3.5 w-3.5 text-muted-foreground" />
                <span>ID: {employee.staffProfile.employee_id}</span>
              </div>
            )}
            {employee.staffProfile?.department && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{employee.staffProfile.department}</span>
              </div>
            )}
            {employee.staffProfile?.position && (
              <div className="flex items-center gap-2 text-sm">
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{employee.staffProfile.position}</span>
              </div>
            )}
          </div>

          {/* Roles Management */}
          <div className="py-4 space-y-3 border-b border-border">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Shield className="h-3 w-3" /> Roles
              </h4>
              {availableRoles.length > 0 && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddRoleDialog(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Add Role
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {employee.roleRecords.map((rr) => (
                <div key={rr.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <Badge variant="outline" className={cn("capitalize text-xs", roleColors[rr.role] || '')}>
                    {rr.role.replace('_', ' ')}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[10px]", rr.enabled ? "text-success" : "text-destructive")}>
                      {rr.enabled ? 'Active' : 'Disabled'}
                    </span>
                    <Switch
                      checked={rr.enabled}
                      onCheckedChange={() => setToggleTarget(rr)}
                      className="scale-75"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Role History */}
          <div className="py-4 space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Role History
            </h4>
            {roleHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground">No role changes recorded</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {roleHistory.map((log: any) => (
                  <div key={log.id} className="p-2 rounded-lg bg-muted/20 text-xs space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">{log.action_type.replace(/_/g, ' ')}</span>
                      <span className="text-muted-foreground">{format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}</span>
                    </div>
                    {log.metadata?.role && <span className="text-muted-foreground">Role: {log.metadata.role}</span>}
                    {log.metadata?.reason && <p className="text-muted-foreground italic">"{log.metadata.reason}"</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Add Role Dialog */}
      <Dialog open={addRoleDialog} onOpenChange={setAddRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign New Role</DialogTitle>
            <DialogDescription>Add a role to {employee.profile?.full_name || 'this user'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableRoles.map(r => (
                    <SelectItem key={r} value={r} className="capitalize">{r.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Audit Reason (min 10 chars)</Label>
              <Input value={auditReason} onChange={e => setAuditReason(e.target.value)} placeholder="Reason for assigning this role..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRoleDialog(false)}>Cancel</Button>
            <Button onClick={() => assignRoleMutation.mutate()} disabled={auditReason.length < 10 || assignRoleMutation.isPending}>
              {assignRoleMutation.isPending ? 'Assigning...' : 'Assign Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toggle Role Dialog */}
      <Dialog open={!!toggleTarget} onOpenChange={() => setToggleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{toggleTarget?.enabled ? 'Disable' : 'Enable'} Role: {toggleTarget?.role}</DialogTitle>
            <DialogDescription>This action will be logged in the audit trail.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Audit Reason (min 10 chars)</Label>
            <Input value={toggleReason} onChange={e => setToggleReason(e.target.value)} placeholder="Reason for this change..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setToggleTarget(null); setToggleReason(''); }}>Cancel</Button>
            <Button
              variant={toggleTarget?.enabled ? 'destructive' : 'default'}
              onClick={() => toggleRoleMutation.mutate()}
              disabled={toggleReason.length < 10 || toggleRoleMutation.isPending}
            >
              {toggleRoleMutation.isPending ? 'Updating...' : toggleTarget?.enabled ? 'Disable' : 'Enable'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

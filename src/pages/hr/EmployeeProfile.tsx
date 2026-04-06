import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, type AppRole } from '@/hooks/useAuth';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { UserAvatar } from '@/components/UserAvatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Mail, Phone, Building2, Briefcase, IdCard, Shield, Plus, Clock, FileText, Wallet, CalendarDays, User } from 'lucide-react';
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

interface RoleRecord { id: string; role: string; enabled: boolean; }

export default function HREmployeeProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [addRoleDialog, setAddRoleDialog] = useState(false);
  const [newRole, setNewRole] = useState<string>('employee');
  const [auditReason, setAuditReason] = useState('');
  const [toggleTarget, setToggleTarget] = useState<RoleRecord | null>(null);
  const [toggleReason, setToggleReason] = useState('');

  // Fetch employee data
  const { data: employee, isLoading } = useQuery({
    queryKey: ['hr-employee-profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: roleData }, { data: profile }, { data: staffProfile }] = await Promise.all([
        supabase.from('user_roles').select('id, user_id, role, enabled').eq('user_id', userId!),
        supabase.from('profiles').select('*').eq('id', userId!).maybeSingle(),
        supabase.from('staff_profiles').select('*').eq('user_id', userId!).maybeSingle(),
      ]);

      const roles = (roleData || []).map((r: any) => r.role);
      const roleRecords = (roleData || []).map((r: any) => ({ id: r.id, role: r.role, enabled: r.enabled }));
      const enabled = roleRecords.every(r => r.enabled);

      return { user_id: userId!, roles, roleRecords, enabled, profile, staffProfile };
    },
  });

  // Role history
  const { data: roleHistory = [] } = useQuery({
    queryKey: ['hr-role-history', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('record_id', userId!)
        .in('action_type', ['hr_role_assigned', 'hr_role_toggled', 'hr_role_removed', 'role_assigned', 'role_toggled'])
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  // Leave requests
  const { data: leaveRequests = [] } = useQuery({
    queryKey: ['hr-employee-leaves', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  // Earnings summary
  const { data: earnings = [] } = useQuery({
    queryKey: ['hr-employee-earnings', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_earnings')
        .select('*')
        .eq('agent_id', userId!)
        .order('created_at', { ascending: false })
        .limit(30);
      return data || [];
    },
  });

  // Audit trail for this user
  const { data: auditLogs = [] } = useQuery({
    queryKey: ['hr-employee-audit', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .or(`record_id.eq.${userId},user_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: async () => {
      if (!userId || !user) throw new Error('No user selected');
      if (auditReason.length < 10) throw new Error('Audit reason must be at least 10 characters');
      const { error: roleError } = await supabase.from('user_roles').insert({ user_id: userId, role: newRole as any });
      if (roleError) throw roleError;
      await supabase.from('audit_logs').insert({
        user_id: user.id, action_type: 'hr_role_assigned', record_id: userId, table_name: 'user_roles',
        metadata: { role: newRole, reason: auditReason, assigned_by: user.id },
      });
    },
    onSuccess: () => {
      toast.success(`Role "${newRole}" assigned`);
      setAddRoleDialog(false);
      setAuditReason('');
      queryClient.invalidateQueries({ queryKey: ['hr-employee-profile', userId] });
      queryClient.invalidateQueries({ queryKey: ['hr-role-history', userId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleRoleMutation = useMutation({
    mutationFn: async () => {
      if (!toggleTarget || !user || !userId) throw new Error('No target');
      if (toggleReason.length < 10) throw new Error('Audit reason must be at least 10 characters');
      const { error } = await supabase.from('user_roles').update({ enabled: !toggleTarget.enabled }).eq('id', toggleTarget.id);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user.id, action_type: 'hr_role_toggled', record_id: userId, table_name: 'user_roles',
        metadata: { role: toggleTarget.role, new_status: !toggleTarget.enabled ? 'enabled' : 'disabled', reason: toggleReason, toggled_by: user.id },
      });
    },
    onSuccess: () => {
      toast.success('Role status updated');
      setToggleTarget(null);
      setToggleReason('');
      queryClient.invalidateQueries({ queryKey: ['hr-employee-profile', userId] });
      queryClient.invalidateQueries({ queryKey: ['hr-role-history', userId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const totalEarnings = earnings.reduce((sum, e) => sum + (e.amount || 0), 0);
  const existingRoles = employee?.roleRecords.map(r => r.role) || [];
  const availableRoles = ALL_ROLES.filter(r => !existingRoles.includes(r));

  return (
    <ExecutiveDashboardLayout role="hr" activeTab="employees" onTabChange={() => {}}>
      {/* Back button + Header */}
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/hr/dashboard')} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Directory
        </Button>

        {isLoading ? (
          <div className="space-y-4">
            <div className="h-32 rounded-xl bg-muted/30 animate-pulse" />
            <div className="h-64 rounded-xl bg-muted/30 animate-pulse" />
          </div>
        ) : !employee ? (
          <div className="text-center py-16">
            <User className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Employee not found</p>
          </div>
        ) : (
          <>
            {/* Profile Header Card */}
            <Card className="border-border/40">
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <UserAvatar avatarUrl={employee.profile?.avatar_url} fullName={employee.profile?.full_name} size="lg" />
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-bold text-foreground">{employee.profile?.full_name || 'Unknown'}</h1>
                    <p className="text-sm text-muted-foreground">{employee.staffProfile?.position || 'No position'} · {employee.staffProfile?.department || 'No department'}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {employee.roleRecords.map(rr => (
                        <Badge key={rr.id} variant="outline" className={cn("text-[10px] capitalize", roleColors[rr.role] || '')}>
                          {rr.role.replace('_', ' ')} {!rr.enabled && '(disabled)'}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    {employee.profile?.email && (
                      <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{employee.profile.email}</span>
                    )}
                    {employee.profile?.phone && (
                      <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{employee.profile.phone}</span>
                    )}
                    {employee.staffProfile?.employee_id && (
                      <span className="flex items-center gap-1.5"><IdCard className="h-3.5 w-3.5" />ID: {employee.staffProfile.employee_id}</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="overview" className="gap-1.5"><User className="h-3.5 w-3.5" /> Overview</TabsTrigger>
                <TabsTrigger value="roles" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Roles</TabsTrigger>
                <TabsTrigger value="payroll" className="gap-1.5"><Wallet className="h-3.5 w-3.5" /> Payroll</TabsTrigger>
                <TabsTrigger value="leaves" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Leaves</TabsTrigger>
                <TabsTrigger value="audit" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Audit Trail</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Earnings</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">USh {totalEarnings.toLocaleString()}</p></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active Roles</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{employee.roleRecords.filter(r => r.enabled).length}</p></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Leave Requests</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{leaveRequests.length}</p></CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Basic Details</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Full Name:</span> <span className="font-medium ml-1">{employee.profile?.full_name || '—'}</span></div>
                    <div><span className="text-muted-foreground">Email:</span> <span className="font-medium ml-1">{employee.profile?.email || '—'}</span></div>
                    <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium ml-1">{employee.profile?.phone || '—'}</span></div>
                    <div><span className="text-muted-foreground">Employee ID:</span> <span className="font-medium ml-1">{employee.staffProfile?.employee_id || '—'}</span></div>
                    <div><span className="text-muted-foreground">Department:</span> <span className="font-medium ml-1">{employee.staffProfile?.department || '—'}</span></div>
                    <div><span className="text-muted-foreground">Position:</span> <span className="font-medium ml-1">{employee.staffProfile?.position || '—'}</span></div>
                    <div><span className="text-muted-foreground">Verified:</span> <span className="font-medium ml-1">{employee.profile?.verified ? 'Yes' : 'No'}</span></div>
                    <div><span className="text-muted-foreground">Status:</span> <Badge variant={employee.enabled ? 'default' : 'destructive'} className="ml-1 text-[10px] h-5">{employee.enabled ? 'Active' : 'Disabled'}</Badge></div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Roles Tab */}
              <TabsContent value="roles" className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Assigned Roles</h3>
                  {availableRoles.length > 0 && (
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setAddRoleDialog(true)}>
                      <Plus className="h-3 w-3" /> Add Role
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {employee.roleRecords.map(rr => (
                    <Card key={rr.id} className="border-border/40">
                      <CardContent className="p-3 flex items-center justify-between">
                        <Badge variant="outline" className={cn("capitalize text-xs", roleColors[rr.role] || '')}>
                          {rr.role.replace('_', ' ')}
                        </Badge>
                        <div className="flex items-center gap-3">
                          <span className={cn("text-xs", rr.enabled ? "text-success" : "text-destructive")}>{rr.enabled ? 'Active' : 'Disabled'}</span>
                          <Switch checked={rr.enabled} onCheckedChange={() => setToggleTarget(rr)} />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Role History */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Role Change History</h3>
                  {roleHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No role changes recorded</p>
                  ) : (
                    <div className="space-y-1.5">
                      {roleHistory.map((log: any) => (
                        <Card key={log.id} className="border-border/30">
                          <CardContent className="p-3 text-xs space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="font-medium capitalize">{log.action_type.replace(/_/g, ' ')}</span>
                              <span className="text-muted-foreground">{format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}</span>
                            </div>
                            {log.metadata?.role && <span className="text-muted-foreground">Role: {log.metadata.role}</span>}
                            {log.metadata?.reason && <p className="text-muted-foreground italic">"{log.metadata.reason}"</p>}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Payroll Tab */}
              <TabsContent value="payroll" className="space-y-4 mt-4">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Earnings History</CardTitle></CardHeader>
                  <CardContent>
                    {earnings.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">No earnings records found</p>
                    ) : (
                      <div className="space-y-2">
                        {earnings.map((e: any) => (
                          <div key={e.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 text-sm">
                            <div>
                              <p className="font-medium capitalize">{e.earning_type.replace(/_/g, ' ')}</p>
                              {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">USh {e.amount.toLocaleString()}</p>
                              <p className="text-[10px] text-muted-foreground">{format(new Date(e.created_at), 'dd MMM yyyy')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Leaves Tab */}
              <TabsContent value="leaves" className="space-y-4 mt-4">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Leave Requests</CardTitle></CardHeader>
                  <CardContent>
                    {leaveRequests.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">No leave requests found</p>
                    ) : (
                      <div className="space-y-2">
                        {leaveRequests.map((l: any) => (
                          <div key={l.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 text-sm">
                            <div>
                              <p className="font-medium capitalize">{l.leave_type?.replace(/_/g, ' ') || 'Leave'}</p>
                              <p className="text-xs text-muted-foreground">{l.start_date} → {l.end_date}</p>
                            </div>
                            <Badge variant={l.status === 'approved' ? 'default' : l.status === 'rejected' ? 'destructive' : 'secondary'} className="text-[10px]">
                              {l.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Audit Trail Tab */}
              <TabsContent value="audit" className="space-y-4 mt-4">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Audit Trail</CardTitle></CardHeader>
                  <CardContent>
                    {auditLogs.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">No audit logs found</p>
                    ) : (
                      <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                        {auditLogs.map((log: any) => (
                          <div key={log.id} className="p-2.5 rounded-lg bg-muted/20 text-xs space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="font-medium capitalize">{log.action_type.replace(/_/g, ' ')}</span>
                              <span className="text-muted-foreground">{format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}</span>
                            </div>
                            {log.table_name && <span className="text-muted-foreground">Table: {log.table_name}</span>}
                            {log.metadata?.reason && <p className="text-muted-foreground italic">"{log.metadata.reason}"</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Add Role Dialog */}
      <Dialog open={addRoleDialog} onOpenChange={setAddRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign New Role</DialogTitle>
            <DialogDescription>Add a role to {employee?.profile?.full_name || 'this user'}</DialogDescription>
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
    </ExecutiveDashboardLayout>
  );
}

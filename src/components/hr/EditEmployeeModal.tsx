import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Pencil, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppRole } from '@/hooks/auth/types';

const ALL_STAFF_ROLES: AppRole[] = ['employee', 'manager', 'super_admin', 'operations', 'ceo', 'coo', 'cfo', 'cto', 'cmo', 'crm', 'hr'];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: {
    user_id: string;
    roles: string[];
    profile: { full_name: string | null } | null;
    staffProfile: { employee_id: string | null; department: string | null; position: string | null } | null;
  };
}

export function EditEmployeeModal({ open, onOpenChange, employee }: Props) {
  const qc = useQueryClient();
  const [jobTitle, setJobTitle] = useState(employee.staffProfile?.position || '');
  const [department, setDepartment] = useState(employee.staffProfile?.department || '');
  const [newRole, setNewRole] = useState('');
  const [saving, setSaving] = useState(false);

  const currentRoles = employee.roles;

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update staff_profiles
      await (supabase.from('staff_profiles' as any).update({
        position: jobTitle.trim() || null,
        department: department.trim() || null,
        job_title: jobTitle.trim() || null,
      } as any).eq('user_id', employee.user_id) as any);

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: employee.user_id,
        action_type: 'employee_profile_updated',
        metadata: { job_title: jobTitle, department, updated_fields: ['position', 'department', 'job_title'] },
      });

      toast.success('Employee profile updated');
      qc.invalidateQueries({ queryKey: ['hr-employees-full'] });
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRole = async () => {
    if (!newRole) return;
    setSaving(true);
    try {
      await (supabase.from('user_roles').insert({
        user_id: employee.user_id,
        role: newRole,
      } as any) as any);

      await supabase.from('audit_logs').insert({
        user_id: employee.user_id,
        action_type: 'role_granted_by_hr',
        metadata: { role: newRole },
      });

      toast.success(`Role "${newRole}" granted`);
      setNewRole('');
      qc.invalidateQueries({ queryKey: ['hr-employees-full'] });
    } catch (e: any) {
      if (e?.code === '23505') toast.error('Role already assigned');
      else toast.error('Failed to add role');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveRole = async (role: string) => {
    if (currentRoles.length <= 1) { toast.error('Cannot remove the last role'); return; }
    setSaving(true);
    try {
      await (supabase.from('user_roles').delete().eq('user_id', employee.user_id).eq('role', role as any) as any);

      await supabase.from('audit_logs').insert({
        user_id: employee.user_id,
        action_type: 'role_removed_by_hr',
        metadata: { role },
      });

      toast.success(`Role "${role}" removed`);
      qc.invalidateQueries({ queryKey: ['hr-employees-full'] });
    } catch {
      toast.error('Failed to remove role');
    } finally {
      setSaving(false);
    }
  };

  const availableRoles = ALL_STAFF_ROLES.filter(r => !currentRoles.includes(r));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Edit {employee.profile?.full_name || 'Employee'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Job Title / Position</Label>
            <Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Senior Developer" className="h-10" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Department</Label>
            <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Engineering" className="h-10" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Current Roles</Label>
            <div className="flex flex-wrap gap-1.5">
              {currentRoles.map(role => (
                <Badge key={role} variant="secondary" className="text-xs capitalize gap-1 pr-1">
                  {role.replace('_', ' ')}
                  <button onClick={() => handleRemoveRole(role)} className="ml-0.5 hover:text-destructive" disabled={saving}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {availableRoles.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="flex-1 h-9">
                  <SelectValue placeholder="Add role..." />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map(r => (
                    <SelectItem key={r} value={r} className="capitalize">{r.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleAddRole} disabled={!newRole || saving} className="h-9">
                Add
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

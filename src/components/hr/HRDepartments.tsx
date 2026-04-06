import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Plus, Edit2, Building2, Users, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Department {
  id: string;
  name: string;
  description: string | null;
  head_user_id: string | null;
  is_active: boolean;
  created_at: string;
}

export default function HRDepartments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: async () => {
      const { data } = await supabase
        .from('departments')
        .select('*')
        .order('name');
      return (data || []) as Department[];
    },
  });

  // Count employees per department from staff_profiles
  const { data: deptCounts = {} } = useQuery({
    queryKey: ['hr-dept-employee-counts'],
    queryFn: async () => {
      const { data } = await supabase.from('staff_profiles').select('department');
      const counts: Record<string, number> = {};
      (data || []).forEach((s: any) => {
        if (s.department) counts[s.department] = (counts[s.department] || 0) + 1;
      });
      return counts;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Name is required');
      if (!user) throw new Error('Not authenticated');

      if (editId) {
        const { error } = await supabase.from('departments').update({ name: name.trim(), description: description.trim() || null }).eq('id', editId);
        if (error) throw error;
        await supabase.from('audit_logs').insert({
          user_id: user.id, action_type: 'hr_department_updated', table_name: 'departments', record_id: editId,
          metadata: { name: name.trim(), reason: 'HR department update' },
        });
      } else {
        const { error } = await supabase.from('departments').insert({ name: name.trim(), description: description.trim() || null });
        if (error) throw error;
        await supabase.from('audit_logs').insert({
          user_id: user.id, action_type: 'hr_department_created', table_name: 'departments', record_id: name.trim(),
          metadata: { name: name.trim(), reason: 'HR department creation' },
        });
      }
    },
    onSuccess: () => {
      toast.success(editId ? 'Department updated' : 'Department created');
      closeDialog();
      queryClient.invalidateQueries({ queryKey: ['hr-departments'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('departments').update({ is_active: active }).eq('id', id);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user.id, action_type: active ? 'hr_department_activated' : 'hr_department_deactivated',
        table_name: 'departments', record_id: id,
        metadata: { reason: `Department ${active ? 'activated' : 'deactivated'} by HR` },
      });
    },
    onSuccess: () => {
      toast.success('Department status updated');
      queryClient.invalidateQueries({ queryKey: ['hr-departments'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
    setName('');
    setDescription('');
  };

  const openEdit = (dept: Department) => {
    setEditId(dept.id);
    setName(dept.name);
    setDescription(dept.description || '');
    setDialogOpen(true);
  };

  const filtered = departments.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Departments</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Manage organizational departments</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setEditId(null); setName(''); setDescription(''); setDialogOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> Add Department
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="border-border/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{departments.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Active</p>
            <p className="text-2xl font-bold text-success mt-0.5">{departments.filter(d => d.is_active).length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Inactive</p>
            <p className="text-2xl font-bold text-destructive mt-0.5">{departments.filter(d => !d.is_active).length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Input placeholder="Search departments..." value={search} onChange={e => setSearch(e.target.value)} className="h-9" />

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No departments found</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Name</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Description</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-center">Employees</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(dept => (
                <TableRow key={dept.id}>
                  <TableCell className="font-medium text-sm">{dept.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{dept.description || '—'}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-xs">{deptCounts[dept.name] || 0}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={dept.is_active ? 'default' : 'destructive'} className="text-[10px]">
                      {dept.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(dept)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0"
                        onClick={() => toggleMutation.mutate({ id: dept.id, active: !dept.is_active })}
                      >
                        {dept.is_active ? <Trash2 className="h-3.5 w-3.5 text-destructive" /> : <Building2 className="h-3.5 w-3.5 text-success" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Department' : 'Create Department'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Department Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Engineering, Marketing..." />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description..." className="min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : editId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AlertTriangle, Plus } from 'lucide-react';

export default function HRDisciplinary() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', action_type: 'verbal_warning', severity: 'low', description: '' });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['hr-disciplinary'],
    queryFn: async () => {
      const { data } = await supabase
        .from('disciplinary_records')
        .select('*, profiles:employee_id(full_name)')
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ['hr-staff-list'],
    queryFn: async () => {
      const { data } = await supabase.from('staff_profiles').select('user_id, profiles:user_id(full_name)');
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (form.description.length < 10) throw new Error('Description must be at least 10 characters');
      if (!form.employee_id) throw new Error('Select an employee');
      const { error } = await supabase.from('disciplinary_records').insert({
        employee_id: form.employee_id,
        action_type: form.action_type as any,
        severity: form.severity,
        description: form.description,
        issued_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Disciplinary record created');
      setOpen(false);
      setForm({ employee_id: '', action_type: 'verbal_warning', severity: 'low', description: '' });
      queryClient.invalidateQueries({ queryKey: ['hr-disciplinary'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const severityColors: Record<string, string> = {
    low: 'bg-muted text-muted-foreground',
    medium: 'bg-warning/20 text-warning',
    high: 'bg-destructive/20 text-destructive',
    critical: 'bg-destructive text-destructive-foreground',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Disciplinary Records</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-3 w-3" /> New Record</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Issue Disciplinary Action</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Employee</Label>
                <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {staffList.map((s: any) => (
                      <SelectItem key={s.user_id} value={s.user_id}>{s.profiles?.full_name || s.user_id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Action Type</Label>
                  <Select value={form.action_type} onValueChange={(v) => setForm({ ...form, action_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="verbal_warning">Verbal Warning</SelectItem>
                      <SelectItem value="written_warning">Written Warning</SelectItem>
                      <SelectItem value="suspension">Suspension</SelectItem>
                      <SelectItem value="probation">Probation</SelectItem>
                      <SelectItem value="termination">Termination</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Severity</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Description (min 10 chars)</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe the incident and action taken..."
                  className="min-h-[80px]"
                />
              </div>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="w-full">
                Issue Action
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No disciplinary records</p>
      ) : (
        <div className="space-y-2">
          {records.map((rec: any) => (
            <Card key={rec.id} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{rec.profiles?.full_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{rec.action_type?.replace(/_/g, ' ')}</p>
                  </div>
                  <div className="flex gap-1">
                    <Badge className={severityColors[rec.severity] || ''} variant="outline">{rec.severity}</Badge>
                    <Badge variant="outline">{rec.status}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{rec.description}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  Effective: {new Date(rec.effective_date).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

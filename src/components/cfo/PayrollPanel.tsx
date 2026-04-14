import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Banknote, Plus, Play, Loader2, CheckCircle2, Users, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

export function PayrollPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [empPhone, setEmpPhone] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  const [itemCategory, setItemCategory] = useState('salary');
  const [itemDesc, setItemDesc] = useState('');
  const currentMonth = format(new Date(), 'yyyy-MM');

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['payroll-batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: batchItems = [] } = useQuery({
    queryKey: ['payroll-items', selectedBatch?.id],
    enabled: !!selectedBatch,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_items')
        .select('*, profiles:employee_id(full_name, phone)')
        .eq('batch_id', selectedBatch.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const createBatchMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('payroll_batches').insert({
        batch_month: currentMonth,
        created_by: user!.id,
      }).select().single();
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: user!.id,
        action_type: 'cfo_payroll_batch_created',
        table_name: 'payroll_batches',
        record_id: data.id,
        metadata: { batch_month: currentMonth },
      });
    },
    onSuccess: () => {
      toast({ title: '✅ Payroll batch created' });
      qc.invalidateQueries({ queryKey: ['payroll-batches'] });
      setShowCreate(false);
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async () => {
      const cleaned = empPhone.replace(/\D/g, '');
      const last9 = cleaned.slice(-9);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').ilike('phone', `%${last9}`).limit(1);
      if (!profiles?.length) throw new Error('Employee not found');

      const amt = parseFloat(itemAmount);
      if (!amt || amt <= 0) throw new Error('Invalid amount');

      const { error } = await supabase.from('payroll_items').insert({
        batch_id: selectedBatch.id,
        employee_id: profiles[0].id,
        amount: amt,
        category: itemCategory,
        description: itemDesc || `${itemCategory} for ${format(new Date(), 'MMMM yyyy')}`,
      });
      if (error) throw error;

      // Update batch totals
      await supabase.from('payroll_batches').update({
        total_amount: (selectedBatch.total_amount || 0) + amt,
        total_employees: (selectedBatch.total_employees || 0) + 1,
      }).eq('id', selectedBatch.id);
    },
    onSuccess: () => {
      toast({ title: '✅ Employee added to payroll' });
      qc.invalidateQueries({ queryKey: ['payroll-items', selectedBatch?.id] });
      qc.invalidateQueries({ queryKey: ['payroll-batches'] });
      setEmpPhone('');
      setItemAmount('');
      setItemDesc('');
      setShowAddItem(false);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const processMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const { data, error } = await supabase.functions.invoke('platform-expense-transfer', {
        body: { action: 'process_payroll', batch_id: batchId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await supabase.from('audit_logs').insert({
        user_id: user!.id,
        action_type: 'cfo_payroll_processed',
        table_name: 'payroll_batches',
        record_id: batchId,
        metadata: {
          batch_month: selectedBatch?.batch_month,
          total_amount: selectedBatch?.total_amount,
          total_employees: selectedBatch?.total_employees,
        },
      });

      return data;
    },
    onSuccess: (data) => {
      toast({ title: '✅ Payroll processed', description: data?.message });
      qc.invalidateQueries({ queryKey: ['payroll-batches'] });
      qc.invalidateQueries({ queryKey: ['payroll-items', selectedBatch?.id] });
      qc.invalidateQueries({ queryKey: ['cfo-actions-log'] });
    },
    onError: (e: any) => toast({ title: 'Payroll failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Banknote className="h-5 w-5 text-primary" />
          Payroll & Advances
        </h2>
        <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> New Batch
        </Button>
      </div>

      {/* Create Batch Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Create Payroll Batch</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Month: <strong>{currentMonth}</strong></p>
          <Button className="w-full" onClick={() => createBatchMutation.mutate()} disabled={createBatchMutation.isPending}>
            Create Batch
          </Button>
        </DialogContent>
      </Dialog>

      {/* Batches */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : batches.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No payroll batches yet</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {batches.map((b: any) => (
            <Card key={b.id} className={selectedBatch?.id === b.id ? 'ring-2 ring-primary' : ''}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-semibold text-sm">{b.batch_month}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.total_employees} staff • UGX {Number(b.total_amount || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={b.status === 'completed' ? 'default' : b.status === 'draft' ? 'secondary' : 'outline'}>
                      {b.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {b.status}
                    </Badge>
                    {b.status === 'draft' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => { setSelectedBatch(b); setShowAddItem(true); }}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" onClick={() => { setSelectedBatch(b); processMutation.mutate(b.id); }} disabled={processMutation.isPending}>
                          {processMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setSelectedBatch(selectedBatch?.id === b.id ? null : b)}>
                      <Users className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Items for selected batch */}
                {selectedBatch?.id === b.id && batchItems.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t pt-2">
                    {batchItems.map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between text-xs">
                        <div>
                          <p className="font-medium">{item.profiles?.full_name || 'Unknown'}</p>
                          <p className="text-muted-foreground">{item.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">UGX {Number(item.amount).toLocaleString()}</p>
                          <Badge variant={item.status === 'paid' ? 'default' : 'outline'} className="text-[9px]">
                            {item.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Item Dialog */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add to Payroll</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee Phone</Label>
              <Input placeholder="0771234567" value={empPhone} onChange={e => setEmpPhone(e.target.value)} />
            </div>
            <div>
              <Label>Amount (UGX)</Label>
              <Input type="number" placeholder="500000" value={itemAmount} onChange={e => setItemAmount(e.target.value)} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={itemCategory} onValueChange={setItemCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="salary">💰 Salary</SelectItem>
                  <SelectItem value="advance">⚡ Advance</SelectItem>
                  <SelectItem value="bonus">🎁 Bonus</SelectItem>
                  <SelectItem value="allowance">📋 Allowance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Input placeholder="March 2026 salary" value={itemDesc} onChange={e => setItemDesc(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => addItemMutation.mutate()} disabled={addItemMutation.isPending || !empPhone || !itemAmount}>
              {addItemMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add Employee
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

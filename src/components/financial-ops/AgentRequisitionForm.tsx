import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FileText, Send, Loader2, Clock, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';

const PURPOSE_OPTIONS = [
  { value: 'operations', label: 'Operations' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'research_development', label: 'R&D' },
  { value: 'salaries', label: 'Salaries' },
  { value: 'agent_advances', label: 'Agent Advances' },
  { value: 'employee_advances', label: 'Employee Advances' },
  { value: 'general', label: 'General' },
];

const statusBadge = (status: string) => {
  switch (status) {
    case 'pending':
      return <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-300"><Clock className="h-3 w-3" />Pending</Badge>;
    case 'approved':
      return <Badge variant="outline" className="gap-1 text-green-600 border-green-300"><CheckCircle className="h-3 w-3" />Approved</Badge>;
    case 'rejected':
      return <Badge variant="outline" className="gap-1 text-destructive border-destructive/30"><XCircle className="h-3 w-3" />Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export function AgentRequisitionForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [description, setDescription] = useState('');

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['agent-requisitions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('pending_wallet_operations')
        .select('*')
        .eq('user_id', user.id)
        .eq('category', 'agent_requisition')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error('Invalid amount');
      if (!purpose) throw new Error('Purpose is required');
      if (description.trim().length < 10) throw new Error('Description must be at least 10 characters');

      const { error } = await supabase.from('pending_wallet_operations').insert({
        user_id: user.id,
        amount: parsedAmount,
        category: 'agent_requisition',
        operation_type: 'agent_requisition',
        status: 'pending',
        description: `Fund requisition: ${PURPOSE_OPTIONS.find(p => p.value === purpose)?.label || purpose}`,
        metadata: { purpose, description: description.trim() },
      });
      if (error) throw error;

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'requisition_submitted',
        description: `Submitted fund requisition of USh ${parsedAmount.toLocaleString()} for ${purpose}`,
        metadata: { amount: parsedAmount, purpose, description: description.trim() },
      });

      // Notify managers (CFO)
      await supabase.from('notifications').insert({
        user_id: user.id,
        title: 'New Fund Requisition',
        message: `Fund requisition of USh ${parsedAmount.toLocaleString()} submitted for ${purpose}`,
        type: 'approval_required',
        metadata: { category: 'agent_requisition', amount: parsedAmount, purpose },
      });
    },
    onSuccess: () => {
      toast.success('Requisition submitted for CFO approval');
      setAmount('');
      setPurpose('');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ['agent-requisitions'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" />
            Submit Fund Requisition
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Amount (UGX)</Label>
            <Input
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min="1"
            />
          </div>
          <div>
            <Label>Purpose</Label>
            <Select value={purpose} onValueChange={setPurpose}>
              <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
              <SelectContent>
                {PURPOSE_OPTIONS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description (min 10 characters)</Label>
            <Textarea
              placeholder="Describe what the funds will be used for..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">{description.trim().length}/10 minimum</p>
          </div>
          <Button
            className="w-full gap-2"
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !amount || !purpose || description.trim().length < 10}
          >
            {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit Requisition
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My Requisitions</CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No requisitions yet</p>
          ) : (
            <div className="space-y-3">
              {history.map((req: any) => {
                const meta = typeof req.metadata === 'object' ? req.metadata : {};
                return (
                  <div key={req.id} className="flex items-start justify-between p-3 rounded-lg border bg-card">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">USh {Number(req.amount).toLocaleString()}</span>
                        {statusBadge(req.status)}
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">{meta.purpose || 'N/A'}</p>
                      <p className="text-xs text-muted-foreground truncate">{meta.description || req.description}</p>
                      <p className="text-[10px] text-muted-foreground">{format(new Date(req.created_at), 'MMM d, yyyy HH:mm')}</p>
                      {req.status === 'rejected' && req.rejection_reason && (
                        <p className="text-xs text-destructive mt-1">Reason: {req.rejection_reason}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

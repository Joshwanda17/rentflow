import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, User, Clock, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

interface EditHistoryEntry {
  id: string;
  action_type: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  performed_by: string;
  reason: string | null;
  manager_name?: string;
}

interface InvestmentEditHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | null;
  accountName: string;
}

export function InvestmentEditHistoryDialog({
  open,
  onOpenChange,
  accountId,
  accountName
}: InvestmentEditHistoryDialogProps) {
  const [history, setHistory] = useState<EditHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && accountId) {
      fetchHistory();
    }
  }, [open, accountId]);

  const fetchHistory = async () => {
    if (!accountId) return;
    
    setLoading(true);
    
    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('record_id', accountId)
      .eq('table_name', 'investment_accounts')
      .order('created_at', { ascending: false });

    if (error || !logs) {
      setLoading(false);
      return;
    }

    // Get manager names
    const managerIds = [...new Set(logs.map(l => l.performed_by))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', managerIds);

    const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

    const enrichedHistory = logs.map(log => ({
      ...log,
      old_values: log.old_values as Record<string, unknown> | null,
      new_values: log.new_values as Record<string, unknown> | null,
      manager_name: profileMap.get(log.performed_by) || 'Unknown Manager'
    }));

    setHistory(enrichedHistory);
    setLoading(false);
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'approve':
        return <Badge className="bg-success/20 text-success border-success/30">Approved</Badge>;
      case 'reject':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Rejected</Badge>;
      case 'edit':
        return <Badge className="bg-primary/20 text-primary border-primary/30">Edited</Badge>;
      case 'fund':
        return <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30">Funded</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  const renderChanges = (entry: EditHistoryEntry) => {
    const oldVals = entry.old_values || {};
    const newVals = entry.new_values || {};
    
    const changedKeys = [...new Set([...Object.keys(oldVals), ...Object.keys(newVals)])];
    
    return changedKeys.map(key => {
      const oldVal = oldVals[key];
      const newVal = newVals[key];
      
      if (oldVal === newVal) return null;
      
      return (
        <div key={key} className="flex items-center gap-2 text-xs py-1">
          <span className="text-muted-foreground font-medium capitalize">{key.replace(/_/g, ' ')}:</span>
          {oldVal !== undefined && (
            <span className="text-destructive/80 line-through">{String(oldVal)}</span>
          )}
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="text-success font-medium">{String(newVal)}</span>
        </div>
      );
    }).filter(Boolean);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Edit History
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Changes made to <strong>{accountName}</strong>
          </p>
          
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading history...
            </div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No edit history found
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {history.map((entry) => (
                  <div 
                    key={entry.id} 
                    className="p-3 rounded-xl bg-muted/50 border space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {getActionBadge(entry.action_type)}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium">{entry.manager_name}</span>
                    </div>
                    
                    {entry.reason && (
                      <p className="text-xs text-muted-foreground italic">
                        "{entry.reason}"
                      </p>
                    )}
                    
                    {(entry.old_values || entry.new_values) && (
                      <div className="pt-2 border-t border-border/50">
                        {renderChanges(entry)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
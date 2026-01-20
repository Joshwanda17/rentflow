import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Edit2, Wallet } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EditInvestmentAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: {
    id: string;
    name: string;
    color: string;
    balance: number;
    user_id: string;
    user_name?: string;
  } | null;
  onSuccess: () => void;
}

const colorOptions = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-500' },
];

export function EditInvestmentAccountDialog({
  open,
  onOpenChange,
  account,
  onSuccess
}: EditInvestmentAccountDialogProps) {
  const [name, setName] = useState(account?.name || '');
  const [color, setColor] = useState(account?.color || 'blue');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Update local state when account changes
  useState(() => {
    if (account) {
      setName(account.name);
      setColor(account.color);
    }
  });

  const handleSave = async () => {
    if (!account || !name.trim()) return;

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const oldValues = { name: account.name, color: account.color };
      const newValues = { name: name.trim(), color };

      // Check if anything changed
      if (oldValues.name === newValues.name && oldValues.color === newValues.color) {
        toast({ title: 'No changes', description: 'No changes were made' });
        handleClose();
        return;
      }

      // Update the account
      const { error: updateError } = await supabase
        .from('investment_accounts')
        .update({
          name: newValues.name,
          color: newValues.color,
          updated_at: new Date().toISOString()
        })
        .eq('id', account.id);

      if (updateError) throw updateError;

      // Log to audit
      await supabase.from('audit_logs').insert({
        record_id: account.id,
        table_name: 'investment_accounts',
        action_type: 'edit',
        performed_by: user?.id,
        old_values: oldValues,
        new_values: newValues,
        reason: reason || 'Account details updated by manager'
      });

      // Notify the supporter
      const changes: string[] = [];
      if (oldValues.name !== newValues.name) changes.push(`name to "${newValues.name}"`);
      if (oldValues.color !== newValues.color) changes.push(`color to ${newValues.color}`);

      await supabase.from('notifications').insert({
        user_id: account.user_id,
        title: '📝 Account Updated',
        message: `Your investment account has been updated: ${changes.join(', ')}.`,
        type: 'info',
        metadata: { account_id: account.id, changes, reason }
      });

      toast({ title: '✅ Account Updated', description: 'Changes saved successfully' });
      handleClose();
      onSuccess();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName(account?.name || '');
    setColor(account?.color || 'blue');
    setReason('');
    onOpenChange(false);
  };

  // Reset form when account changes
  if (account && (name !== account.name && name === '') || (account && color !== account.color && color === 'blue')) {
    setName(account.name);
    setColor(account.color);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="h-5 w-5 text-primary" />
            Edit Investment Account
          </DialogTitle>
        </DialogHeader>

        {account && (
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Owner</p>
                <p className="font-medium">{account.user_name}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-name">Account Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Investment account name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-color">Account Color</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a color" />
                </SelectTrigger>
                <SelectContent>
                  {colorOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${c.class}`} />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-reason">Reason for Edit (Optional)</Label>
              <Textarea
                id="edit-reason"
                placeholder="Why are you making this change?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                This will be recorded in the edit history
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || !name.trim()}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Edit2 className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

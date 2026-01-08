import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { UserMinus, Loader2, ShieldX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type AppRole = 'tenant' | 'agent' | 'landlord' | 'supporter' | 'manager';

interface BulkRemoveRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUserIds: string[];
  onSuccess: () => void;
}

const roles: { value: AppRole; label: string; description: string }[] = [
  { value: 'tenant', label: 'Tenant', description: 'Remove tenant access' },
  { value: 'agent', label: 'Agent', description: 'Remove agent privileges' },
  { value: 'landlord', label: 'Landlord', description: 'Remove landlord access' },
  { value: 'supporter', label: 'Supporter', description: 'Remove supporter/investor access' },
  { value: 'manager', label: 'Manager', description: 'Remove administrative access' },
];

export default function BulkRemoveRoleDialog({
  open,
  onOpenChange,
  selectedUserIds,
  onSuccess
}: BulkRemoveRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState<AppRole>('tenant');
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    if (!selectedRole) {
      toast.error('Please select a role to remove');
      return;
    }

    setRemoving(true);
    try {
      let successCount = 0;
      let skipCount = 0;

      for (const userId of selectedUserIds) {
        // Check if user has this role
        const { data: existingRole } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', userId)
          .eq('role', selectedRole)
          .single();

        if (!existingRole) {
          skipCount++;
          continue;
        }

        // Remove the role
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', selectedRole);

        if (!error) {
          successCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Removed "${selectedRole}" role from ${successCount} user${successCount > 1 ? 's' : ''}`);
      }
      if (skipCount > 0) {
        toast.info(`${skipCount} user${skipCount > 1 ? 's' : ''} didn't have this role`);
      }
      if (successCount === 0 && skipCount === selectedUserIds.length) {
        toast.warning('No users had this role to remove');
      }

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error removing roles:', error);
      toast.error('Failed to remove roles');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserMinus className="h-5 w-5 text-destructive" />
            Remove Role
          </DialogTitle>
          <DialogDescription>
            Remove a role from {selectedUserIds.length} selected user{selectedUserIds.length > 1 ? 's' : ''}.
            Users who don't have this role will be skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Label className="text-sm font-medium mb-3 block">Select Role to Remove</Label>
          <RadioGroup
            value={selectedRole}
            onValueChange={(value) => setSelectedRole(value as AppRole)}
            className="space-y-2"
          >
            {roles.map((role) => (
              <div
                key={role.value}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                  selectedRole === role.value
                    ? 'border-destructive bg-destructive/5'
                    : 'border-border hover:border-destructive/30'
                }`}
                onClick={() => setSelectedRole(role.value)}
              >
                <RadioGroupItem value={role.value} id={`remove-${role.value}`} className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor={`remove-${role.value}`} className="font-medium cursor-pointer">
                    {role.label}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {role.description}
                  </p>
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleRemove} disabled={removing}>
            {removing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Removing...
              </>
            ) : (
              <>
                <ShieldX className="h-4 w-4 mr-2" />
                Remove Role
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

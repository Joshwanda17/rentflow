import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { UserCog, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type AppRole = 'tenant' | 'agent' | 'landlord' | 'supporter' | 'manager';

interface BulkAssignRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUserIds: string[];
  onSuccess: () => void;
}

const roles: { value: AppRole; label: string; description: string }[] = [
  { value: 'tenant', label: 'Tenant', description: 'Can request rent assistance and make payments' },
  { value: 'agent', label: 'Agent', description: 'Can manage deposits, withdrawals, and loans' },
  { value: 'landlord', label: 'Landlord', description: 'Can receive rent payments and rate tenants' },
  { value: 'supporter', label: 'Supporter', description: 'Can invest and fund rent requests' },
  { value: 'manager', label: 'Manager', description: 'Full administrative access' },
];

export default function BulkAssignRoleDialog({
  open,
  onOpenChange,
  selectedUserIds,
  onSuccess
}: BulkAssignRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState<AppRole>('tenant');
  const [assigning, setAssigning] = useState(false);

  const handleAssign = async () => {
    if (!selectedRole) {
      toast.error('Please select a role');
      return;
    }

    setAssigning(true);
    try {
      // For each user, check if they already have this role, if not add it
      let successCount = 0;
      let skipCount = 0;

      for (const userId of selectedUserIds) {
        // Check if user already has this role
        const { data: existingRole } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', userId)
          .eq('role', selectedRole)
          .single();

        if (existingRole) {
          skipCount++;
          continue;
        }

        // Add the role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: selectedRole });

        if (!error) {
          successCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Assigned "${selectedRole}" role to ${successCount} user${successCount > 1 ? 's' : ''}`);
      }
      if (skipCount > 0) {
        toast.info(`${skipCount} user${skipCount > 1 ? 's' : ''} already had this role`);
      }

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error assigning roles:', error);
      toast.error('Failed to assign roles');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            Assign Role
          </DialogTitle>
          <DialogDescription>
            Add a role to {selectedUserIds.length} selected user{selectedUserIds.length > 1 ? 's' : ''}.
            Users who already have this role will be skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Label className="text-sm font-medium mb-3 block">Select Role</Label>
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
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30'
                }`}
                onClick={() => setSelectedRole(role.value)}
              >
                <RadioGroupItem value={role.value} id={role.value} className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor={role.value} className="font-medium cursor-pointer">
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
          <Button onClick={handleAssign} disabled={assigning}>
            {assigning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 mr-2" />
                Assign Role
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

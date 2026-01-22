import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { UserCog, Loader2, ShieldCheck, ClipboardList } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Progress } from '@/components/ui/progress';

type AppRole = 'tenant' | 'agent' | 'landlord' | 'supporter' | 'manager';

interface BulkAssignRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUserIds: string[];
  selectedUserNames?: Record<string, string>;
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
  selectedUserNames = {},
  onSuccess
}: BulkAssignRoleDialogProps) {
  const { user } = useAuth();
  const [selectedRole, setSelectedRole] = useState<AppRole>('tenant');
  const [assigning, setAssigning] = useState(false);
  const [progress, setProgress] = useState(0);

  const logRoleChange = async (userId: string, role: string, userName?: string) => {
    if (!user?.id) return;
    
    try {
      await supabase.from('audit_logs').insert({
        action_type: 'role_added',
        table_name: 'user_roles',
        record_id: userId,
        performed_by: user.id,
        new_values: { role },
        metadata: { 
          user_name: userName || 'Unknown',
          bulk_action: true,
          total_users: selectedUserIds.length
        }
      });
    } catch (error) {
      console.error('Failed to log role change:', error);
    }
  };

  const handleAssign = async () => {
    if (!selectedRole) {
      toast.error('Please select a role');
      return;
    }

    setAssigning(true);
    setProgress(0);
    
    try {
      let successCount = 0;
      let skipCount = 0;
      const totalUsers = selectedUserIds.length;

      for (let i = 0; i < selectedUserIds.length; i++) {
        const userId = selectedUserIds[i];
        
        // Check if user already has this role
        const { data: existingRole } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', userId)
          .eq('role', selectedRole)
          .single();

        if (existingRole) {
          skipCount++;
        } else {
          // Add the role
          const { error } = await supabase
            .from('user_roles')
            .insert({ user_id: userId, role: selectedRole });

          if (!error) {
            successCount++;
            // Log to audit
            await logRoleChange(userId, selectedRole, selectedUserNames[userId]);
          }
        }
        
        setProgress(Math.round(((i + 1) / totalUsers) * 100));
      }

      if (successCount > 0) {
        toast.success(`Assigned "${selectedRole}" role to ${successCount} user${successCount > 1 ? 's' : ''}`, {
          description: 'Changes logged to audit trail'
        });
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
      setProgress(0);
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

        {assigning && (
          <div className="space-y-2 pb-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" />
                Processing & logging changes...
              </span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assigning}>
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

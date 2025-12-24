import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Home, Users, Wallet, Building2 } from 'lucide-react';
import { AppRole } from '@/hooks/useAuth';

interface AddRoleDialogProps {
  availableRoles: AppRole[];
  onAddRole: (role: AppRole) => Promise<{ error: Error | null }>;
}

const allRoles: { value: AppRole; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'tenant', label: 'Tenant', description: 'Request rent facilitation', icon: <Home className="h-4 w-4" /> },
  { value: 'agent', label: 'Agent', description: 'Connect tenants to the platform', icon: <Users className="h-4 w-4" /> },
  { value: 'landlord', label: 'Landlord', description: 'Receive rent payments', icon: <Building2 className="h-4 w-4" /> },
  { value: 'supporter', label: 'Supporter', description: 'Fund rent requests', icon: <Wallet className="h-4 w-4" /> },
];

export default function AddRoleDialog({ availableRoles, onAddRole }: AddRoleDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AppRole | ''>('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const missingRoles = allRoles.filter(r => !availableRoles.includes(r.value));

  if (missingRoles.length === 0) {
    return null;
  }

  const handleAddRole = async () => {
    if (!selectedRole) return;
    
    setIsLoading(true);
    const { error } = await onAddRole(selectedRole);
    setIsLoading(false);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Role Added',
        description: `You now have access to the ${selectedRole} dashboard`
      });
      setOpen(false);
      setSelectedRole('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Another Role</DialogTitle>
          <DialogDescription>
            Expand your capabilities by adding another role to your account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Select Role</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {missingRoles.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      {opt.icon}
                      <div className="flex flex-col">
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button 
            onClick={handleAddRole} 
            className="w-full" 
            disabled={!selectedRole || isLoading}
          >
            {isLoading ? 'Adding...' : 'Add Role'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
